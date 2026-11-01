/**
 * Shapes of the imported Claude "Study Hub" artifact (`window.COURSES`) and of
 * the local study progress that _aper persists per course. HTML-bearing fields
 * are noted; everything else is plain text.
 */

/** `[label, url, kind?]` — kind is "video" | "notes" | "free" when present. */
export type StudyRef = [string, string, string?];

export type StudyLecturePart = {
  h: string;
  /** HTML */ b: string;
  /** quick checks shown under the part's notes */
  quiz?: StudyQuickCheck[];
};

export type StudyLecture = {
  title: string;
  when: string;
  sec: string;
  parts: StudyLecturePart[];
};

export type StudyPractice = {
  /** HTML */ q: string;
  type: 'mc' | 'num' | 'text' | 'set';
  /** mc: option index; num: number; text/set: accepted answers */
  a: number | string | string[];
  /** HTML */ hint?: string;
  /** HTML */ sol?: string;
  /** HTML options for mc */ opts?: string[];
  src?: string;
};

/**
 * A quick check under a lecture part: a practice item (same checking rules)
 * whose mc options may each carry a `why`, shown once that option is picked.
 */
export type StudyQuickCheck = StudyPractice & {
  /** HTML, one per mc option */ why?: string[];
};

export type StudyStudio = {
  /** HTML */ q: string;
  /** HTML steps */ steps: string[];
  /** HTML */ tip?: string;
  /** HTML */ hint?: string;
  title?: string;
  src?: string;
};

export type StudyCard = {
  /** HTML front */ f: string;
  /** HTML back */ b: string;
  /** typed answers: the card becomes "type the answer", checked with checkPractice({type:'text', a}) */
  a?: string[];
};

/** A Parsons problem: put the solution lines in order, leaving distractors out. */
export type StudyParsons = {
  title?: string;
  /** HTML prompt */ q: string;
  /** solution lines in order (plain text, 4-space indentation per level) */
  lines: string[];
  /** plain-text wrong lines that must be left out */
  distractors?: string[];
  /** HTML explanation shown after solving */ sol?: string;
};

export type StudyWeek = {
  n: number;
  label: string;
  start: string;
  end: string;
  title: string;
  secs: string;
  /** `[date label, text]` */
  events: Array<[string, string]>;
  /** HTML */ note: string;
  lectures: StudyLecture[];
  refs: StudyRef[];
  practice: StudyPractice[];
  studio: StudyStudio[];
  cards: StudyCard[];
  /** Parsons problems keyed by position `<n>-<i>` (append-only like practice) */
  parsons?: StudyParsons[];
  checks: string[];
  /** exam ids held this week */
  exams: string[];
};

export type StudyExamBlank = { label: string; answers: string[]; pts: number };

export type StudyExamItem = {
  kind: 'mc' | 'tf' | 'blanks' | 'open';
  pts: number;
  /** HTML */ q: string;
  /** HTML */ sol?: string;
  /** mc: option index; tf: boolean */
  answer?: number | boolean;
  /** HTML choices for mc */ choices?: string[];
  blanks?: StudyExamBlank[];
  /** word bank for blanks; v is HTML */
  bank?: Array<{ k: string; v: string }> | null;
  /** item is HTML */
  rubric?: Array<{ item: string; pts: number }>;
};

export type StudyExam = {
  id: string;
  title: string;
  covers: string;
  minutes: number;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (local wall time) */
  date: string;
  dateEst?: boolean;
  note: string;
  /** `[label, url]` */
  links: Array<[string, string]>;
  sections: Array<{ title: string; items: StudyExamItem[] }>;
};

export type StudyMaterialGroup = {
  h: string;
  note: string;
  /** `[title, url, description]` */
  items: Array<[string, string, string]>;
};

export type StudyGuidePage = {
  id: string;
  title: string;
  lead: string;
  /** HTML */ html: string;
};

/** One graded item in a course's `grading` (the hub's Grades view). */
export type StudyGradingItem = {
  /** key of the saved score (`gb` in progress) */
  id: string;
  /** title; an item that links an exam shows the exam's */
  t?: string;
  /** textbook sections it covers */
  sec?: string;
  /** `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, or `''` (shown as "See Canvas") */
  due?: string;
  /** a practice exam's id: its title, covers, and date stand in for t, sec, and due */
  exam?: string;
  /**
   * Not counted on its own: its score is averaged with the lowest scored of
   * these items, only when that raises it (e.g. a final part that can replace a low exam).
   */
  avgLowest?: string[];
};

export type StudyGradingGroup = {
  id: string;
  h: string;
  /** percent of the course grade; a course's groups add up to 100 */
  weight: number;
  /** the lowest N scores fall out, once more than N are scored */
  drop: number;
  note: string;
  items: StudyGradingItem[];
};

