/**
 * Pure parsers for the HTML Handshake renders to a signed-in student. The
 * provider hands them `page.content()`; tests hand them fixtures. Every field
 * prefers the most stable contract available: JSON-LD, then OpenGraph meta,
 * then semantic headings and canonical links, then text heuristics.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import { parseEventWhen, wallTimeToIso } from '@/lib/handshake/dates';

export const HANDSHAKE_ORIGIN = 'https://app.joinhandshake.com';

export type ListingCandidate = {
  sourceId: string;
  sourceUrl: string;
  /** 1-based position in Handshake's own ordering */
  rank: number;
  cardText: string | null;
  /** Organizer logo shown on the card */
  logoUrl: string | null;
};

export const EVENT_CATEGORIES = [
  'Career fair',
  'Info session',
  'Tech talk',
  'Workshop',
  'Panel',
  'Networking',
  'Club meeting',
  'Other',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type ParsedEvent = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  organizerName: string | null;
  employerSourceId: string | null;
  category: EventCategory;
  eventType: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  whenLabel: string | null;
  location: string | null;
  isVirtual: boolean;
  eventFormat: 'in-person' | 'virtual' | 'hybrid' | null;
  rsvpStatus: string | null;
  postedBySchool: boolean;
  descriptionText: string;
  imageUrl: string | null;
  logoUrl: string | null;
};

type JsonObject = Record<string, unknown>;

export const squash = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() || null;

/** Block-aware text: one trimmed line per rendered block, blanks removed. */
function linesOf(element: HTMLElement | null | undefined) {
  if (!element) return [];
  return element.structuredText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Paragraph-preserving text for descriptions. */
function proseOf(html: string) {
  const root = parse(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h\d|div)>/gi, '</$1>\n'),
  );
  return root.structuredText
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function jsonLdObjects(root: HTMLElement): JsonObject[] {
  const objects: JsonObject[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const object = value as JsonObject;
      if (Array.isArray(object['@graph'])) visit(object['@graph']);
      objects.push(object);
    }
  };
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      visit(JSON.parse(script.rawText));
    } catch {
      // Malformed structured data falls through to DOM heuristics.
    }
  }
  return objects;
}

function ldOfType(root: HTMLElement, type: RegExp) {
  return jsonLdObjects(root).find((object) => {
    const value = object['@type'];
    return (Array.isArray(value) ? value : [value]).some(
      (item) => typeof item === 'string' && type.test(item),
    );
  });
}

const ldString = (value: unknown): string | null =>
  typeof value === 'string'
    ? squash(value)
    : value && typeof value === 'object' && 'name' in value
      ? ldString((value as JsonObject).name)
      : null;

function ldImage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return ldImage(value[0]);
  if (value && typeof value === 'object')
    return ldImage(
      (value as JsonObject).url ?? (value as JsonObject).contentUrl,
    );
  return null;
}

function meta(root: HTMLElement, key: string) {
  const element =
    root.querySelector(`meta[property="${key}"]`) ??
    root.querySelector(`meta[name="${key}"]`);
  return squash(element?.getAttribute('content'));
}

const stripSiteSuffix = (value: string | null) =>
  value?.replace(/\s*[|–-]\s*Handshake\s*$/i, '').trim() || null;

/**
 * Finds a titled section ("About this event", "Location") by its heading
 * and returns its content lines without the heading. Works whether content
 * is nested beside the heading or follows it as flat siblings.
 */
function section(root: HTMLElement, title: RegExp) {
  const headingElement = root
    .querySelectorAll('h2, h3, h4')
    .find((element) => title.test(squash(element.text) ?? ''));
  if (!headingElement) return null;
  const headingText = squash(headingElement.text) ?? '';
  let container: HTMLElement = headingElement;
  // Climb while no other heading of the same or higher rank joins in; lower
  // ranks (e.g. an h4 inside a description) are content.
  const rank = Number(headingElement.tagName.slice(1));
  while (container.parentNode) {
    const parent = container.parentNode;
    const peers = parent
      .querySelectorAll('h1, h2, h3, h4')
      .filter((element) => Number(element.tagName.slice(1)) <= rank);
    if (peers.length > 1) break;
    container = parent;
  }
  if (container !== headingElement) {
    const lines = linesOf(container);
    const index = lines.indexOf(headingText);
    return {
      element: container,
      lines: index >= 0 ? lines.slice(index + 1) : lines,
    };
  }
  const lines: string[] = [];
  const holder = parse('<div></div>').firstElementChild as HTMLElement;
  let sibling = headingElement.nextElementSibling;
  while (sibling && !/^H[1-4]$/.test(sibling.tagName)) {
    lines.push(...linesOf(sibling));
    holder.appendChild(sibling.clone());
    sibling = sibling.nextElementSibling;
  }
  return { element: holder, lines };
}

