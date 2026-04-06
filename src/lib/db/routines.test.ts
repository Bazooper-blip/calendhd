import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './index';
import {
  createLocalRoutine,
  getLocalRoutines,
  getLocalRoutine,
  updateLocalRoutine,
  deleteLocalRoutine
} from './routines';
import type { LocalRoutineTemplate } from '$types';

const TEST_USER = 'test-user-id';

function makeRoutine(
  overrides: Partial<Omit<LocalRoutineTemplate, 'local_id' | 'sync_status'>> = {}
): Omit<LocalRoutineTemplate, 'local_id' | 'sync_status'> {
  return {
    user: TEST_USER,
    name: 'Morning routine',
    steps: [
      { title: 'Take meds', duration_minutes: 5 },
      { title: 'Breakfast', duration_minutes: 20 }
    ],
    schedule: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '07:00' },
    is_active: true,
    ...overrides
  };
}

beforeEach(async () => {
  await db.routine_templates.clear();
});

describe('createLocalRoutine', () => {
  it('creates a routine with local_id and pending sync_status', async () => {
    const routine = await createLocalRoutine(makeRoutine());
    expect(routine.local_id).toMatch(/^local_/);
    expect(routine.sync_status).toBe('pending');
    expect(routine.name).toBe('Morning routine');
    expect(routine.steps).toHaveLength(2);
  });
});

describe('getLocalRoutines', () => {
  it('returns routines for the given user', async () => {
    await createLocalRoutine(makeRoutine());
    await createLocalRoutine(makeRoutine({ user: 'other-user', name: 'Other' }));
    const routines = await getLocalRoutines(TEST_USER);
    expect(routines).toHaveLength(1);
    expect(routines[0].name).toBe('Morning routine');
  });

  it('returns empty array when no routines exist', async () => {
    const routines = await getLocalRoutines(TEST_USER);
    expect(routines).toHaveLength(0);
  });
});

describe('getLocalRoutine', () => {
  it('returns a routine by local_id', async () => {
    const created = await createLocalRoutine(makeRoutine());
    const found = await getLocalRoutine(created.local_id);
    expect(found?.name).toBe('Morning routine');
  });

  it('returns undefined for non-existent local_id', async () => {
    const found = await getLocalRoutine('does-not-exist');
    expect(found).toBeUndefined();
  });
});

describe('updateLocalRoutine', () => {
  it('updates fields and sets sync_status to pending', async () => {
    const created = await createLocalRoutine(makeRoutine());
    await updateLocalRoutine(created.local_id, { name: 'Evening routine', is_active: false });
    const updated = await getLocalRoutine(created.local_id);
    expect(updated?.name).toBe('Evening routine');
    expect(updated?.is_active).toBe(false);
    expect(updated?.sync_status).toBe('pending');
  });
});

describe('deleteLocalRoutine', () => {
  it('removes the routine from the database', async () => {
    const created = await createLocalRoutine(makeRoutine());
    await deleteLocalRoutine(created.local_id);
    const found = await getLocalRoutine(created.local_id);
    expect(found).toBeUndefined();
  });
});
