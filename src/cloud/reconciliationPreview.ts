import { cloudJournalRecordSchema, prepareCloudRecord, type CloudJournalRecord } from './journal';
import { applyDomainOperation } from '../domain/operations';
import { emptyGarden, gardenStateSchema, type GardenState } from '../domain/schema';
import { localEnvelopeSchema, LocalGardenRepository, type LocalEnvelope } from '../storage/localRepository';

/**
 * M2d: deterministic journal projection with durable remote receipt baseline.
 * This is NOT a general causal conflict resolver, checkpoint/GC or public sync.
 */
export const MAX_PREVIEW_OPERATIONS = 200;

export type PreviewBlocker =
  | 'identity-changed' | 'remote-unavailable' | 'limit-exceeded'
  | 'invalid-receipt' | 'history-gap' | 'conflicting-writes'
  | 'unresolvable-history' | 'local-divergence' | 'concurrent-local-change';

export class ReconciliationBlocked extends Error {
  constructor(readonly reason: PreviewBlocker) {
    super('Riconciliazione bloccata: ' + reason);
    this.name = 'ReconciliationBlocked';
  }
}
export interface CloudJournalReader {
  /** Complete, server-backed scan; throw on truncation or untrusted cache. */
  readAll(ownerUid: string, max: number): Promise<readonly {id:string;data:unknown}[]>;
}
export interface ReconciliationPreview {
  readonly status: 'preview-only';
  readonly data: GardenState;
  readonly remoteCount: number;
  readonly locallyPendingCount: number;
  readonly operationCount: number;
}
export type JournalRow = {id:string;data:unknown};
const validOwner = (uid:string) => /^[A-Za-z0-9_-]{1,96}$/.test(uid);
const same = (a:unknown,b:unknown):boolean => JSON.stringify(a)===JSON.stringify(b);

function readRow(raw:unknown, owner:string, documentId:string):CloudJournalRecord {
  const parsed=cloudJournalRecordSchema.safeParse(raw);
  if(!parsed.success || parsed.data.ownerUid!==owner || parsed.data.operationId!==documentId) {
    throw new ReconciliationBlocked('invalid-receipt');
  }
  return parsed.data;
}
function sortRows(a:CloudJournalRecord,b:CloudJournalRecord):number {
  return a.appliedAt-b.appliedAt || (a.operationId<b.operationId?-1:a.operationId>b.operationId?1:0);
}
function footprint(row:CloudJournalRecord):readonly string[] {
  const op=row.operation;
  switch(op.type) {
    case 'plant.create':return ['plant:'+op.plant.id+':create'];
    case 'place.create':return ['place:'+op.place.id+':create'];
    case 'event.add':return ['event:'+op.event.id+':create'];
    case 'plant.patch':return Object.keys(op.patch).map(key=>'plant:'+op.id+':'+key);
    case 'place.patch':return Object.keys(op.patch).map(key=>'place:'+op.id+':'+key);
  }
}

/** No reads, writes, network calls or wall-clock dependency. */
function project(
  ownerUid:string, remote:readonly JournalRow[], envelope:LocalEnvelope, max:number
):ReconciliationPreview {
  if(remote.length>max)throw new ReconciliationBlocked('limit-exceeded');
  const byId=new Map<string,CloudJournalRecord>();
  for(const item of remote) {
    const row=readRow(item.data,ownerUid,item.id);
    const prev=byId.get(row.operationId);
    if(prev&&!same(prev,row))throw new ReconciliationBlocked('invalid-receipt');
    byId.set(row.operationId,row);
  }
  for(const pending of envelope.pending) {
    let row:CloudJournalRecord;
    try{row=prepareCloudRecord(ownerUid,envelope,pending);}
    catch{throw new ReconciliationBlocked('local-divergence');}
    const prev=byId.get(row.operationId);
    if(prev&&!same(prev,row))throw new ReconciliationBlocked('invalid-receipt');
    byId.set(row.operationId,row);
  }
  if(byId.size>max)throw new ReconciliationBlocked('limit-exceeded');

  // The journal cannot be garbage-collected without a durable base snapshot
  // and an authenticated cloud watermark. Require all per-replica prefixes.
  const replicas=new Map<string,CloudJournalRecord[]>();
  const mutations=new Map<string,string>();
  for(const row of byId.values()) {
    const rows=replicas.get(row.replicaId)??[];
    rows.push(row);replicas.set(row.replicaId,rows);
    for(const key of footprint(row)) {
      const seen=mutations.get(key);
      if(seen&&seen!==row.replicaId)throw new ReconciliationBlocked('conflicting-writes');
      mutations.set(key,row.replicaId);
    }
  }
  const cursors=new Map<string,number>();
  for(const [id,rows] of replicas) {
    rows.sort((a,b)=>a.sequence-b.sequence);
    for(let i=0;i<rows.length;i++) {
      if(rows[i].sequence!==i+1)throw new ReconciliationBlocked('history-gap');
    }
    cursors.set(id,0);
  }
  let data:GardenState=emptyGarden();
  let remaining=byId.size;
  while(remaining>0) {
    const heads=[...replicas].flatMap(([id,rows])=>{
      const head=rows[cursors.get(id)??0];return head?[head]:[];
    }).sort(sortRows);
    let advanced=false;
    for(const head of heads) {
      try {
        data=applyDomainOperation(data,head.operation,head.appliedAt);
        cursors.set(head.replicaId,(cursors.get(head.replicaId)??0)+1);
        remaining--;advanced=true;break;
      }catch {
        // Another replica may create the prerequisite entity in the next round.
      }
    }
    if(!advanced)throw new ReconciliationBlocked('unresolvable-history');
  }
  return {
    status:'preview-only',data:gardenStateSchema.parse(data),
    remoteCount:remote.length,locallyPendingCount:envelope.pending.length,
    operationCount:byId.size
  };
}