function linkId(element: HTMLElement, pattern: RegExp) {
  return element.getAttribute('href')?.match(pattern)?.[1] ?? null;
}

const EMPLOYER_LINK = 'a[href*="/e/"], a[href*="/employers/"]';
const EMPLOYER_ID = /\/(?:e|employers)\/(\d+)/;

function employerLink(root: HTMLElement) {
  for (const link of root.querySelectorAll(EMPLOYER_LINK)) {
    // The link wraps name and industry as separate lines ("Veeva Systems",
    // "Internet & Software"); the first line is the employer.
    const name =
      squash(link.getAttribute('aria-label')) ??
      linesOf(link)[0] ??
      squash(link.querySelector('img')?.getAttribute('alt'));
    if (name && !/^(view|see|follow|message)\b/i.test(name))
      return {
        name: name.replace(/\s+logo$/i, ''),
        sourceId: linkId(link, EMPLOYER_ID),
      };
  }
  return null;
}

/** Images whose path is an organizer logo (employer or school), never avatars or banners. */
const LOGO_SRC = /-logo-data/;

function imageSources(root: HTMLElement) {
  return root
    .querySelectorAll('img')
    .map((img) => ({
      src: img.getAttribute('src') ?? '',
      alt: squash(img.getAttribute('alt')),
    }))
    .filter((img) => img.src.startsWith('https://'));
}

/**
 * The page header shows the poster's logo first, which is the school for
 * school-posted employer events, so a known employer id picks its own logo;
 * otherwise the logo whose alt names the organizer.
 */
function organizerLogo(
  root: HTMLElement,
  employerSourceId: string | null,
  organizerName: string | null,
) {
  const logos = imageSources(root).filter((img) => LOGO_SRC.test(img.src));
  if (employerSourceId) {
    const own = logos.find((img) =>
      img.src.includes(`/assets/institutions/${employerSourceId}/`),
    );
    if (own) return own.src;
  }
  const name = organizerName?.toLowerCase();
  if (!name) return null;
  return (
    logos.find(
      (img) =>
        img.alt
          ?.replace(/^featured employer\s+/i, '')
          .replace(/\s+logo$/i, '')
          .toLowerCase() === name,
    )?.src ?? null
  );
}

const EVENT_ID = /\/(?:stu\/)?events\/(\d+)/;

/** Collects event ids in Handshake's order from an events list page. */
export function parseListing(html: string): ListingCandidate[] {
  const seen = new Set<string>();
  const candidates: ListingCandidate[] = [];
  for (const link of parse(html).querySelectorAll('a[href*="/events/"]')) {
    const sourceId = linkId(link, EVENT_ID);
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    // The card is the largest ancestor that links to no other event.
    let card: HTMLElement = link;
    for (
      let parent = card.parentNode;
      parent?.parentNode &&
      parent
        .querySelectorAll('a[href*="/events/"]')
        .every((other) => [sourceId, null].includes(linkId(other, EVENT_ID)));
      parent = parent.parentNode
    )
      card = parent;
    candidates.push({
      sourceId,
      sourceUrl: `${HANDSHAKE_ORIGIN}/stu/events/${sourceId}`,
      rank: candidates.length + 1,
      cardText: squash(
        link.getAttribute('aria-label') ?? linesOf(link).join(' · '),
      ),
      logoUrl:
        imageSources(card).find((img) => LOGO_SRC.test(img.src))?.src ?? null,
    });
  }
  return candidates;
}

