import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc,setDoc,getDoc } from 'firebase/firestore';
import { causalReceiptV2Schema } from '../../src/cloud/causalV2';

let env:RulesTestEnvironment;
const rid='123e4567-e89b-42d3-a456-426614174000';
const operation={type:'plant.create',plant:{
  id:'avocado',commonName:'Avocado',origin:'seed',status:'active'
}};
const client=(uid?:string)=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const path=(uid:string)=>'piante_users/'+uid+'/operations/'+rid+':1';
const rawV2=()=>causalReceiptV2Schema.parse({
  protocol:2,ownerUid:'alice',membershipEpoch:1,
  replicaId:rid,sequence:1,operationId:rid+':1',
  appliedAt:1000,observedPrefixes:{[rid]:0},operation
});
beforeAll(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore Emulator required');
  env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{
    host:'127.0.0.1',port:8177
  }});
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:true});
  });
});
afterAll(async()=>{await env?.cleanup();});
describe('M5c-1 v2 laboratory protocol must remain outside v1 Firestore Rules',()=>{
  it('rejects all v2 journal receipts even for a granted owner',async()=>{
    const v2=rawV2();
    expect(v2.protocol).toBe(2);
    await assertFails(setDoc(doc(client('alice'),path('alice')),v2));
    // Original v1 receipt is still allowed; no implicit v2 migration.
    const v1={protocol:1,ownerUid:'alice',operationId:rid+':1',
      replicaId:rid,sequence:1,appliedAt:1000,operation};
    await assertSucceeds(setDoc(doc(client('alice'),path('alice')),v1));
    expect((await getDoc(doc(client('alice'),path('alice')))).data()).toEqual(v1);
  });
  it('denies future v2 namespaces, anonymous and foreign writes',async()=>{
    const v2=rawV2();
    await assertFails(setDoc(doc(client('alice'),
      'piante_users/alice/causal_v2/'+rid),v2));
    await assertFails(setDoc(doc(client(),
      'piante_users/alice/operations/'+rid+':1'),v2));
    await assertFails(setDoc(doc(client('bob'),
      'piante_users/alice/operations/'+rid+':1'),v2));
  });
});