/** A course's syllabus grading: weighted groups of items and the letter cutoffs. */
export type StudyGrading = {
  source: string;
  note: string;
  /** letter → lowest percent that earns it, highest cutoff first */
  letters: Record<string, number>;
  groups: StudyGradingGroup[];
};

export type StudyCourse = {
  id: string;
  code: string;
  name: string;
  who: string;
  /** typeset `$…$` TeX in this course's HTML */
  math: boolean;
  code_lang?: string;
  labels: { lecture: string; practice: string; studio: string };
  /** `[title, url | null]` */
  book: [string, string | null];
  tutor: string;
  weeks: StudyWeek[];
  exams: Record<string, StudyExam>;
  /** formula sheet groups; row cells are HTML */
  formulas: Array<{ h: string; rows: Array<[string, string]> }>;
  materials: StudyMaterialGroup[];
  pages: StudyGuidePage[];
  missing: string[];
  /** syllabus weights for the Grades view; absent for courses without one */
  grading?: StudyGrading;
};

export type StudyHub = {
  title: string;
  importedAt: string;
  source: string;
  courses: StudyCourse[];
};

/** Line-by-line grade produced by the AI grader. */
export type StudyGrade = {
  readable: boolean;
  max: number;
  at: number;
  score: number;
  verdict: 'correct' | 'partial' | 'incorrect';
  lines: Array<{
    text: string;
    mark: 'ok' | 'error' | 'neutral';
    note: string;
  }>;
  missing: string[];
  summary: string;
  next: string;
};

export type StudyExamState = {
  /** answers keyed `"<sectionIdx>-<itemIdx>"`: mc index, tf boolean, blanks values */
  ans: Record<string, number | boolean | string[]>;
  /** self/AI-assigned points for open items */
  pts: Record<string, number>;
  /** items revealed/checked before submitting */
  rev: Record<string, boolean>;
  sub: boolean;
  done: boolean;
};

export type StudioRating = 'got' | 'shaky' | 'missed';

/**
 * FSRS memory of one study item (ts-fsrs Card, compacted). `st`: 0 New,
 * 1 Learning, 2 Review, 3 Relearning.
 */
export type SrsMemory = {
  /** epoch ms */ due: number;
  /** stability */ s: number;
  /** difficulty */ d: number;
  st: 0 | 1 | 2 | 3;
  /** learning_steps */ ls: number;
  /** scheduled_days */ sd: number;
  /** reps */ r: number;
  /** lapses */ l: number;
  /** last review ms */ lr?: number;
  sus?: 1;
};

/** One study day's ratings: again, hard, good, easy, items introduced, time spent (ms). */
export type DayLog = [
  again: number,
  hard: number,
  good: number,
  easy: number,
  introduced: number,
  ms: number,
];

/** A user-made flashcard. */
export type UserCard = {
  /** plain text + light markup (see renderUserText) */ f: string;
  /** plain text + light markup */ b: string;
  /** typed answers */ a?: string[];
  /** week number */ w?: number;
  tags?: string[];
  /** created ms */ t: number;
};

/** Per-course progress (mirrors the artifact's CourseState). */
export type StudyCourseState = {
  /** lecture "Mark as reviewed", keyed by week number */
  lec: Record<string, boolean>;
  /** practice: last answer and correctness, keyed `"<week>-<idx>"` */
  ww: Record<string, { a: string; ok: boolean }>;
  /** studio self-rating, keyed `"<week>-<idx>"` */
  st: Record<string, StudioRating>;
  ex: Record<string, StudyExamState>;
  /** grades keyed `"<week>-<idx>"`, `"<examId>:<s>-<i>"`, or `custom` */
  gr: Record<string, StudyGrade>;
  /** grader view problem statement draft */
  cq: string;
  /** flashcards keyed `"w<week>-<idx>"` or `"f<group>-<row>"` */
  cards: Record<string, 'know' | 'again'>;
  /** "can you do these" checks keyed `"<week>-<idx>"` */
  chk: Record<string, 1>;
  /** user-set real exam dates `YYYY-MM-DD` keyed by exam id */
  dates: Record<string, string>;
  /** quick-check answers keyed `"<week>-<qcKey hash>"` (see qcKey) */
  lq: Record<string, { a: string; ok: boolean }>;
  /** Grades view scores as typed ("17/20", "85", "85%"), keyed by grading item id */
  gb: Record<string, string>;
  /** FSRS memory by item key (`c:`/`q:`/`p:`/`z:`/`u:` + legacy key) */
  srs: Record<string, SrsMemory>;
  /** review log per study day `YYYY-MM-DD` */
  rv: Record<string, DayLog>;
  /** user-made cards by id */
  uc: Record<string, UserCard>;
  /** Parsons: solved at least once + attempts, keyed `"<week>-<idx>"` */
  pz: Record<string, { ok: boolean; n: number }>;
  /** last modified (ms) */
  t: number;
};
