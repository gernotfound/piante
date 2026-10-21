import { describe, expect, it, vi } from 'vitest';
import { buildObservationAudit, inspectObservationAudit, type ObservationRow } from './observationAudit';

const a='123e4567-e89b-42d3-a456-426614174000';
const b='123e4567-e89b-42d3-a456-426614174001';
const c='123e4567-e89b-42d3-a456-426614174002';
const row=(id:string,prefixes:Record<string,number>,hash='a'.repeat(64)):ObservationRow=>({
  id,data:{protocol:1,status:'observation-only',compactionAuthorized:false,
    ownerUid:'alice',replicaId:id,receiptCount:Object.values(prefixes).reduce((x,y)=>x+y,0),
    observedPrefixes:prefixes,sha256:hash}
});
describe('M5b-3 cross-replica advisory audit (no GC)',()=>{
  it('sorts validated observation records and never interprets matching digests as compaction permission',()=>{
    const result=buildObservationAudit('alice',[row(b,{[a]:1}),row(a,{[a]:1})]);
    expect(result.status).toBe('advisory-audit-only');
    expect(result.compactionAuthorized).toBe(false);
    expect(result.observations.map(x=>x.replicaId)).toEqual([a,b]);
    expect(result.replicaCount).toBe(2);
    expect(result.discrepancies).toEqual([]);
    expect(result.incomparablePairs).toBe(0);
  });
  it('flags equal prefixes with divergent client assertions and disjoint observations',()=>{
    const report=buildObservationAudit('alice',[
      row(a,{[a]:1}),row(b,{[a]:1},'b'.repeat(64)),row(c,{[c]:1})
    ]);
    expect(report.discrepancies).toEqual([{left:a,right:b,reason:'same-prefix-different-digest'}]);
    expect(report.incomparablePairs).toBe(2);
    expect(report.compactionAuthorized).toBe(false);
  });
  it('fails closed for foreign owner, mismatched key, corrupted schema, forged authority, duplicate and unknown protocol',()=>{
    const normal=row(a,{[a]:1});
    for(const invalid of [
      {...normal,data:{...normal.data,ownerUid:'bob'}},
      {...normal,id:b},
      {...normal,data:{...normal.data,protocol:2}},
      {...normal,data:{...normal.data,compactionAuthorized:true}},
      {...normal,data:{...normal.data,sha256:'invalid'}},
      {...normal,data:{...normal.data,observedPrefixes:{[a]:2}}},
      {...normal,data:{...normal.data,unexpected:5}}
    ]){
      expect(()=>buildObservationAudit('alice',[invalid])).toThrow('invalid-receipt');
    }
    expect(()=>buildObservationAudit('alice',[normal,normal])).toThrow('invalid-receipt');
  });
  it('rejects an oversized result before parsing and enforces a strict 200-document cap',()=>{
    const bad:ObservationRow={id:'nonsense',data:null};
    expect(()=>buildObservationAudit('alice',[bad,bad],1)).toThrow('limit-exceeded');
    expect(()=>buildObservationAudit('alice',[],201)).toThrow('limit-exceeded');
    expect(()=>buildObservationAudit('alice',[],0)).toThrow('limit-exceeded');
    expect(()=>buildObservationAudit('alice',[],1.5)).toThrow('limit-exceeded');
  });
  it('prevents stale authorization and wraps ambiguous remote failures',async()=>{
    let granted=true;
    const reader={readAll:vi.fn(async()=>{granted=false;return [row(a,{[a]:1})];})};
    await expect(inspectObservationAudit(reader,'alice',()=>granted))
      .rejects.toMatchObject({reason:'identity-changed'});
    expect(()=>buildObservationAudit('bad uid',[])).toThrow('identity-changed');
    expect(reader.readAll).toHaveBeenCalledTimes(1);
    const never=vi.fn();
    await expect(inspectObservationAudit({readAll:never},'alice',()=>false))
      .rejects.toMatchObject({reason:'identity-changed'});
    expect(never).not.toHaveBeenCalled();
    await expect(inspectObservationAudit({readAll:async()=>{throw Error('offline');}},
      'alice',()=>true)).rejects.toMatchObject({reason:'remote-unavailable'});
  });
});
