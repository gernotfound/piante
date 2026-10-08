import { type LocalEnvelope, type PendingOperation, LocalGardenRepository } from '../storage/localRepository';

/**
 * M2b laboratory transport: append-only owner-scoped receipts, not multi-device
 * synchronization. No cloud adapter is wired to the application.
 */
export { cloudJournalRecordSchema } from './protocol';
export type { CloudJournalRecord } from './protocol';
import { cloudJournalRecordSchema, type CloudJournalRecord } from './protocol';

export interface CloudJournalPort {
  /** Server-backed transaction; "duplicate" means byte-for-byte equivalent logical intent. */
  appendOnce(record: CloudJournalRecord): Promise<'created' | 'duplicate'>;
}

export function prepareCloudRecord(ownerUid: string, envelope: LocalEnvelope, pending: PendingOperation): CloudJournalRecord {
  const uid = uidSchema.parse(ownerUid);
  if (envelope.ownerScope !== `user:${uid}`) throw new Error('Owner locale e Firebase UID divergenti');
  if (pending.operationId !== `${envelope.replicaId}:${pending.sequence}`) throw new Error('Operazione locale incoerente');
  return cloudJournalRecordSchema.parse({
    protocol: 1, ownerUid: uid, operationId: pending.operationId,
    replicaId: envelope.replicaId, sequence: pending.sequence,
    appliedAt: pending.appliedAt, operation: pending.operation
  });
}

export type UploadOutcome =
  | { status: 'nothing-to-upload' }
  | { status: 'uploaded-awaiting-reconciliation'; count: number }
  | { status: 'local-pending'; count: number }
  | { status: 'rejected'; count: number }
  | { status: 'failed'; count: number; reason: 'local-invariant' | 'cloud-error' | 'identity-changed' };

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error.code === 'permission-denied' || error.code === 'firestore/permission-denied');
}

function identicalPending(a: PendingOperation, b: PendingOperation): boolean {
  // Both are Zod validated; parse normalizes key ordering and removes ambiguity.
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Sends at most 20 pending operations in sequence. Never acknowledges or removes
 * local journal entries: no remote-hydration/causal merge has been implemented.
 *
 * This routine MUST NOT be called without an auth-session epoch guard.
 */
export async function uploadPendingJournal(
  repository: LocalGardenRepository,
  port: CloudJournalPort,
  ownerUid: string,
  isStillAuthorized: () => boolean,
  maxEntries = 20
): Promise<UploadOutcome> {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 20) throw new Error('Limite upload non valido');
  if (!isStillAuthorized()) return { status: 'failed', count: 0, reason: 'identity-changed' };
  const envelope = await repository.read(); // corruption must propagate: no false "pending"
  if (envelope.ownerScope !== `user:${uidSchema.parse(ownerUid)}`) {
    return { status: 'failed', count: 0, reason: 'identity-changed' };
  }
  const outgoing = envelope.pending.slice(0, maxEntries);
  if (outgoing.length === 0) return { status: 'nothing-to-upload' };
  let uploaded = 0;
  for (const pending of outgoing) {
    if (!isStillAuthorized()) return { status: 'failed', count: uploaded, reason: 'identity-changed' };
    const record = prepareCloudRecord(ownerUid, envelope, pending);
    try {
      await port.appendOnce(record);
      uploaded++;
      if (!isStillAuthorized()) return { status: 'failed', count: uploaded, reason: 'identity-changed' };
    } catch (error) {
      if (isPermissionDenied(error)) return { status: 'rejected', count: uploaded };
      // A timeout could occur after remote commit. Only durable matching journal
      // entries justify describing the remaining work as safely retryable.
      let current: LocalEnvelope;
      try { current = await repository.read(); }
      catch { return { status: 'failed', count: uploaded, reason: 'local-invariant' }; }
      if (!isStillAuthorized() || current.ownerScope !== envelope.ownerScope) {
        return { status: 'failed', count: uploaded, reason: 'identity-changed' };
      }
      const stillPending = current.pending.find(item => item.operationId === pending.operationId);
      if (!stillPending || !identicalPending(stillPending, pending)) {
        return { status: 'failed', count: uploaded, reason: 'local-invariant' };
      }
      return { status: 'local-pending', count: uploaded };
    }
  }
  return { status: 'uploaded-awaiting-reconciliation', count: uploaded };
}
