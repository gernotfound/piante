import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, type CloudJournalRecord } from './journal';
import { buildCheckpointCandidate } from './checkpointCandidate';
import { type CloudJournalReader } from './reconciliationPreview';
import { type ObservationReader, type ObservationRow } from './observationAudit';
import { inspectObservationPreflight } from './observationPreflight';

let counter=0;
const repo=()=>new LocalGardenRepository('user:alice',{
  dbName:'m5b3-cross-verified-'+(++counter),now:()=>1000
});
const plant=(name:string)=>({type:'plant.create',plant:{
  id:name,commonName:name,origin:'seed',status:'active'
}}) as const;
const receipts=async(local:LocalGardenRepository)=>{
  const env=await local.read();
  return env.pending.map(p=>prepareCloudRecord('alice',env,p));
};
const journal=(records:readonly CloudJournalRecord[]):CloudJournalReader=>({
  readAll:async()=>records.map(data=>({id:data.operationId,data}))
});
const source=(rows:readonly ObservationRow[]):ObservationReader=>({
  readAll:async()=>rows
});
const observation=(replicaId:string,prefixes:Record<string,number>,sha256:string):ObservationRow=>({
  id:replicaId,
  data:{protocol:1,status:'observation-only',compactionAuthorized:false,
    ownerUid:'alice',replicaId,
    receiptCount:Object.values(prefixes).reduce((sum,n)=>sum+n,0),
    observedPrefixes:prefixes,sha256}
});
async function setup(){
  const first=repo(),second=repo();
  await first.commit(plant('passiflora'));
  await second.commit(plant('feijoa'));
  const rows=[...await receipts(first),...await receipts(second)];
  const before=await first.read(),secondState=await second.read();
  const candidate=await buildCheckpointCandidate('alice',
    rows.map(data=>({id:data.operationId,data})),before);
  return {first,second,rows,before,
    a:before.replicaId,b:secondState.replicaId,candidate};
}
beforeEach(()=>vi.stubGlobal('crypto',{
  randomUUID:webcrypto.randomUUID.bind(webcrypto),subtle:webcrypto.subtle
}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('M5b-3b verified advisory preflight (CRITICAL, no GC)',()=>{
  it('cross-checks two replicas and a legitimate historical digest with no journal writes',async()=>{
    const {first,rows,before,a,b,candidate}=await setup();
    const queries=vi.fn(async()=>[
      observation(a,candidate.observedPrefixes,candidate.sha256),
      observation(b,{[a]:1},'b'.repeat(64))
    ]);
    const result=await inspectObservationPreflight(first,journal(rows),
      {readAll:queries},'alice',()=>true);
    expect(result).toEqual({
      status:'cross-check-only',compactionAuthorized:false,ownerUid:'alice',
      receiptCount:2,observationCount:2,matchingCurrentCount:1,historicalCount:1
    });
    expect(queries).toHaveBeenCalledWith('alice',200);
    expect(await first.read()).toEqual(before);
    expect(before.pending).toHaveLength(1);
  });

  it('rejects an apparently agreed full-prefix lie with an untrusted digest',async()=>{
    const {first,rows,before,a,b,candidate}=await setup();
    const lie='f'.repeat(64);
    const forged=[
      observation(a,candidate.observedPrefixes,lie),
      observation(b,candidate.observedPrefixes,lie)
    ];
    await expect(inspectObservationPreflight(first,journal(rows),
      source(forged),'alice',()=>true))
      .rejects.toMatchObject({reason:'digest-disagreement'});
    expect(await first.read()).toEqual(before);
  });

  it('rejects an observed prefix that exceeds the validated server journal',async()=>{
    const {first,rows,before,a,b}=await setup();
    await expect(inspectObservationPreflight(first,journal(rows),
      source([observation(b,{[a]:2},'a'.repeat(64))]),
      'alice',()=>true)).rejects.toMatchObject({reason:'prefix-ahead'});
    expect(await first.read()).toEqual(before);
  });

  it('rejects contradictory same-prefix attestations even when both are historical',async()=>{
    const {first,rows,a,b}=await setup();
    const report=[
      observation(a,{[a]:1},'b'.repeat(64)),
      observation(b,{[a]:1},'c'.repeat(64))
    ];
    await expect(inspectObservationPreflight(first,journal(rows),
      source(report),'alice',()=>true))
      .rejects.toMatchObject({reason:'digest-disagreement'});
  });

  it('blocks pending operations not on the server before scanning observations',async()=>{
    const local=repo();
    await local.commit(plant('new'));
    const before=await local.read();
    const scan=vi.fn(async()=>[]);
    await expect(inspectObservationPreflight(local,journal([]),
      {readAll:scan},'alice',()=>true))
      .rejects.toMatchObject({reason:'pending-not-confirmed'});
    expect(scan).not.toHaveBeenCalled();
    expect(await local.read()).toEqual(before);
  });

  it('blocks an auth epoch change and any local mutation during the second server read',async()=>{
    const {first,rows,before}=await setup();
    let authorized=true;
    await expect(inspectObservationPreflight(first,journal(rows),{
      readAll:async()=>{authorized=false;return [];}
    },'alice',()=>authorized)).rejects.toMatchObject({reason:'identity-changed'});
    authorized=true;
    await expect(inspectObservationPreflight(first,journal(rows),{
      readAll:async()=>{await first.commit(plant('dragonfruit'));return [];}
    },'alice',()=>true)).rejects.toMatchObject({reason:'concurrent-local-change'});
    const after=await first.read();
    expect(after.pending).toHaveLength(before.pending.length+1);
    expect(after.data.plants.dragonfruit.commonName).toBe('dragonfruit');
  });

  it('fails closed on a rejected observation query and prevents cross-owner scans',async()=>{
    const {first,rows,before}=await setup();
    await expect(inspectObservationPreflight(first,journal(rows),{
      readAll:async()=>{throw new Error('Network unavailable');}
    },'alice',()=>true)).rejects.toMatchObject({reason:'remote-unavailable'});
    const forbidden=vi.fn(async()=>[]);
    await expect(inspectObservationPreflight(first,journal(rows),{
      readAll:forbidden
    },'bob',()=>true)).rejects.toMatchObject({reason:'identity-changed'});
    expect(forbidden).not.toHaveBeenCalled();
    expect(await first.read()).toEqual(before);
  });

  it('never treats a zero-replica observation collection as a stable quorum',async()=>{
    const {first,rows,before}=await setup();
    const result=await inspectObservationPreflight(first,journal(rows),
      source([]),'alice',()=>true);
    expect(result).toMatchObject({status:'cross-check-only',
      compactionAuthorized:false,observationCount:0,
      matchingCurrentCount:0,historicalCount:0});
    expect(await first.read()).toEqual(before);
  });
});
