import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as Hub from '@/lib/study/hub';
import type * as Progress from '@/lib/study/progress';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-study-hub-'));
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');

let hub: typeof Hub;
let progress: typeof Progress;

const courses = [
  {
    id: 'cs1000',
    code: 'CS 1000',
    name: 'Fixture Computing',
    who: '',
    math: false,
    labels: { lecture: 'Lecture', practice: 'Practice', studio: 'Studio' },
    book: ['Book', null],
    tutor: '',
    weeks: [
      {
        n: 1,
        label: '1',
        start: '2026-08-24',
        end: '2026-08-28',
        title: 'Start',
      },
    ],
    exams: {},
    formulas: [],
    materials: [],
    pages: [],
    missing: [],
  },
];

const seedFile = (t: number) => ({
  format: 'gt-study-hub-progress',
  version: 1,
  exportedAt: '2026-10-01',
  theme: 'light',
  course: 'cs1000',
  t,
  c: {
    cs1000: {
      lec: { 1: true },
      ww: {},
      st: {},
      ex: {},
      gr: {},
      cq: '',
      cards: {},
      chk: {},
      dates: {},
      t,
    },
  },
});

const built = (t: number) =>
  `<!DOCTYPE html><html><head><title>Fixture Hub</title></head><body><script>window.COURSES = ${JSON.stringify(courses)};</script><script>window.SEED_PROGRESS = ${JSON.stringify(seedFile(t))};</script></body></html>`;

// Imported after the sandbox env is set: the database client reads it when it loads.
beforeAll(async () => {
  hub = await import('@/lib/study/hub');
  progress = await import('@/lib/study/progress');
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('importing a Study Hub with its progress', () => {
  it('adopts progress bundled in a built hub when it is newer than what is saved', () => {
    const { hub: imported, seeded } = hub.importStudyHub(
      built(1_000),
      'index.html',
    );
    expect(imported.courses.map((course) => course.id)).toEqual(['cs1000']);
    expect(seeded).toEqual(['cs1000']);
    expect(progress.getStudyProgress('cs1000')).toMatchObject({
      lec: { 1: true },
      t: 1_000,
    });
  });

  it('never replaces newer saved work with an older snapshot', () => {
    progress.saveStudyProgress('cs1000', {
      lec: { 1: true },
      chk: { '1-0': 1 },
      t: 5_000,
    });
    expect(hub.importStudyHub(built(2_000), 'index.html').seeded).toEqual([]);
    expect(progress.getStudyProgress('cs1000')).toMatchObject({
      chk: { '1-0': 1 },
      t: 5_000,
    });
  });

  it('reads src/courses.json with src/progress.json, as the folder import does', () => {
    const { seeded } = hub.importStudyHub(
      JSON.stringify(courses),
      'study-hub/src/courses.json',
      JSON.stringify(seedFile(9_000)),
    );
    expect(seeded).toEqual(['cs1000']);
    expect(progress.getStudyProgress('cs1000').t).toBe(9_000);
  });

  it('ignores bundled progress that is not a progress export', () => {
    expect(
      hub.importStudyHub(
        JSON.stringify(courses),
        'courses.json',
        JSON.stringify({ c: {} }),
      ).seeded,
    ).toEqual([]);
    expect(() =>
      hub.importStudyHub(JSON.stringify(courses), 'courses.json', '{'),
    ).toThrow(/progress file is not valid JSON/);
  });

  it('imports a progress file over saved work, and resets win over older copies', () => {
    const before = Date.now();
    const [state] = Object.values(
      progress.replaceStudyProgress({
        cs1000: { ...progress.getStudyProgress('cs1000'), lec: {}, t: 1 },
      }),
    );
    expect(state.lec).toEqual({});
    expect(state.t).toBeGreaterThanOrEqual(before);
    progress.resetStudyProgress('cs1000');
    expect(progress.getStudyProgress('cs1000').t).toBeGreaterThanOrEqual(
      before,
    );
  });
});

describe('importing a Study Hub from a path', () => {
  const example = path.join(process.cwd(), 'examples', 'study-hub');

  it('imports the committed example folder and its courses.json alike', () => {
    for (const target of [example, path.join(example, 'courses.json')]) {
      const { hub: imported } = hub.importStudyHubPath(target);
      expect(imported.courses.map((course) => course.code)).toEqual([
        'EXMP 1000',
      ]);
      expect(hub.loadStudyHub()?.courses[0].weeks).toHaveLength(2);
    }
  });

  it('previews a path without writing, and reads courses.json with progress.json from a folder', () => {
    const folder = fs.mkdtempSync(path.join(sandbox, 'hub-'));
    // Newer than anything saved so far, so the folder's progress wins.
    const newest = Date.now() + 60_000;
    fs.writeFileSync(
      path.join(folder, 'courses.json'),
      JSON.stringify(courses),
    );
    fs.writeFileSync(
      path.join(folder, 'progress.json'),
      JSON.stringify(seedFile(newest)),
    );
    const before = fs.statSync(hub.studyHubPath).mtimeMs;
    expect(hub.previewStudyHubPath(folder)).toMatchObject({
      title: 'Study Hub',
      courses: [{ id: 'cs1000', code: 'CS 1000', name: 'Fixture Computing' }],
    });
    expect(fs.statSync(hub.studyHubPath).mtimeMs).toBe(before);
    const { seeded } = hub.importStudyHubPath(folder);
    expect(seeded).toEqual(['cs1000']);
    expect(progress.getStudyProgress('cs1000').t).toBe(newest);
    // Once imported, the same folder previews as already current.
    expect(hub.previewStudyHubPath(folder).current).toBe(true);
  });

  it('still reads the legacy src/courses.json layout and rejects empty folders', () => {
    const folder = fs.mkdtempSync(path.join(sandbox, 'legacy-'));
    fs.mkdirSync(path.join(folder, 'src'));
    fs.writeFileSync(
      path.join(folder, 'src', 'courses.json'),
      JSON.stringify(courses),
    );
    fs.writeFileSync(
      path.join(folder, 'src', 'shell.html'),
      '<html><head><title>Legacy Hub</title></head></html>',
    );
    expect(hub.importStudyHubPath(folder).hub.title).toBe('Legacy Hub');
    const empty = fs.mkdtempSync(path.join(sandbox, 'empty-'));
    expect(() => hub.importStudyHubPath(empty)).toThrow(/no courses\.json/);
  });
});
