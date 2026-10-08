import { cloudJournalRecordSchema, prepareCloudRecord, type CloudJournalRecord } from './journal';
import { applyDomainOperation } from '../domain/operations';
import { emptyGarden, gardenStateSchema, type GardenState } from '../domain/schema';
import { localEnvelopeSchema, LocalGardenRepository, type LocalEnvelope } from '../storage/localRepository';

/**
 * M2c: read-only, fail-closed reconciliation PREVIEW. Not a hydration/commit or
 * last-writer-wins algorithm. The cloud journal format is not yet a causal protocol.
 */
export const MAX_PREVIEW_OPERATIONS = 200;

export type PreviewBlocker =
  | 'identity-changed' | 'remote-unavailable' | 'limit-exceeded'
  | 'invalid-receipt' | 'history-gap' | 'conflicting-writes'
  | 'unresolvable-history' | 'local-divergence' | 'concurrent-local-change';

export class ReconciliationBlocked extends Error {
  constructor(readonly reason: PreviewBlocker) {
    super('Anteprima di riconciliazione bloccata: ' + reason);
    this.name = 'ReconciliationBlocked';
  }
}

export interface CloudJournalReader {
  /** Complete, server-backed scan; throw rather than return a truncated page. */
  readAll(ownerUid: string, max: number): Promise<readonly { id: string; data: unknown }[]>;
}

export interface ReconciliationPreview {
  readonly status: 'preview-only';
  readonly data: GardenState;
  readonly remoteCount: number;
  readonly locallyPendingCount: number;
  readonly operationCount: number;
}

