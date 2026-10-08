import { domainOperationSchema, gardenStateSchema, type DomainOperation, type GardenState } from './schema';

/** Undefined must never silently turn a field deletion into an omitted patch. */
function rejectUndefined(value: unknown, path = new WeakSet<object>()): void {
  if (value === undefined) throw new Error('Undefined non ammesso');
  if (typeof value !== 'object' || value === null) return;
  if (path.has(value)) throw new Error('Payload circolare');
  path.add(value);
  for (const v of Object.values(value)) rejectUndefined(v, path);
  path.delete(value);
}
function applyPatch<T extends object>(base: T, patch: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as T;
}
/** Pure reducer: the operation and appliedAt timestamp are journaled together. */
export function applyDomainOperation(stateInput: GardenState, raw: unknown, appliedAt: number): GardenState {
  rejectUndefined(raw);
  const op: DomainOperation = domainOperationSchema.parse(raw);
  const state = gardenStateSchema.parse(stateInput);
  if (!Number.isSafeInteger(appliedAt) || appliedAt < 0) throw new Error('Timestamp non valido');
  const next: GardenState = {
    plants: { ...state.plants }, places: { ...state.places }, events: { ...state.events }
  };
  switch (op.type) {
    case 'plant.create': {
      if (Object.hasOwn(next.plants, op.plant.id)) throw new Error('ID pianta duplicato');
      next.plants[op.plant.id] = { ...op.plant, createdAt: appliedAt, updatedAt: appliedAt };
      break;
    }
    case 'plant.patch': {
      const old = next.plants[op.id];
      if (!old) throw new Error('Pianta inesistente');
      if (!Object.keys(op.patch).length) throw new Error('Patch vuota');
      next.plants[op.id] = {
        ...applyPatch(old, op.patch), updatedAt: Math.max(appliedAt, old.updatedAt + 1)
      };
      break;
    }
    case 'place.create': {
      if (Object.hasOwn(next.places, op.place.id)) throw new Error('ID luogo duplicato');
      next.places[op.place.id] = { ...op.place, createdAt: appliedAt, updatedAt: appliedAt };
      break;
    }
    case 'place.patch': {
      const old = next.places[op.id];
      if (!old) throw new Error('Luogo inesistente');
      if (!Object.keys(op.patch).length) throw new Error('Patch vuota');
      next.places[op.id] = {
        ...applyPatch(old, op.patch), updatedAt: Math.max(appliedAt, old.updatedAt + 1)
      };
      break;
    }
    case 'event.add': {
      if (Object.hasOwn(next.events, op.event.id)) throw new Error('ID evento duplicato');
      next.events[op.event.id] = { ...op.event, createdAt: appliedAt };
    }
  }
  return gardenStateSchema.parse(next);
}
export function replayOperations(
  baseline: GardenState,
  entries: ReadonlyArray<{ operation: DomainOperation; appliedAt: number }>
): GardenState {
  return entries.reduce((state, entry) => applyDomainOperation(state, entry.operation, entry.appliedAt), gardenStateSchema.parse(baseline));
}
