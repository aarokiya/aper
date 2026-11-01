/**
 * Transparent relevance scoring for Handshake campus events against the
 * student's local career profile. Pure and isomorphic: every point comes with
 * a reason the UI shows, so the ranking is never a black box.
 */
import { z } from 'zod';

/** Unknown keys (e.g. retired profile fields) are stripped, not rejected. */
export const careerProfileSchema = z.object({
  interests: z.array(z.string().trim().min(1).max(60)).max(30),
  excludes: z.array(z.string().trim().min(1).max(60)).max(30),
});
export type CareerProfile = z.infer<typeof careerProfileSchema>;

/** Empty until the student (or `pnpm profile:apply`) supplies interests. */
export const DEFAULT_CAREER_PROFILE: CareerProfile = {
  interests: [],
  excludes: [],
};

export type RelevanceReason = { label: string; points: number };
export type Relevance = { score: number; reasons: RelevanceReason[] };

/** Related phrasings so "software engineering" also finds "SWE intern". */
const INTEREST_SYNONYMS: Record<string, string[]> = {
  'software engineering': [
    'software engineer',
    'software development',
    'software developer',
    'swe',
    'full stack',
    'full-stack',
    'backend',
    'frontend',
  ],
  'machine learning': [
    'ml',
    'artificial intelligence',
    'ai',
    'deep learning',
    'llm',
  ],
  data: ['data science', 'data analyst', 'analytics', 'data engineer'],
  research: ['undergraduate research', 'research assistant', 'lab'],
  product: ['product manager', 'product management', 'apm'],
  'computer science': ['cs', 'computing'],
  security: ['cybersecurity', 'infosec'],
  design: ['ux', 'ui/ux', 'user experience', 'industrial design', 'product design'],
  'mechanical engineering': ['mechanical engineer', 'mechanical', 'manufacturing'],
  'aerospace engineering': ['aerospace', 'aerospace engineer', 'aviation', 'space'],
  'civil engineering': ['civil engineer', 'structural', 'construction', 'transportation'],
  'industrial engineering': ['industrial engineer', 'supply chain', 'operations research', 'logistics'],
  'biomedical engineering': ['biomedical', 'bme', 'medical device', 'medical devices'],
  'chemical engineering': ['chemical engineer', 'chbe', 'process engineering'],
  'electrical engineering': ['electrical engineer', 'ece', 'hardware', 'embedded'],
  business: ['business analyst', 'marketing', 'sales'],
  consulting: ['consultant', 'management consulting', 'strategy'],
  finance: ['investment banking', 'financial analyst', 'fintech', 'accounting'],
  'public policy': ['policy', 'government', 'public sector', 'nonprofit'],
  healthcare: ['health care', 'pre-med', 'premed', 'medicine', 'clinical', 'hospital'],
  'data science': ['data scientist', 'data analyst', 'analytics', 'statistics'],
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word-boundary match that tolerates inflections ("engineering" finds
 * "engineer", "engineers"); terms of three letters or fewer match exactly.
 */
export function mentions(text: string, term: string) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;
  const stripped = normalized.replace(/(ing|ers|er|es|s)$/, '');
  const stem = stripped.length >= 4 ? stripped : normalized;
  const body =
    normalized.length <= 3
      ? escape(normalized)
      : `${escape(stem)}(?:s|es|ing|ed|er|ers|al|ists?)?`;
  return new RegExp(`(^|[^a-z0-9])${body}(?=$|[^a-z0-9])`, 'i').test(text);
}

function interestMatches(text: string, interest: string) {
  return [interest, ...(INTEREST_SYNONYMS[interest.toLowerCase()] ?? [])].some(
    (term) => mentions(text, term),
  );
}

const DAY_MS = 86_400_000;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function total(reasons: RelevanceReason[]): Relevance {
  const sorted = [...reasons].sort(
    (a, b) => Math.abs(b.points) - Math.abs(a.points),
  );
  return {
    score: clamp(reasons.reduce((sum, reason) => sum + reason.points, 0)),
    reasons: sorted,
  };
}

function rankReason(rank: number | null, weight: number) {
  if (!rank || rank < 1) return null;
  const points = Math.max(0, weight - (rank - 1) * (weight / 40));
  if (points <= 0) return null;
  return {
    label:
      rank <= 10 ? `ranked #${rank} by Handshake` : 'recommended by Handshake',
    points: Math.round(points * 10) / 10,
  };
}

