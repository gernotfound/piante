import { cloudJournalRecordSchema, prepareCloudRecord, type CloudJournalRecord } from './journal';
import { localEnvelopeSchema, type LocalGardenRepository } from '../storage/localRepository';
import {
  buildReconciliationPreview, MAX_PREVIEW_OPERATIONS, ReconciliationBlocked,
  type CloudJournalReader, type JournalRow
} from './reconciliationPreview';

/**
 * M5b laboratory preflight only. Protocol v1 has neither cross-replica causal
 * observations nor an authenticated durable server checkpoint. A confirmed
 * per-replica prefix is NOT a stable causal frontier or a GC permission.
 */
export type CheckpointCandidate = {
  readonly status: 'candidate-only';
  readonly ownerUid: string;
  readonly receiptCount: number;
  readonly observedPrefixes: Readonly<Record<string, number>>;
  readonly sha256: string;
  readonly compactionAuthorized: false;
};

export class CheckpointCandidateBlocked extends Error {
  constructor(readonly reason: 'pending-not-confirmed' | 'backup-quarantined' | 'hash-unavailable') {
    super('Checkpoint candidato bloccato: ' + reason);
    this.name = 'CheckpointCandidateBlocked';
  }
}

function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value===null||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([key,item])=>[key,canonical(item)]));
}
function same(a: unknown,b: unknown): boolean {
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
async function sha256(value: unknown): Promise<string> {
  if(typeof crypto==='undefined'||!crypto.subtle?.digest){
    throw new CheckpointCandidateBlocked('hash-unavailable');
  }
  const encoded=new TextEncoder().encode(JSON.stringify(canonical(value)));
  let result: ArrayBuffer;
  try{result=await crypto.subtle.digest('SHA-256',encoded);}
  catch{throw new CheckpointCandidateBlocked('hash-unavailable');}
  return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');
}

/**
 * Compute a deterministic, NON-authoritative digest of a complete bounded
 * server scan. All local pending operations must also have an exact server
 * receipt; otherwise a server-only candidate would omit uncommitted data.
 * This function has no write or journal-removal capability.
 */
export async function buildCheckpointCandidate(
  ownerUid: string, rawRemote: readonly JournalRow[], rawEnvelope: unknown,
  max=MAX_PREVIEW_OPERATIONS
): Promise<CheckpointCandidate> {
  if(!Number.isSafeInteger(max)||max<1||max>MAX_PREVIEW_OPERATIONS){
    throw new ReconciliationBlocked('limit-exceeded');
  }
  // Reject oversized scans before parsing untrusted rows or replaying history.
  if(rawRemote.length>max)throw new ReconciliationBlocked('limit-exceeded');
  const parsed=localEnvelopeSchema.safeParse(rawEnvelope);
  if(!parsed.success)throw new ReconciliationBlocked('local-divergence');
  const envelope=parsed.data;
  if(envelope.ownerScope!=='user:'+ownerUid)throw new ReconciliationBlocked('identity-changed');
  if(envelope.backupQuarantined)throw new CheckpointCandidateBlocked('backup-quarantined');

  // This validates owner, operation identity, complete per-replica sequences,
  // replay, already-observed receipts and conflicting writes (fail-closed).
  const preview=buildReconciliationPreview(ownerUid,rawRemote,envelope,max);
  const remote=new Map<string,CloudJournalRecord>();
  for(const item of rawRemote){
    const parsedRow=cloudJournalRecordSchema.safeParse(item.data);
    if(!parsedRow.success||parsedRow.data.ownerUid!==ownerUid||
       parsedRow.data.operationId!==item.id||remote.has(item.id)){
      throw new ReconciliationBlocked('invalid-receipt');
    }
    remote.set(item.id,parsedRow.data);
  }
  for(const pending of envelope.pending){
    const expected=prepareCloudRecord(ownerUid,envelope,pending);
    const actual=remote.get(expected.operationId);
    if(!actual)throw new CheckpointCandidateBlocked('pending-not-confirmed');
    if(!same(actual,expected))throw new ReconciliationBlocked('invalid-receipt');
  }

  // These are observed contiguous prefixes, NOT vector-clock acknowledgements
  // or evidence that every active device has processed the events.
  const prefixes=new Map<string,number>();
  for(const record of remote.values()){
    prefixes.set(record.replicaId,Math.max(prefixes.get(record.replicaId)??0,record.sequence));
  }
  const observedPrefixes=Object.fromEntries([...prefixes].sort(([a],[b])=>a<b?-1:a>b?1:0));
  const rows=[...remote.values()].sort((a,b)=>a.operationId<b.operationId?-1:a.operationId>b.operationId?1:0);
  const digest=await sha256({
    candidateVersion:1, ownerUid, receiptCount:rows.length,
    observedPrefixes, data:preview.data, receipts:rows
  });
  return {
    status:'candidate-only',ownerUid,receiptCount:rows.length,
    observedPrefixes,sha256:digest,compactionAuthorized:false
  };
}

/**
 * Read-only, owner/session-fenced preflight. A change during the server scan
 * OR during asynchronous hashing invalidates the observation. The reader's
 * complete-server-snapshot contract remains a laboratory assumption.
 */
export async function inspectCheckpointCandidate(
  repository: LocalGardenRepository, reader: CloudJournalReader,
  ownerUid: string, isStillAuthorized: ()=>boolean,
  max=MAX_PREVIEW_OPERATIONS
): Promise<CheckpointCandidate> {
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!Number.isSafeInteger(max)||max<1||max>MAX_PREVIEW_OPERATIONS){
    throw new ReconciliationBlocked('limit-exceeded');
  }
  const before=await repository.read();
  if(!isStillAuthorized()||before.ownerScope!=='user:'+ownerUid){
    throw new ReconciliationBlocked('identity-changed');
  }
  if(before.backupQuarantined)throw new CheckpointCandidateBlocked('backup-quarantined');
  let remote:readonly JournalRow[];
  try{remote=await reader.readAll(ownerUid,max);}
  catch(error){
    if(error instanceof ReconciliationBlocked)throw error;
    throw new ReconciliationBlocked('remote-unavailable');
  }
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const after=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!same(after,before))throw new ReconciliationBlocked('concurrent-local-change');
  const candidate=await buildCheckpointCandidate(ownerUid,remote,after,max);
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const final=await repository.read();
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  if(!same(final,after))throw new ReconciliationBlocked('concurrent-local-change');
  return candidate;
}
