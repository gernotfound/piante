import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment, assertFails, type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LocalGardenRepository } from '../../src/storage/localRepository';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { firestoreObservationReader } from '../../src/cloud/firestoreObservationReader';
import { firestoreCheckpointObservationPort } from '../../src/cloud/firestoreCheckpointObservation';
import { publishCheckpointObservation } from '../../src/cloud/checkpointObservation';
import { inspectObservationPreflight } from '../../src/cloud/observationPreflight';

let env:RulesTestEnvironment;
let index=0;
const db=(uid?:string)=>
  uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
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
    await setDoc(doc(ctx.firestore(),'piante_access/bob'),{enabled:true});
  });
});
afterAll(async()=>{await env?.cleanup();});
const local=()=>new LocalGardenRepository('user:alice',{
  dbName:'m5b3-preflight-emulator-'+(++index),now:()=>1000
});
async function setup(){
  const repo=local();
  await repo.commit({type:'plant.create',plant:{
    id:'pitaya',commonName:'Dragon fruit',origin:'cutting',status:'active'
  }});
  const before=await repo.read(),firestore=db('alice');
  await firestoreJournalPort(firestore).appendOnce({
    protocol:1,ownerUid:'alice',
    operationId:before.pending[0].operationId,
    replicaId:before.replicaId,sequence:1,appliedAt:1000,
    operation:before.pending[0].operation
  });
  return {repo,before,firestore,journal:firestoreJournalReader(firestore)};
}
describe('M5b-3b complete server journal/observation preflight (CRITICAL)',()=>{
  it('cross-checks a genuine owner observation and a historical client record, without GC',async()=>{
    const {repo,before,firestore,journal}=await setup();
    const port=firestoreCheckpointObservationPort(firestore);
    const current=await publishCheckpointObservation(repo,journal,port,'alice',()=>true);
    const other='123e4567-e89b-42d3-a456-426614174000';
    const extra=other===before.replicaId
      ?'123e4567-e89b-42d3-a456-426614174001':other;
    await port.saveAndVerify({
      ...current.observation,replicaId:extra,receiptCount:0,
      observedPrefixes:{},sha256:'e'.repeat(64)
    });
    const result=await inspectObservationPreflight(repo,journal,
      firestoreObservationReader(firestore),'alice',()=>true);
    expect(result).toMatchObject({
      status:'cross-check-only',compactionAuthorized:false,
      receiptCount:1,observationCount:2,
      matchingCurrentCount:1,historicalCount:1
    });
    expect((await repo.read())).toEqual(before);
    expect((await getDoc(doc(firestore,
      'piante_users/alice/checkpoint_observations/'+before.replicaId))).data())
      .toEqual(current.observation);
  });

  it('rejects well-formed but false full-prefix hashes and unseen server receipts',async()=>{
    const {repo,before,firestore,journal}=await setup();
    const path='piante_users/alice/checkpoint_observations/'+before.replicaId;
    const forged={protocol:1,status:'observation-only',compactionAuthorized:false,
      ownerUid:'alice',replicaId:before.replicaId,receiptCount:1,
      observedPrefixes:{[before.replicaId]:1},sha256:'f'.repeat(64)};
    // An owner may write syntactically valid but untrue assertions. Rules alone
    // cannot establish the real journal digest.
    await setDoc(doc(firestore,path),forged);
    const obs=firestoreObservationReader(firestore);
    await expect(inspectObservationPreflight(repo,journal,obs,'alice',()=>true))
      .rejects.toMatchObject({reason:'digest-disagreement'});
    await updateDoc(doc(firestore,path),{
      receiptCount:2,observedPrefixes:{[before.replicaId]:2}
    });
    await expect(inspectObservationPreflight(repo,journal,obs,'alice',()=>true))
      .rejects.toMatchObject({reason:'prefix-ahead'});
    expect(await repo.read()).toEqual(before);
  });

  it('rejects a new receipt appended to Firestore after the observation server query',async()=>{
    const {repo,before,firestore,journal}=await setup();
    const baseReader=firestoreObservationReader(firestore);
    const candidate='123e4567-e89b-42d3-a456-426614174000';
    const replica=candidate===before.replicaId
      ?'123e4567-e89b-42d3-a456-426614174001':candidate;
    const duringObservation={
      readAll:async(ownerUid:string,max:number)=>{
        const previous=await baseReader.readAll(ownerUid,max);
        await firestoreJournalPort(firestore).appendOnce({
          protocol:1,ownerUid:'alice',replicaId:replica,
          operationId:replica+':1',sequence:1,appliedAt:1001,
          operation:{type:'plant.create',plant:{
            id:'guava-late',commonName:'Guava tardiva',
            origin:'seed',status:'active'
          }}
        });
        return previous;
      }
    };
    await expect(inspectObservationPreflight(repo,journal,duringObservation,
      'alice',()=>true)).rejects.toMatchObject({reason:'remote-changed'});
    expect(await repo.read()).toEqual(before);
    expect(before.pending).toHaveLength(1);
  });

  it('blocks a grant revocation occurring after the observation scan',async()=>{
    const {repo,before,firestore,journal}=await setup();
    const baseReader=firestoreObservationReader(firestore);
    const revokeAfterRead={
      readAll:async(ownerUid:string,max:number)=>{
        const rows=await baseReader.readAll(ownerUid,max);
        await env.withSecurityRulesDisabled(async ctx=>{
          await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
        });
        return rows;
      }
    };
    await expect(inspectObservationPreflight(repo,journal,revokeAfterRead,
      'alice',()=>true)).rejects.toMatchObject({reason:'remote-unavailable'});
    expect(await repo.read()).toEqual(before);
    expect(before.pending).toHaveLength(1);
  });

  it('denies foreign and revoked access, and keeps all local pending intents',async()=>{
    const {repo,before,firestore,journal}=await setup();
    const ownReader=firestoreObservationReader(firestore);
    await assertFails(getDoc(doc(db(),
      'piante_users/alice/checkpoint_observations/'+before.replicaId)));
    await expect(inspectObservationPreflight(repo,journal,
      firestoreObservationReader(db('bob')),'alice',()=>true))
      .rejects.toMatchObject({reason:'remote-unavailable'});
    await env.withSecurityRulesDisabled(async ctx=>{
      await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
    });
    await expect(inspectObservationPreflight(repo,journal,
      ownReader,'alice',()=>true))
      .rejects.toMatchObject({reason:'remote-unavailable'});
    expect(await repo.read()).toEqual(before);
  });
});