function interestReasons(
  profile: CareerProfile,
  strong: string,
  weak: string,
  cap: number,
): RelevanceReason[] {
  const strongHits = profile.interests.filter((interest) =>
    interestMatches(strong, interest),
  );
  const weakHits = profile.interests.filter(
    (interest) =>
      !strongHits.includes(interest) && interestMatches(weak, interest),
  );
  const hits = [...strongHits, ...weakHits];
  if (!hits.length) return [];
  const points = Math.min(cap, strongHits.length * 12 + weakHits.length * 5);
  return [{ label: `matches ${listJoin(hits.slice(0, 3))}`, points }];
}

function excludeReasons(
  profile: CareerProfile,
  title: string,
  requirements: string,
): RelevanceReason[] {
  return profile.excludes.flatMap((term) => {
    // "PhD only" also catches "PhD students only", "PhD candidates".
    const core = term.replace(/\bonly\b/i, '').trim() || term;
    if (mentions(title, core))
      return [{ label: `title mentions ${core}`, points: -30 }];
    if (mentions(requirements, core))
      return [{ label: `requirements mention ${core}`, points: -10 }];
    return [];
  });
}

const REQUIREMENT_CUE =
  /\b(require|must|eligib|class (year|of)|year|graduat|pursuing|enrolled|candidates?|students?|open to|seeking|qualifications?)\w*/i;

/** Sentences that state who can attend, so "meet senior engineers" doesn't count. */
function requirementText(description: string | null) {
  return (description ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => REQUIREMENT_CUE.test(sentence))
    .join('\n');
}

export function listJoin(items: string[]) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export type ScorableEvent = {
  title: string;
  category: string | null;
  descriptionText: string | null;
  organizerName: string | null;
  location: string | null;
  eventFormat: string | null;
  startsAt: string | null;
  postedBySchool: boolean;
  rsvpStatus: string | null;
  listRank: number | null;
};

const CATEGORY_POINTS: Record<string, number> = {
  'Career fair': 18,
  'Tech talk': 14,
  'Info session': 12,
  Workshop: 12,
  Panel: 12,
  Networking: 10,
};

const ON_CAMPUS =
  /\bgeorgia tech\b|\bgt\b|\bcampus\b|\bklaus\b|\bculc\b|\bstudent center\b|\bexhibition hall\b|\bclough\b|\bcoda\b|\btech square\b|\bferst\b|\bmcCamish\b|\bhowey\b|\bvan leer\b|\bskiles\b|\bcrc\b/i;

export function scoreEvent(
  event: ScorableEvent,
  profile: CareerProfile,
  now: Date,
): Relevance {
  const reasons: RelevanceReason[] = [];
  const body = `${event.descriptionText ?? ''}\n${event.organizerName ?? ''}`;

  const rank = rankReason(event.listRank, 15);
  if (rank) reasons.push(rank);

  const categoryPoints = event.category ? CATEGORY_POINTS[event.category] : 0;
  if (categoryPoints && event.category)
    reasons.push({
      label: event.category.toLowerCase(),
      points: categoryPoints,
    });

  reasons.push(...interestReasons(profile, event.title, body, 25));

  if (event.eventFormat === 'in-person' || event.eventFormat === 'hybrid') {
    if (ON_CAMPUS.test(event.location ?? ''))
      reasons.push({ label: 'on campus', points: 8 });
    else reasons.push({ label: 'in person', points: 4 });
  }

  if (event.startsAt) {
    const until = (Date.parse(event.startsAt) - now.getTime()) / DAY_MS;
    if (until >= -0.25 && until <= 2)
      reasons.push({
        label: until < 1 ? 'happening soon' : 'in the next two days',
        points: 14,
      });
    else if (until > 2 && until <= 14)
      reasons.push({ label: 'within two weeks', points: 10 });
  }

  if (event.postedBySchool)
    reasons.push({ label: 'posted by Georgia Tech', points: 8 });
  if (event.rsvpStatus === 'Registered')
    reasons.push({ label: "you're registered", points: 6 });

  reasons.push(
    ...excludeReasons(
      profile,
      event.title,
      requirementText(event.descriptionText),
    ),
  );
  return total(reasons);
}

/** Positive reasons first as a sentence; negatives kept separate for the UI. */
export function explainRelevance(reasons: RelevanceReason[], limit = 4) {
  const positive = reasons
    .filter((reason) => reason.points > 0)
    .slice(0, limit);
  const negative = reasons.filter((reason) => reason.points < 0).slice(0, 2);
  const sentence = (items: RelevanceReason[]) => {
    // A plain comma list: labels mix verbs and nouns, so no closing "and".
    const text = items.map((reason) => reason.label).join(', ');
    return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : '';
  };
  return { why: sentence(positive), caution: sentence(negative) };
}
