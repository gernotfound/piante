import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LocalGardenRepository } from '../storage/localRepository';
import { prepareCloudRecord, type CloudJournalRecord } from './journal';
import { type CloudJournalReader } from './reconciliationPreview';
import {
  checkpointObservationSchema, prefixesCover, publishCheckpointObservation,
  type CheckpointObservationPort
} from './checkpointObservation';

let id=0;
const local=()=>new LocalGardenRepository('user:alice',{dbName:'m5b2-local-'+(++id),now:()=>1000});
const plant=(name:string)=>({type:'plant.create',plant:{
  id:name,commonName:name,origin:'seed',status:'active'
}}) as const;
async function cloud(repo:LocalGardenRepository){
  const e=await repo.read();
  return e.pending.map(p=>prepareCloudRecord('alice',e,p));
}
const reader=(items:CloudJournalRecord[]):CloudJournalReader=>({
  readAll:async()=>items.map(data=>({id:data.operationId,data}))
});
beforeEach(()=>vi.stubGlobal('crypto',{
  randomUUID:webcrypto.randomUUID.bind(webcrypto),subtle:webcrypto.subtle
}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('M5b-2 advisory observations: fail-closed, no GC (CRITICAL)',()=>{
  it('strictly validates prefixes, digest and non-authoritative status',()=>{
    const valid={protocol:1,status:'observation-only',compactionAuthorized:false,
      ownerUid:'alice',replicaId:'123e4567-e89b-42d3-a456-426614174000',
      receiptCount:1,observedPrefixes:{'123e4567-e89b-42d3-a456-426614174000':1},
      sha256:'a'.repeat(64)};
    expect(checkpointObservationSchema.parse(valid)).toEqual(valid);
    for(const bad of [
      {...valid,compactionAuthorized:true},
      {...valid,receiptCount:0},
      {...valid,observedPrefixes:{}},
      {...valid,sha256:'INVALID'},
      {...valid,protocol:2},
      {...valid,unexpected:'private'}
    ])expect(checkpointObservationSchema.safeParse(bad).success).toBe(false);
    expect(prefixesCover({a:2,b:1},{a:1})).toBe(true);
    expect(prefixesCover({a:1},{a:1,b:1})).toBe(false);
  });

  it('publishes a validated candidate without changing IndexedDB or removing pending history',async()=>{
    const repo=local();await repo.commit(plant('guava'));
    const before=await repo.read();
    const rows=await cloud(repo);
    const saveAndVerify=vi.fn(async()=> 'created' as const);
    const result=await publishCheckpointObservation(repo,reader(rows),{saveAndVerify},'alice',()=>true);
    expect(result.status).toBe('server-observation-only');
    expect(result.outcome).toBe('created');
    expect(result.compactionAuthorized).toBe(false);
    expect(result.observation).toMatchObject({receiptCount:1,observedPrefixes:{[before.replicaId]:1}});
    expect(result.observation.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(saveAndVerify).toHaveBeenCalledTimes(1);
    expect(await repo.read()).toEqual(before);
  });

  it('blocks unconfirmed pending and revoked Auth before writing any observation',async()=>{
    const repo=local();await repo.commit(plant('feijoa'));
    const saveAndVerify=vi.fn(async()=> 'created' as const);
    await expect(publishCheckpointObservation(repo,reader([]),{saveAndVerify},'alice',()=>true))
      .rejects.toMatchObject({reason:'pending-not-confirmed'});
    expect(saveAndVerify).not.toHaveBeenCalled();
    let granted=true;
    const revoked:CloudJournalReader={readAll:async()=>{granted=false;return [];}};
    await expect(publishCheckpointObservation(repo,revoked,{saveAndVerify},'alice',()=>granted))
      .rejects.toMatchObject({reason:'identity-changed'});
    expect(saveAndVerify).not.toHaveBeenCalled();
  });

  it('refuses a cloud write if IndexedDB changes during scan',async()=>{
    const repo=local();await repo.commit(plant('a'));
    const data=await cloud(repo);
    const scan:CloudJournalReader={readAll:async()=>{await repo.commit(plant('b'));
      return data.map(row=>({id:row.operationId,data:row}));
    }};
    const writer=vi.fn(async()=> 'created' as const);
    await expect(publishCheckpointObservation(repo,scan,{saveAndVerify:writer},'alice',()=>true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect(writer).not.toHaveBeenCalled();
    expect((await repo.read()).pending).toHaveLength(2);
  });

  it('refuses to claim success if local data or Auth changes after a cloud write',async()=>{
    const repo=local();await repo.commit(plant('first'));
    const data=await cloud(repo);
    const saveAndVerify=vi.fn(async()=>{
      await repo.commit(plant('second'));
      return 'created' as const;
    });
    await expect(publishCheckpointObservation(repo,reader(data),{saveAndVerify},'alice',()=>true))
      .rejects.toMatchObject({reason:'concurrent-local-change'});
    expect((await repo.read()).pending).toHaveLength(2);
    const other=local();await other.commit(plant('first'));
    const otherRows=await cloud(other);
    let active=true;
    const port:CheckpointObservationPort={saveAndVerify:async()=>{active=false;return 'created';}};
    await expect(publishCheckpointObservation(other,reader(otherRows),port,'alice',()=>active))
      .rejects.toMatchObject({reason:'identity-changed'});
  });

  it('propagates ambiguous server failures rather than reporting a durable checkpoint',async()=>{
    const repo=local();await repo.commit(plant('avocado'));
    const before=await repo.read();
    const rows=await cloud(repo);
    await expect(publishCheckpointObservation(repo,reader(rows),{
      saveAndVerify:async()=>{throw {code:'unavailable'};}
    },'alice',()=>true)).rejects.toEqual({code:'unavailable'});
    expect(await repo.read()).toEqual(before);
  });
});