function ldLocation(value: unknown): string | null {
  if (Array.isArray(value)) return ldLocation(value[0]);
  if (!value || typeof value !== 'object') return ldString(value);
  const object = value as JsonObject;
  const address = (object.address ?? object) as JsonObject;
  if (typeof address === 'string') return squash(address);
  const parts = [
    object.name,
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
  ]
    .map((part) => (typeof part === 'string' ? squash(part) : null))
    .filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(', ') || null;
}

const CATEGORY_RULES: Array<[EventCategory, RegExp]> = [
  [
    'Career fair',
    /\bcareer (fair|expo)\b|\bjob fair\b|\b(internship|recruiting) fair\b|\ball-majors fair\b/i,
  ],
  [
    'Tech talk',
    /\btech(nical)? talks?\b|\bengineering talk\b|\blightning talks?\b/i,
  ],
  ['Panel', /\bpanel\b|\bfireside chat\b/i],
  [
    'Info session',
    /\binfo(rmation(al)?)? sessions?\b|\bemployer presentation\b|\bopen house\b|\bcompany presentation\b/i,
  ],
  [
    'Workshop',
    /\bworkshop\b|\bbootcamp\b|\bresume (review|critique)\b|\bmock interviews?\b|\bhands-on\b|\btraining\b/i,
  ],
  [
    'Networking',
    /\bnetworking\b|\bmeet (and|&) greet\b|\bmixer\b|\breception\b|\bcoffee chats?\b|\b(an )?evening with\b|\bsocial\b|\bkick-?off\b/i,
  ],
  ['Club meeting', /\b(weekly|general( body)?) meetings?\b|\bgbm\b|\bclub\b/i],
];

/** Maps title/labels/description to one of {@link EVENT_CATEGORIES}. */
export function categorizeEvent(...texts: Array<string | null | undefined>) {
  for (const text of texts) {
    if (!text) continue;
    const rule = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
    if (rule) return rule[0];
  }
  return 'Other' as const;
}

const EVENT_TYPE_LABEL =
  /^(career fair|virtual fair|info(rmation)? session|employer presentation|workshop|networking|panel|speaker|tech talk|meetup|meet-?up|social|class presentation|interview|recruiting event|webinar|other)$/i;
const SCHOOL_RE =
  /\b(georgia (institute of technology|tech)|career center|c2d|center for career discovery)\b/i;
const LOCATION_HINT =
  /\b(room|rm\.?|hall|building|bldg|center|centre|auditorium|library|klaus|culc|ballroom|suite|floor|campus|atlanta|ga \d{5}|[a-z]+,\s*ga\b|street|st\.|ave(nue)?|road|blvd|zoom|teams|google meet|online|virtual)\b/i;
const WHEN_HINT =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\btoday\b|\btomorrow\b/i;
/** Section-level page headings that are not an item's own title. */
const GENERIC_HEADING = /^(events?|career fairs?|handshake)$/i;
/** The attendance line under an event's date ("Virtual", "In-person"). */
const FORMAT_LINE = /^(virtual|in[- ]person|hybrid)$/i;
/** Handshake's event label line, e.g. "General" or "HiringEmployer info". */
const LABEL_LINE =
  /^(general|hiring|career fair|virtual fair|info(rmation)? session|employer presentation|workshop|networking|panel|speaker|tech talk|meet-?up|social|webinar)(\s*employer info)?$/i;

