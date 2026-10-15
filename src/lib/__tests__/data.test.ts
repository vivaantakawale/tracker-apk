import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { entry, goal, phase } from './helpers';
import {
  createBackup,
  csvEscape,
  entriesToCsv,
  parseBackupText,
  planMerge,
  validateBackup,
  BACKUP_VERSION,
} from '../backup';
import { DEFAULT_SETTINGS, type AppData } from '../types';
import { loadAll, replaceAllOps, writeBatch, type WriteOp } from '../db';

const sample = (): AppData => ({
  entries: [entry(0, 70), entry(1, 70.4)],
  goals: [goal(70, 75)],
  phases: [phase('p1', '2026-01-01', null)],
  settings: { ...DEFAULT_SETTINGS, height_cm: 175, onboarding_completed: true },
});

describe('CSV export', () => {
  it('escapes commas, quotes, newlines and formula prefixes', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
  });
  it('includes a version marker, header and canonical kg', () => {
    const e = { ...entry(0, 70.12345), notes: 'after run, "tired"' };
    const lines = entriesToCsv([e]).trim().split('\r\n');
    expect(lines[0]).toMatch(/weight-tracker-csv v1/);
    expect(lines[1]).toBe('id,measured_at,weight_kg,notes,created_at,updated_at');
    expect(lines[2]).toContain('70.123');
    expect(lines[2]).toContain('"after run, ""tired"""');
  });
});

describe('JSON backup validation', () => {
  it('round-trips a backup', () => {
    const data = sample();
    const r = parseBackupText(JSON.stringify(createBackup(data)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.data.entries).toHaveLength(2);
      expect(r.backup.data.settings.height_cm).toBe(175);
      expect(r.backup.version).toBe(BACKUP_VERSION);
    }
  });
  it('rejects malformed and unsupported files with a clear error', () => {
    expect(parseBackupText('not json').ok).toBe(false);
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    const newer = { ...createBackup(sample()), version: 99 };
    const r = validateBackup(newer);
    expect(!r.ok && r.error).toMatch(/newer version/);
    const bad = createBackup(sample());
    (bad.data.entries[0] as unknown as Record<string, unknown>).weight_kg = 'heavy';
    expect(validateBackup(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
    const dupIds = createBackup(sample());
    dupIds.data.entries[1].id = dupIds.data.entries[0].id;
    expect(validateBackup(JSON.parse(JSON.stringify(dupIds))).ok).toBe(false);
    const twoActive = createBackup(sample());
    twoActive.data.goals.push({ ...goal(70, 60), id: 'g2' });
    expect(validateBackup(JSON.parse(JSON.stringify(twoActive))).ok).toBe(false);
  });
});

describe('merge planning', () => {
  it('importing the same backup twice adds nothing', () => {
    const data = sample();
    const plan = planMerge(data, data);
    expect(plan.entries).toHaveLength(0);
    expect(plan.goals).toHaveLength(0);
    expect(plan.phases).toHaveLength(0);
    expect(plan.skippedEntries).toBe(2);
  });
  it('skips content duplicates with different ids and archives incoming active goals', () => {
    const data = sample();
    const incoming: AppData = {
      ...sample(),
      entries: [{ ...data.entries[0], id: 'other-id' }, entry(5, 71)],
      goals: [{ ...goal(70, 80), id: 'g-new' }],
      phases: [phase('p2', '2026-02-01', null)], // overlaps the open phase p1
    };
    const plan = planMerge(data, incoming);
    expect(plan.entries).toHaveLength(1);
    expect(plan.skippedEntries).toBe(1);
    expect(plan.goals[0].status).toBe('archived');
    expect(plan.phases).toHaveLength(0);
    expect(plan.skippedPhases).toBe(1);
  });
});

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await writeBatch(replaceAllOps({ entries: [], goals: [], phases: [], settings: DEFAULT_SETTINGS }));
  });

  it('writes and reloads data', async () => {
    const data = sample();
    await writeBatch(replaceAllOps(data));
    const loaded = await loadAll();
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.goals[0].target_weight_kg).toBe(75);
    expect(loaded.settings.height_cm).toBe(175);
  });

  it('edits and deletes entries', async () => {
    const e = entry(0, 70);
    await writeBatch([{ type: 'put', store: 'entries', value: e }]);
    await writeBatch([{ type: 'put', store: 'entries', value: { ...e, weight_kg: 71 } }]);
    expect((await loadAll()).entries[0].weight_kg).toBe(71);
    await writeBatch([{ type: 'delete', store: 'entries', key: e.id }]);
    expect((await loadAll()).entries).toHaveLength(0);
  });

  it('rolls back the whole batch if one write fails (restore integrity)', async () => {
    await writeBatch(replaceAllOps(sample()));
    const broken = { ...entry(9, 80) } as Record<string, unknown>;
    delete broken.id; // violates the keyPath → the transaction aborts
    const ops: WriteOp[] = [
      { type: 'clear', store: 'entries' },
      { type: 'put', store: 'entries', value: broken as never },
    ];
    await expect(writeBatch(ops)).rejects.toBeTruthy();
    expect((await loadAll()).entries).toHaveLength(2);
  });
});
