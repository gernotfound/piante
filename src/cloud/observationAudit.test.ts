import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, type CloudJournalRecord } from './journal';
import { ObservationAuditBlocked, buildObservationAudit, inspectObservationAudit, type ObservationRow } from './observationAudit';
import { type CloudJournalReader } from './reconciliationPreview';
import { type CheckpointCandidate } from './checkpointCandidate';

const a='123e4567-e89b-42d3-a456-426614174000';
const b='123e4567-e89b-42d3-a456-426614174001';
const sha='a'.repeat(64);
const candidate:CheckpointCandidate={
  status:'candidate-only',ownerUid:'alice',receiptCount:2,
  observedPrefixes:{[a]:1,[b]:1},sha256:sha,compactionAuthorized:false
};
const obs=(id:string,prefixes:Record<string,number>,hash=sha,owner='alice')=>({
  id,data:{protocol:1,status:'observation-only',compactionAuthorized:false,
    ownerUid:owner,replicaId:id,receiptCount:Object.values(prefixes).reduce((x,y)=>x+y,0),
    observedPrefixes:prefixes,sha256:hash}
}) as ObservationRow;
let n=0;
const local=()=>new LocalGardenRepository('user:alice',{
  dbName:'m5b3-observation-audit-'+(++n),now:()=>1000
});
const plant=(id:string)=>({type:'plant.create',plant:{
  id,commonName:id,origin:'seed',status:'active'
}}) as const;
async function remote(repo:LocalGardenRepository):Promise<CloudJournalRecord[]>{
  const env=await repo.read();
  return env.pending.map(p=>prepareCloudRecord('alice',env,p));
}
const journal=(records:CloudJournalRecord[]):CloudJournalReader=>({
  readAll:async()=>records.map(data=>({id:data.operationId,data}))
});
beforeEach(()=>vi.stubGlobal('crypto',{
  randomUUID:webcrypto.randomUUID.bind(webcrypto),subtle:webcrypto.subtle
}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('M5b-3 read-only observation audit (CRITICAL)',()=>{
  it('treats same-frontier equality as advisory and allows honest historical hashes',()=>{
    const rows=[obs(a,{[a]:1},'b'.repeat(64)),obs(b,{[b]:1,[a]:1})];
    const result=buildObservationAudit(candidate,rows);
    expect(result).toEqual({
      status:'audit-only',compactionAuthorized:false,ownerUid:'alice',
      candidateSha256:sha,candidateReceiptCount:2,observationCount:2,
      matchingCurrentCount:1,historicalCount:1
    });
    expect(buildObservationAudit(candidate,[...rows].reverse())).toEqual(result);
    expect(buildObservationAudit(candidate,[])).toMatchObject({
      observationCount:0,matchingCurrentCount:0,historicalCount:0,
      compactionAuthorized:false
    });
  });

  it('blocks disagreeing hashes for equal historical prefixes across replicas',()=>{
    expect(()=>buildObservationAudit(candidate,[
      obs(a,{[a]:1},'b'.repeat(64)),
      obs(b,{[a]:1},'c'.repeat(64))
    ])).toThrowError(/digest-disagreement/);
  });

  it('requires exact canonical fingerprint when a client claims the full current prefix',()=>{
    for(const rows of [
      [obs(a,{[b]:1,[a]:1},'0'.repeat(64))],
      [obs(a,{[a]:2},sha)],
      [obs(a,{[a]:1,[b]:2},sha)]
    ]){
      expect(()=>buildObservationAudit(candidate,rows)).toThrow();
    }
  });

  it('rejects untrusted records, mismatched ids, owner, schema and duplicates',()=>{
    const good=obs(a,{[a]:1});
    for(const rows of [
      [good,good],
      [{...good,id:'wrong'}],
      [obs(a,{[a]:1},sha,'bob')],
      [{id:a,data:{...(good.data as object),compactionAuthorized:true}}],
      [{id:a,data:{...(good.data as object),protocol:2}}],
      [{id:a,data:{...(good.data as object),sha256:'bad'}}],
      [obs(a,{[a]:1},sha),obs(a,{[a]:1},sha)]
    ]){
      expect(()=>buildObservationAudit(candidate,rows)).toThrow();
    }
  });

  it('refuses oversized reads before parsing and invalid max values',()=>{
    const garbage={id:'garbage',data:{}} as ObservationRow;
    expect(()=>buildObservationAudit(candidate,Array(201).fill(garbage)))
      .toThrowError(/limit-exceeded/);
    for(const max of [0,201,-1,1.1]){
      expect(()=>buildObservationAudit(candidate,[],max))
        .toThrowError(/limit-exceeded/);
    }
  });

  it('performs two server-backed reads but never changes IndexedDB or pending',async()=>{
    const repo=local();
    await repo.commit(plant('avocado'));
    const before=await repo.read(),records=await remote(repo);
    const scanned=vi.fn(async()=>[obs(before.replicaId,{
      [before.replicaId]:1
    },await (async()=>{
      // The actual candidate digest, not a hand-picked trusted hash.
      const {buildCheckpointCandidate}=await import('./checkpointCandidate');
      const result=await buildCheckpointCandidate('alice',
        records.map(data=>({id:data.operationId,data})),before);
      return result.sha256;
    })())]);
    const actual=await inspectObservationAudit(repo,journal(records),{
      readAll:scanned
    },'alice',()=>true);
    expect(actual).toMatchObject({status:'audit-only',compactionAuthorized:false,
      observationCount:1,matchingCurrentCount:1,historicalCount:0});
    expect(scanned).toHaveBeenCalledTimes(1);
    expect(await repo.read()).toEqual(before);
  });

  it('blocks an unconfirmed local pending before reading observations',async()=>{
    const repo=local();
    await repo.commit(plant('papaya'));
    const scan=vi.fn(async()=>[]);
    await expect(inspectObservationAudit(repo,journal([]),{readAll:scan},
      'alice',()=>true)).rejects.toMatchObject({reason:'pending-not-confirmed'});
    expect(scan).not.toHaveBeenCalled();
    expect((await repo.read()).pending).toHaveLength(1);
  });

  it('blocks Auth changes, local edits during observation scan and network failures',async()=>{
    const repo=local();
    await repo.commit(plant('first'));
    const rows=await remote(repo);
    let authorized=true;
    const altered={
      readAll:async()=>{authorized=false;return [];}
    };
    await expect(inspectObservationAudit(repo,journal(rows),altered,
      'alice',()=>authorized)).rejects.toMatchObject({reason:'identity-changed'});
    authorized=true;
    const concurrent={
      readAll:async()=>{await repo.commit(plant('second'));return [];}
    };
    await expect(inspectObservationAudit(repo,journal(rows),concurrent,
      'alice',()=>true)).rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await repo.read()).pending).toHaveLength(2);
    const freshRows=await remote(repo);
    await expect(inspectObservationAudit(repo,journal(freshRows),{
      readAll:async()=>{throw new Error('network offline');}
    },'alice',()=>true)).rejects.toMatchObject({reason:'remote-unavailable'});
    await expect(inspectObservationAudit(repo,journal(freshRows),{
      readAll:async()=>{throw new ObservationAuditBlocked('limit-exceeded');}
    },'alice',()=>true)).rejects.toMatchObject({reason:'limit-exceeded'});

    expect((await repo.read()).pending).toHaveLength(2);
  });
});
