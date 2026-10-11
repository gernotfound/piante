import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, type CloudJournalRecord } from './journal';
import { buildCheckpointCandidate, inspectCheckpointCandidate } from './checkpointCandidate';
import { type CloudJournalReader } from './reconciliationPreview';

let number=0;
const repo=()=>new LocalGardenRepository('user:alice',{
  dbName:'m5b-candidate-'+(++number),now:()=>1000
});
const plant=(id:string)=>({type:'plant.create',plant:{
  id,commonName:id,origin:'seed',status:'active'
}}) as const;
async function receipts(r:LocalGardenRepository):Promise<CloudJournalRecord[]> {
  const envelope=await r.read();
  return envelope.pending.map(item=>prepareCloudRecord('alice',envelope,item));
}
const wrap=(rows:readonly CloudJournalRecord[])=>rows.map(row=>({id:row.operationId,data:row}));
const reader=(rows:readonly CloudJournalRecord[]):CloudJournalReader=>({
  readAll:async()=>wrap(rows)
});

beforeEach(()=>vi.stubGlobal('crypto',{
  subtle:webcrypto.subtle,randomUUID:webcrypto.randomUUID.bind(webcrypto)
}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('M5b read-only checkpoint preflight (CRITICAL)',()=>{
  it('produces a deterministic server-only fingerprint and observed prefixes for two devices',async()=>{
    const a=repo(),b=repo();
    await a.commit(plant('guava'));
    await b.commit(plant('feijoa'));
    const rows=[...await receipts(a),...await receipts(b)];
    const before=await a.read();
    const one=await inspectCheckpointCandidate(a,reader(rows),'alice',()=>true);
    const two=await inspectCheckpointCandidate(a,reader([...rows].reverse()),'alice',()=>true);
    expect(one).toEqual(two);
    expect(one).toEqual({
      status:'candidate-only',ownerUid:'alice',receiptCount:2,
      observedPrefixes:{
        [before.replicaId]:1,
        [(await b.read()).replicaId]:1
      },
      sha256:expect.stringMatching(/^[a-f0-9]{64}$/),
      compactionAuthorized:false
    });
    expect(await a.read()).toEqual(before);
  });

  it('does not produce a candidate when local pending has not been confirmed by the server',async()=>{
    const local=repo();await local.commit(plant('avocado'));
    const before=await local.read();
    await expect(inspectCheckpointCandidate(local,reader([]),'alice',()=>true))
      .rejects.toMatchObject({reason:'pending-not-confirmed'});
    expect(await local.read()).toEqual(before);
  });

  it('rejects malformed, duplicated, foreign and incomplete server history',async()=>{
    const local=repo(),origin=repo();
    await origin.commit(plant('papaya'));
    await origin.commit(plant('dragon'));
    const env=await local.read();
    const [first,second]=await receipts(origin);
    const badCases=[
      [{id:'forged',data:first}],
      [{id:first.operationId,data:{...first,ownerUid:'bob'}}],
      wrap([first,first]),
      wrap([second])
    ];
    for(const rows of badCases){
      await expect(buildCheckpointCandidate('alice',rows,env)).rejects.toThrow();
    }
    expect(await local.read()).toEqual(env);
  });

  it('rejects scan truncation beyond 200 and does not mistake it for a checkpoint',async()=>{
    const local=repo();
    const envelope=await local.read();
    const row={
      id:'ignored',data:{garbage:true}
    };
    await expect(buildCheckpointCandidate('alice',Array.from({length:201},()=>row),envelope))
      .rejects.toMatchObject({reason:'limit-exceeded'});
  });

  it('invalidates a server scan when a parallel local edit commits',async()=>{
    const local=repo();await local.commit(plant('first'));
    const rows=await receipts(local);
    const scan:CloudJournalReader={readAll:async()=>{
      await local.commit(plant('later'));
      return wrap(rows);
    }};
    await expect(inspectCheckpointCandidate(local,scan,'alice',()=>true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await local.read()).pending).toHaveLength(2);
  });

  it('detects a local edit even if it commits during asynchronous hashing',async()=>{
    const local=repo();await local.commit(plant('first'));
    const rows=await receipts(local);
    vi.stubGlobal('crypto',{
      randomUUID:webcrypto.randomUUID.bind(webcrypto),
      subtle:{digest:async()=>{
        await local.commit(plant('later'));
        return new ArrayBuffer(32);
      }}
    });
    await expect(inspectCheckpointCandidate(local,reader(rows),'alice',()=>true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await local.read()).pending).toHaveLength(2);
  });

  it('fails closed on authorization changes, network errors and unavailable crypto',async()=>{
    const local=repo();await local.commit(plant('first'));
    const rows=await receipts(local);
    let authorized=true;
    const revoked:CloudJournalReader={readAll:async()=>{authorized=false;return wrap(rows);}};
    await expect(inspectCheckpointCandidate(local,revoked,'alice',()=>authorized))
      .rejects.toMatchObject({reason:'identity-changed'});
    await expect(inspectCheckpointCandidate(local,{readAll:async()=>{throw Error('offline');}},'alice',()=>true))
      .rejects.toMatchObject({reason:'remote-unavailable'});
    await expect(inspectCheckpointCandidate(local,reader(rows),'bob',()=>true))
      .rejects.toMatchObject({reason:'identity-changed'});
    vi.stubGlobal('crypto',{randomUUID:webcrypto.randomUUID.bind(webcrypto)});
    await expect(inspectCheckpointCandidate(local,reader(rows),'alice',()=>true))
      .rejects.toMatchObject({reason:'hash-unavailable'});
    expect((await local.read()).pending).toHaveLength(1);
  });

  it('refuses quarantined backup replicas before any cloud read',async()=>{
    const source=repo();await source.commit(plant('restored'));
    const target=repo();
    await target.restoreEmptyFromBackup(await source.read(),()=>true);
    const before=await target.read();
    const readAll=vi.fn(async()=>[]);
    await expect(inspectCheckpointCandidate(target,{readAll},'alice',()=>true))
      .rejects.toMatchObject({reason:'backup-quarantined'});
    expect(readAll).not.toHaveBeenCalled();
    expect(await target.read()).toEqual(before);
  });
});