function rsvpFrom(buttons: string[], lines: string[]) {
  const joined = [...buttons, ...lines].join(' \n ');
  if (
    /\b(you['’]?re|you are) (registered|going|attending|signed up)\b|\bcancel (rsvp|registration)\b|\bunregister\b/i.test(
      joined,
    ) ||
    buttons.some((text) => /^(registered|going|attending)$/i.test(text))
  )
    return 'Registered';
  if (
    /\b(you['’]?re|you are) on (the )?wait ?list\b|\bleave (the )?wait ?list\b/i.test(
      joined,
    )
  )
    return 'On waitlist';
  if (/\bjoin (the )?wait ?list\b/i.test(joined)) return 'Waitlist open';
  if (
    /\bregistration (is )?closed\b|\bevent is full\b|\brsvp closed\b|\bno longer accepting\b/i.test(
      joined,
    )
  )
    return 'Registration closed';
  if (
    buttons.some((text) =>
      /^(rsvp|register|sign up|rsvp now|register now)\b/i.test(text),
    )
  )
    return 'Open';
  return null;
}

/** ISO-ish structured dates; offset-less values are wall times in `timeZone`. */
function ldDate(value: unknown, timeZone: string) {
  if (typeof value !== 'string') return null;
  const local = value
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/,
    );
  if (local)
    return wallTimeToIso(
      timeZone,
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4] ?? 0),
      Number(local[5] ?? 0),
    );
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Parses an event detail page. Throws when the title is missing. */
export function parseEventDetail(
  html: string,
  candidate: { sourceId: string; sourceUrl: string },
  options: { now?: Date; postedBySchool?: boolean } = {},
): ParsedEvent {
  const now = options.now ?? new Date();
  const root = parse(html);
  const ld = ldOfType(root, /Event$/i);
  // The page wraps the event in an "Events" h1, so skip generic headings and
  // fall back to the document title ("<event> | Handshake").
  const pageHeading = root
    .querySelectorAll('h1')
    .map((element) => squash(element.text))
    .find(
      (text): text is string => Boolean(text) && !GENERIC_HEADING.test(text!),
    );
  const title =
    ldString(ld?.name) ??
    pageHeading ??
    stripSiteSuffix(squash(root.querySelector('title')?.text)) ??
    stripSiteSuffix(meta(root, 'og:title'));
  if (!title)
    throw new Error(
      `Event ${candidate.sourceId}: title was not present in the rendered page.`,
    );
  const main = root.querySelector('main') ?? root;
  const lines = linesOf(main);
  const top = lines.slice(0, 50);
  /*
   * Handshake renders the facts as a block right under the title:
   *   ← back · <organizer> · <title> · <when> · <Virtual|In-person|Hybrid> ·
   *   [address] · [room] · (the same block again for small screens) ·
   *   <label, e.g. "General" or "Hiring"> · Register
   * Reading that block avoids picking up "Similar events" further down.
   */
  const at = lines.indexOf(title);
  const header = at >= 0 ? lines.slice(at + 1, at + 16) : top;
  const before = at > 0 ? lines[at - 1] : null;
  const headerOrganizer =
    before && !/^(←|back\b)/i.test(before) && !GENERIC_HEADING.test(before)
      ? before
      : null;

  const employer = employerLink(root);
  const hostLine = top
    .map(
      (line) =>
        line.match(/^(?:hosted|posted|presented|organized) by:?\s+(.+)$/i)?.[1],
    )
    .find(Boolean);
  const organizerName =
    ldString(ld?.organizer) ??
    employer?.name ??
    headerOrganizer ??
    squash(hostLine) ??
    null;

  const timeElements = root
    .querySelectorAll('time[datetime]')
    .map((element) => element.getAttribute('datetime') ?? '')
    .filter(Boolean);
  const hasTime = (line: string) =>
    WHEN_HINT.test(line) &&
    /\d{1,2}(:\d{2})?\s*[ap]\.?\s?m\b|\ball day\b/i.test(line) &&
    line.length < 140;
  const whenLine =
    header.find(hasTime) ??
    top.find(hasTime) ??
    top.find((line) => WHEN_HINT.test(line) && line.length < 100) ??
    null;
  const parsedWhen = parseEventWhen(whenLine, { now });
  const timeZone = parsedWhen.timeZone;
  // <time datetime> carries only the date (MM/DD/YYYY); the line has the time.
  const startsAt =
    ldDate(ld?.startDate, timeZone) ??
    parsedWhen.startsAt ??
    ldDate(timeElements[0], timeZone);
  const endsAt =
    ldDate(ld?.endDate, timeZone) ??
    parsedWhen.endsAt ??
    (parsedWhen.startsAt ? null : ldDate(timeElements[1], timeZone));

  const mode =
    typeof ld?.eventAttendanceMode === 'string' ? ld.eventAttendanceMode : '';
  const formatIndex = header.findIndex((line) => FORMAT_LINE.test(line));
  const formatLine = formatIndex >= 0 ? header[formatIndex] : null;
  const formatText = (formatLine ? [formatLine] : top).join(' \n ');
  const hybrid = /Mixed/i.test(mode) || /\bhybrid\b/i.test(formatText);
  const virtual =
    /Online/i.test(mode) ||
    /\b(virtual( event)?|online|zoom|microsoft teams|google meet|webinar)\b/i.test(
      formatText,
    );
  const inPerson =
    /Offline/i.test(mode) || /\bin[- ]person\b|\bon campus\b/i.test(formatText);
  // Address then room follow the format line; room first reads better on campus.
  const placeLines: string[] = [];
  if (formatIndex >= 0)
    for (const line of header.slice(formatIndex + 1, formatIndex + 3)) {
      // Stop at the repeated date, labels, and buttons such as "RSVP".
      const placeLike = LOCATION_HINT.test(line) || line.includes(',');
      if (!placeLike || line === whenLine || LABEL_LINE.test(line)) break;
      placeLines.push(line.replace(/,\s*United States$/i, ''));
    }
  const locationSection = section(root, /^(location|where)$/i);
  // A header that says "Virtual" has no place; the format label already says so.
  const headerVirtual = formatLine !== null && /^virtual$/i.test(formatLine);
  const location =
    ldLocation(ld?.location) ??
    (placeLines.length ? [...placeLines].reverse().join(' · ') : null) ??
    (headerVirtual
      ? null
      : (locationSection?.lines[0] ??
        top.find(
          (line) =>
            line !== title &&
            line !== whenLine &&
            LOCATION_HINT.test(line) &&
            line.length < 120 &&
            !/^(hosted|posted) by/i.test(line),
        ) ??
        null));
  const eventFormat = hybrid
    ? ('hybrid' as const)
    : virtual && !inPerson
      ? ('virtual' as const)
      : inPerson || location
        ? ('in-person' as const)
        : null;

  const labels = root
    .querySelectorAll(
      '[data-hook*="tag"], [class*="tag"], [class*="badge"], [class*="pill"]',
    )
    .map((element) => squash(element.text))
    .filter((value): value is string => value !== null && value.length < 40);
  const headerLabel = header
    .find((line) => LABEL_LINE.test(line))
    ?.replace(/employer info$/i, '')
    .trim();
  const eventType =
    labels.find((label) => EVENT_TYPE_LABEL.test(label)) ??
    top.find((line) => EVENT_TYPE_LABEL.test(line)) ??
    headerLabel ??
    null;

  const descriptionSection = section(
    root,
    /^(about( this event)?|description|event details|details|what to expect|what you['’]ll get out of it)$/i,
  );
  const descriptionText =
    (typeof ld?.description === 'string' ? proseOf(ld.description) : '') ||
    descriptionSection?.lines
      .filter((line) => !/^show (more|less)$/i.test(line))
      .join('\n') ||
    meta(root, 'og:description') ||
    '';

  const buttons = root
    .querySelectorAll('button, a[role="button"], [aria-pressed]')
    .map((element) =>
      squash(element.getAttribute('aria-label') ?? element.text),
    )
    .filter((value): value is string => Boolean(value));
  const statusLines = top.filter((line) =>
    /\b(registered|wait ?list|registration|rsvp|event is full)\b/i.test(line),
  );

  return {
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    title,
    organizerName,
    employerSourceId: employer?.sourceId ?? null,
    category: categorizeEvent(eventType, title, descriptionText.slice(0, 600)),
    eventType: eventType ? squash(eventType) : null,
    startsAt,
    endsAt,
    timeZone,
    whenLabel: whenLine,
    location,
    isVirtual: eventFormat === 'virtual',
    eventFormat,
    rsvpStatus: rsvpFrom(buttons, statusLines),
    postedBySchool:
      Boolean(options.postedBySchool) ||
      (!employer && SCHOOL_RE.test(organizerName ?? '')) ||
      top.some((line) => /^posted by\b/i.test(line) && SCHOOL_RE.test(line)),
    descriptionText,
    imageUrl:
      ldImage(ld?.image) ??
      meta(root, 'og:image') ??
      imageSources(root).find((img) =>
        img.src.includes(`/assets/events/${candidate.sourceId}/`),
      )?.src ??
      null,
    logoUrl:
      ldImage((ld?.organizer as JsonObject | undefined)?.logo) ??
      organizerLogo(root, employer?.sourceId ?? null, organizerName),
  };
}