function validateLocal(ownerUid:string,envelope:LocalEnvelope,max:number):void {
  if(envelope.ownerScope!=='user:'+ownerUid)throw new ReconciliationBlocked('identity-changed');
  if(envelope.remoteReceipts.length===0&&envelope.pending.length!==envelope.lastSequence) {
    throw new ReconciliationBlocked('local-divergence');
  }
  // Once hydrated, all local sequence entries must still be present either in
  // the remote authenticated prefix or in the durable pending journal.
  const ownRemote=new Set(envelope.remoteReceipts.filter(r=>r.data.replicaId===envelope.replicaId)
    .map(r=>r.data.sequence));
  const pending=new Set(envelope.pending.map(r=>r.sequence));
  for(let seq=1;seq<=envelope.lastSequence;seq++) {
    if(!ownRemote.has(seq)&&!pending.has(seq))throw new ReconciliationBlocked('local-divergence');
  }
  let reconstructed:GardenState;
  try{reconstructed=project(ownerUid,envelope.remoteReceipts,envelope,max).data;}
  catch(error) {
    if(error instanceof ReconciliationBlocked&&error.reason==='identity-changed')throw error;
    throw new ReconciliationBlocked('local-divergence');
  }
  if(!same(reconstructed,envelope.data))throw new ReconciliationBlocked('local-divergence');
}

export function buildReconciliationPreview(
  ownerUid:string, rawRemote:readonly JournalRow[], rawEnvelope:unknown,
  max=MAX_PREVIEW_OPERATIONS
):ReconciliationPreview {
  if(!validOwner(ownerUid))throw new ReconciliationBlocked('identity-changed');
  if(!Number.isSafeInteger(max)||max<1||max>MAX_PREVIEW_OPERATIONS) {
    throw new ReconciliationBlocked('limit-exceeded');
  }
  const parsed=localEnvelopeSchema.safeParse(rawEnvelope);
  if(!parsed.success)throw new ReconciliationBlocked('local-divergence');
  const envelope=parsed.data;
  if(envelope.ownerScope!=='user:'+ownerUid)throw new ReconciliationBlocked('identity-changed');
  validateLocal(ownerUid,envelope,MAX_PREVIEW_OPERATIONS);
  // Remote append-only receipts must not disappear or change between scans.
  // Firestore query truncation, unexpected server state and clock skew fail closed.
  const latest=new Map<string,CloudJournalRecord>();
  for(const row of rawRemote) {
    const parsedRow=readRow(row.data,ownerUid,row.id);
    const previous=latest.get(row.id);
    if(previous&&!same(previous,parsedRow))throw new ReconciliationBlocked('invalid-receipt');
    latest.set(row.id,parsedRow);
  }
  for(const saved of envelope.remoteReceipts) {
    const current=latest.get(saved.id);
    if(!current||!same(current,saved.data))throw new ReconciliationBlocked('history-gap');
  }
  return project(ownerUid,rawRemote,envelope,max);
}

export async function inspectRemoteJournal(
  repository:LocalGardenRepository,reader:CloudJournalReader,ownerUid:string,
  isStillAuthorized:()=>boolean,max=MAX_PREVIEW_OPERATIONS
):Promise<ReconciliationPreview> {
  if(!isStillAuthorized())throw new ReconciliationBlocked('identity-changed');
  const before=await repository.read();
  if(before.ownerScope!=='user:'+ownerUid)throw new ReconciliationBlocked('identity-changed');
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
  return buildReconciliationPreview(ownerUid,remote,after,max);
}
