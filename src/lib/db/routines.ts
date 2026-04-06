import { db, generateLocalId } from './index';
import type { LocalRoutineTemplate } from '$types';

export async function getLocalRoutines(userId: string): Promise<LocalRoutineTemplate[]> {
  return db.routine_templates.where('user').equals(userId).sortBy('name');
}

export async function getLocalRoutine(localId: string): Promise<LocalRoutineTemplate | undefined> {
  return db.routine_templates.get(localId);
}

export async function createLocalRoutine(
  routine: Omit<LocalRoutineTemplate, 'local_id' | 'sync_status'>
): Promise<LocalRoutineTemplate> {
  const localRoutine: LocalRoutineTemplate = {
    ...routine,
    local_id: generateLocalId(),
    sync_status: 'pending'
  };
  await db.routine_templates.add(localRoutine);
  return localRoutine;
}

export async function updateLocalRoutine(
  localId: string,
  changes: Partial<LocalRoutineTemplate>
): Promise<void> {
  await db.routine_templates.update(localId, {
    ...changes,
    sync_status: 'pending'
  });
}

export async function deleteLocalRoutine(localId: string): Promise<void> {
  await db.routine_templates.delete(localId);
}
