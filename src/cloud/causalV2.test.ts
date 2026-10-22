import { describe,expect,it } from 'vitest';
import { analyzeCausalV2,causalReceiptV2Schema,CausalV2Blocked } from './causalV2';

const A='123e4567-e89b-42d3-a456-426614174000';
const B='123e4567-e89b-42d3-a456-426614174001';
const C='123e4567-e89b-42d3-a456-426614174002';
const receipt=(replicaId:string,sequence:number,seen:Record<string,number>,
  extra:Record<string,unknown>={})=>{
  const id=replicaId+':'+sequence;
  return {id,data:{
    protocol:2,ownerUid:'alice',membershipEpoch:1,replicaId,
    operationId:id,sequence,appliedAt:1000,
    observedPrefixes:seen,
    operation:{type:'plant.create',plant:{
      id:'p-'+replicaId.slice(-2)+'-'+sequence,
      commonName:'Talea',origin:'cutting',status:'active'
    }},...extra
  }};
};
const a1=()=>receipt(A,1,{[A]:0});
const b1=()=>receipt(B,1,{[B]:0});
const a2=(deps:Record<string,number>={})=>receipt(A,2,{[A]:1,...deps});
const b2=(deps:Record<string,number>={})=>receipt(B,2,{[B]:1,...deps});
const code=(fn:()=>unknown,reason:string)=>{
  try{fn();throw Error('expected failure');}
  catch(e){
    expect(e).toBeInstanceOf(CausalV2Blocked);
    expect(e).toMatchObject({reason});
  }
};
describe('M5c-1 strict causal v2 laboratory contract (CRITICAL)',()=>{
  it('enforces a future v2-only versioned, owner-scoped, canonical receipt schema',()=>{
    const parsed=causalReceiptV2Schema.parse(a1().data);
    expect(parsed).toMatchObject({protocol:2,ownerUid:'alice',membershipEpoch:1});
    for(const bad of [
      {...a1().data,protocol:1},
      {...a1().data,protocol:3},
      {...a1().data,malicious:'private data'},
      {...a1().data,ownerUid:'../../bob'},
      {...a1().data,membershipEpoch:0},
      {...a1().data,observedPrefixes:{[A]:1}},
      {...a1().data,observedPrefixes:{[A]:-1}},
      {...a1().data,operationId:'forged'},
      {...a1().data,observedPrefixes:{['__proto__']:1,[A]:0}},
      {...a1().data,observedPrefixes:{unexpected:1,[A]:0}},
      {...a1().data,observedPrefixes:new Date()}
    ]){
      expect(causalReceiptV2Schema.safeParse(bad).success).toBe(false);
    }
  });

  it('does not serialize two independent replica writes into a trusted total order',()=>{
    const report=analyzeCausalV2('alice',[b1(),a1()]);
    expect(report).toEqual({
      status:'diagnostic-only',compactionAuthorized:false,
      ownerUid:'alice',membershipEpoch:1,receiptCount:2,
      layers:[[A+':1',B+':1']],concurrentPairs:1,
      requiresConflictResolution:true
    });
    expect(analyzeCausalV2('alice',[a1(),b1()])).toEqual(report);
  });

  it('recognizes explicit happened-before dependencies, independent of input order and timestamps',()=>{
    const ordered=receipt(B,1,{[B]:0,[A]:1},{appliedAt:1});
    const report=analyzeCausalV2('alice',[ordered,a1()]);
    expect(report.layers).toEqual([[A+':1'],[B+':1']]);
    expect(report.concurrentPairs).toBe(0);
    expect(report.requiresConflictResolution).toBe(false);
    expect(report.compactionAuthorized).toBe(false);
  });

  it('validates transitive causality across three replicas and reports concurrent branches',()=>{
    const c1=receipt(C,1,{[C]:0,[A]:1,[B]:1});
    const history=[a1(),b1(),c1,b2({[A]:1})];
    const report=analyzeCausalV2('alice',history);
    expect(report.layers).toEqual([
      [A+':1',B+':1'],
      [B+':2',C+':1']
    ]);
    expect(report.concurrentPairs).toBe(2); // A1/B1 and C1/B2
    expect(report.requiresConflictResolution).toBe(true);
  });

  it('rejects missing, duplicated, foreign and gapped receipt histories',()=>{
    const bad=[
      {rows:[a2()],reason:'history-gap'},
      {rows:[a1(),a1()],reason:'invalid-receipt'},
      {rows:[{...a1(),id:'wrong'}],reason:'invalid-receipt'},
      {rows:[receipt(A,1,{[A]:0,[B]:1})],reason:'missing-dependency'},
      {rows:[a1(),receipt(A,3,{[A]:2})],reason:'history-gap'},
      {rows:[a1(),receipt(B,1,{[B]:0},{ownerUid:'bob'})],reason:'invalid-receipt'}
    ];
    for(const item of bad)code(()=>analyzeCausalV2('alice',item.rows),item.reason);
  });

  it('rejects epoch jumps without authenticated membership fencing',()=>{
    code(()=>analyzeCausalV2('alice',[a1(),
      receipt(B,1,{[B]:0},{membershipEpoch:2})
    ]),'epoch-mismatch');
    // Even two syntactically valid receipts at the same epoch are not
    // trusted provider membership evidence.
    expect(analyzeCausalV2('alice',[a1(),b1()]).compactionAuthorized).toBe(false);
  });

  it('rejects a replica forgetting an ancestor observed by its previous event',()=>{
    const prior=receipt(A,1,{[A]:0,[B]:1});
    code(()=>analyzeCausalV2('alice',[b1(),prior,a2()]),'causal-regression');
  });

  it('rejects dependency cycles with no initial causal source',()=>{
    const aa=receipt(A,1,{[A]:0,[B]:1});
    const bb=receipt(B,1,{[B]:0,[A]:1});
    expect(()=>analyzeCausalV2('alice',[aa,bb])).toThrow(CausalV2Blocked);
  });

  it('rejects truncation and unsafe analysis sizes before parsing data',()=>{
    code(()=>analyzeCausalV2('alice',[]),'invalid-receipt');
    code(()=>analyzeCausalV2('alice',[a1()],0),'limit-exceeded');
    code(()=>analyzeCausalV2('alice',[a1()],1001),'limit-exceeded');
    code(()=>analyzeCausalV2('alice',[a1(),b1()],1),'limit-exceeded');
    code(()=>analyzeCausalV2('alice',Array.from({length:1001},
      ()=>({id:'garbage',data:{}}))),'limit-exceeded');
  });

  it('can describe 201 contiguous operations without changing the v1 lab Firestore cap',()=>{
    const rows=Array.from({length:201},(_,i)=>receipt(A,i+1,{[A]:i}));
    const report=analyzeCausalV2('alice',[...rows].reverse());
    expect(report.receiptCount).toBe(201);
    expect(report.layers).toHaveLength(201);
    expect(report.concurrentPairs).toBe(0);
    expect(report.compactionAuthorized).toBe(false);
  });
});
