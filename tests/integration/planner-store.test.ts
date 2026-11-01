import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type * as DbClient from '@/lib/db/client';
import type * as PlannerStore from '@/lib/planner/store';
import { plannerFileSchema } from '@/lib/planner/types';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aper-planner-'));
process.env.ACADEMIC_DATA_DIR = sandbox;
process.env.ACADEMIC_DB_PATH = path.join(sandbox, 'academic.db');

const fixture = plannerFileSchema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/planner-file.json'),
      'utf8',
    ),
  ),
);

let db: typeof DbClient;
let store: typeof PlannerStore;

function savedFile() {
  const file = store.getPlannerFile();
  if (!file) throw new Error('No planner file was saved.');
  return file;
}

describe('planner store', () => {
  beforeAll(async () => {
    // Imported after the env vars above: the client resolves the database path at module load.
    db = await import('@/lib/db/client');
    store = await import('@/lib/planner/store');
    db.initializeDatabase();
  });

  afterAll(() => {
    db.closeDatabaseForTests();
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('starts empty, then imports a planner file with its starting plan', () => {
    expect(store.getPlannerFile()).toBeNull();
    const { plan, keptSaved } = store.importPlannerFile(fixture);
    expect(keptSaved).toBe(false);
    expect(savedFile().program).toBe(fixture.program);
    expect(store.getPlan(savedFile())).toEqual(plan);
    expect(plan.t).toBe(1000);
  });

  it('saves valid plans and rejects anything else', () => {
    const edited = {
      ...store.getPlan(savedFile()),
      t: 2000,
      name: 'Edited Student',
    };
    expect(store.savePlan(edited).name).toBe('Edited Student');
    expect(() => store.savePlan({ ...edited, terms: 'none' })).toThrow(
      z.ZodError,
    );
    expect(store.getPlan(savedFile()).name).toBe('Edited Student');
  });

  it('keeps a saved plan newer than an imported file and replaces an older one', () => {
    expect(store.importPlannerFile(fixture).keptSaved).toBe(true);
    expect(store.getPlan(savedFile()).name).toBe('Edited Student');
    const newer = {
      ...fixture,
      plan: { ...fixture.plan, t: 3000, name: 'Newer File' },
    };
    const { plan, keptSaved } = store.importPlannerFile(newer);
    expect(keptSaved).toBe(false);
    expect(plan.name).toBe('Newer File');
    expect(store.getPlan(savedFile()).name).toBe('Newer File');
  });

  it('resets to the starting plan, stamped now', () => {
    store.savePlan({
      ...store.getPlan(savedFile()),
      t: 4000,
      name: 'Changed Again',
    });
    const before = Date.now();
    const plan = store.resetPlan(savedFile());
    expect(plan.t).toBeGreaterThanOrEqual(before);
    expect({ ...plan, t: 0 }).toEqual({ ...savedFile().plan, t: 0 });
    expect(store.getPlan(savedFile())).toEqual(plan);
  });

  it('rejects a file whose rows point at unknown requirements and keeps the old one', () => {
    const broken = structuredClone(fixture);
    broken.plan.terms[2].rows[1].r = 'nope';
    expect(() => store.importPlannerFile(broken)).toThrow(
      /unknown requirement, nope/,
    );
    expect(savedFile().plan.name).toBe('Newer File');
  });

  it('imports the committed example planner file, summer terms included', () => {
    const example = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'examples/planner/plan.json'),
        'utf8',
      ),
    );
    // Newer than the plans saved above, so the example's plan replaces them.
    example.plan.t = Date.now() + 60_000;
    const { file, plan, keptSaved } = store.importPlannerFile(example);
    expect(keptSaved).toBe(false);
    expect(plan.terms.map((term) => term.id)).toContain('U27');
    expect(savedFile().program).toBe(file.program);
  });
});