/** Canonicalize every record, including opaque Firestore return values. */
function record(raw: unknown, owner: string, documentId: string): CloudJournalRecord {
  const result = cloudJournalRecordSchema.safeParse(raw);
  if (!result.success || result.data.ownerUid !== owner || result.data.operationId !== documentId) {
    throw new ReconciliationBlocked('invalid-receipt');
  }
  return result.data;
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function compare(a: CloudJournalRecord, b: CloudJournalRecord): number {
  return a.appliedAt - b.appliedAt || (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0);
}

/** Check locally persisted state is rebuildable before trusting it as a replica. */
function verifyLocal(envelope: LocalEnvelope, ownerUid: string): void {
  if (envelope.ownerScope !== 'user:' + ownerUid) throw new ReconciliationBlocked('identity-changed');
  if (envelope.pending.length !== envelope.lastSequence) {
    // Some local entries were acknowledged without a persisted remote baseline.
    throw new ReconciliationBlocked('local-divergence');
  }
  let replay = emptyGarden();
  try {
    for (const pending of envelope.pending) {
      replay = applyDomainOperation(replay, pending.operation, pending.appliedAt);
    }
  } catch {
    throw new ReconciliationBlocked('local-divergence');
  }
  if (!same(replay, envelope.data)) throw new ReconciliationBlocked('local-divergence');
}

/** Reject a cross-replica overwrite of the same field. No implicit LWW. */
function mutationFootprint(row: CloudJournalRecord): readonly string[] {
  const op = row.operation;
  switch (op.type) {
    case 'plant.create': return ['plant:' + op.plant.id + ':create'];
    case 'place.create': return ['place:' + op.place.id + ':create'];
    case 'event.add': return ['event:' + op.event.id + ':create'];
    case 'plant.patch': return Object.keys(op.patch).map(k => 'plant:' + op.id + ':' + k);
    case 'place.patch': return Object.keys(op.patch).map(k => 'place:' + op.id + ':' + k);
  }
}

/**
 * Complete set, not a page: ensure each replica contains its entire prefix.
 * A single timestamp is NOT a causal proof. Per-replica sequence is authoritative;
 * independent operations are deterministically interleaved only when compatible.
 */
export function buildReconciliationPreview(
  ownerUid: string,
  rawRemote: readonly { id: string; data: unknown }[],
  rawEnvelope: unknown,
  max = MAX_PREVIEW_OPERATIONS
): ReconciliationPreview {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(ownerUid)) throw new ReconciliationBlocked('identity-changed');
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_PREVIEW_OPERATIONS) throw new ReconciliationBlocked('limit-exceeded');
  if (rawRemote.length > max) throw new ReconciliationBlocked('limit-exceeded');
  const parsed = localEnvelopeSchema.safeParse(rawEnvelope);
  if (!parsed.success) throw new ReconciliationBlocked('local-divergence');
  const envelope = parsed.data;
  verifyLocal(envelope, ownerUid);

  const byId = new Map<string, CloudJournalRecord>();
  for (const item of rawRemote) {
    const row = record(item.data, ownerUid, item.id);
    const previous = byId.get(row.operationId);
    if (previous && !same(previous, row)) throw new ReconciliationBlocked('invalid-receipt');
    byId.set(row.operationId, row);
  }
  for (const pending of envelope.pending) {
    let row: CloudJournalRecord;
    try { row = prepareCloudRecord(ownerUid, envelope, pending); }
    catch { throw new ReconciliationBlocked('local-divergence'); }
    const previous = byId.get(row.operationId);
    if (previous && !same(previous, row)) throw new ReconciliationBlocked('invalid-receipt');
    byId.set(row.operationId, row);
  }
  if (byId.size > max) throw new ReconciliationBlocked('limit-exceeded');

  const replicas = new Map<string, CloudJournalRecord[]>();
  const footprints = new Map<string, string>();
  for (const row of byId.values()) {
    const group = replicas.get(row.replicaId) ?? [];
    group.push(row);
    replicas.set(row.replicaId, group);
    for (const footprint of mutationFootprint(row)) {
      const previous = footprints.get(footprint);
      if (previous && previous !== row.replicaId) throw new ReconciliationBlocked('conflicting-writes');
      footprints.set(footprint, row.replicaId);
    }
  }
  const heads = new Map<string, number>();
  for (const [replica, rows] of replicas) {
    rows.sort((a,b) => a.sequence - b.sequence);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].sequence !== i + 1) throw new ReconciliationBlocked('history-gap');
    }
    heads.set(replica, 0);
  }

  let state: GardenState = emptyGarden();
  let remaining = byId.size;
  while (remaining) {
    const candidates = [...replicas].flatMap(([replica, rows]) => {
      const row = rows[heads.get(replica) ?? 0];
      return row ? [row] : [];
    }).sort(compare);
    let progressed = false;
    for (const row of candidates) {
      try {
        state = applyDomainOperation(state, row.operation, row.appliedAt);
        heads.set(row.replicaId, (heads.get(row.replicaId) ?? 0) + 1);
        remaining--;
        progressed = true;
        break;
      } catch {
        // A cross-replica create may satisfy a dependency in another round.
        // If none can advance, history is corrupt or requires conflict resolution.
      }
    }
    if (!progressed) throw new ReconciliationBlocked('unresolvable-history');
  }
  return {
    status: 'preview-only',
    data: gardenStateSchema.parse(state),
    remoteCount: rawRemote.length,
    locallyPendingCount: envelope.pending.length,
    operationCount: byId.size
  };
}

/**
 * Read server truth only. Do not persist a preview, acknowledge operations,
 * or modify Firestore. An intervening local write or logout invalidates it.
 */
export async function inspectRemoteJournal(
  repository: LocalGardenRepository,
  reader: CloudJournalReader,
  ownerUid: string,
  isStillAuthorized: () => boolean,
  max = MAX_PREVIEW_OPERATIONS
): Promise<ReconciliationPreview> {
  if (!isStillAuthorized()) throw new ReconciliationBlocked('identity-changed');
  const before = await repository.read();
  if (before.ownerScope !== 'user:' + ownerUid) throw new ReconciliationBlocked('identity-changed');
  let remote: readonly {id:string; data:unknown}[];
  try { remote = await reader.readAll(ownerUid, max); }
  catch (error) {
    if (error instanceof ReconciliationBlocked) throw error;
    throw new ReconciliationBlocked('remote-unavailable');
  }
  if (!isStillAuthorized()) throw new ReconciliationBlocked('identity-changed');
  const after = await repository.read();
  if (!isStillAuthorized()) throw new ReconciliationBlocked('identity-changed');
  if (after.revision !== before.revision ||
      after.replicaId !== before.replicaId ||
      !same(after, before)) {
    throw new ReconciliationBlocked('concurrent-local-change');
  }
  return buildReconciliationPreview(ownerUid, remote, after, max);
}
