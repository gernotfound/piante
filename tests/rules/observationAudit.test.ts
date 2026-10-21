import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LocalGardenRepository } from '../../src/storage/localRepository';
import { firestoreJournalPort } from '../../src/cloud/firestoreJournal';
import { firestoreJournalReader } from '../../src/cloud/firestoreReader';
import { firestoreObservationReader } from '../../src/cloud/firestoreObservationReader';
import { firestoreCheckpointObservationPort } from '../../src/cloud/firestoreCheckpointObservation';
import { inspectObservationAudit } from '../../src/cloud/observationAudit';
import { publishCheckpointObservation } from '../../src/cloud/checkpointObservation';

let env:RulesTestEnvironment,number=0;
const owner='alice';
const db=(uid?:string)=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
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
const makeRepo=()=>new LocalGardenRepository('user:alice',{
  dbName:'m5b3-emulator-'+(++number),now:()=>1000
});

describe('M5b-3 real server observation audit (CRITICAL)',()=>{
  it('cross-checks an owner observation and historical second replica without GC',async()=>{
    const repo=makeRepo();
    await repo.commit({type:'plant.create',plant:{
      id:'guava',commonName:'Guava',origin:'seed',status:'active'
    }});
    const firestore=db(owner),before=await repo.read();
    await firestoreJournalPort(firestore).appendOnce({
      protocol:1,ownerUid:owner,operationId:before.pending[0].operationId,
      replicaId:before.replicaId,sequence:1,appliedAt:1000,
      operation:before.pending[0].operation
    });
    const journal=firestoreJournalReader(firestore);
    const observationPort=firestoreCheckpointObservationPort(firestore);
    const recorded=await publishCheckpointObservation(
      repo,journal,observationPort,owner,()=>true
    );
    const reader=firestoreObservationReader(firestore);
    const first=await inspectObservationAudit(repo,journal,reader,owner,()=>true);
    expect(first).toMatchObject({
      status:'audit-only',compactionAuthorized:false,observationCount:1,
      matchingCurrentCount:1,historicalCount:0
    });
    expect((await getDoc(doc(firestore,'piante_users/alice/checkpoint_observations/'+before.replicaId)))
      .data()).toEqual(recorded.observation);
    const other='123e4567-e89b-42d3-a456-426614174000';
    const different=other===before.replicaId
      ?'123e4567-e89b-42d3-a456-426614174001':other;
    await observationPort.saveAndVerify({
      ...recorded.observation,replicaId:different,
      receiptCount:0,observedPrefixes:{},sha256:'b'.repeat(64)
    });
    const after=await inspectObservationAudit(repo,journal,reader,owner,()=>true);
    expect(after).toMatchObject({
      compactionAuthorized:false,observationCount:2,
      matchingCurrentCount:1,historicalCount:1
    });
    expect(await repo.read()).toEqual(before);
  });

  it('fails closed on a forged current hash or a document claiming missing operations',async()=>{
    const repo=makeRepo();
    await repo.commit({type:'plant.create',plant:{
      id:'avocado',commonName:'Avocado',origin:'seed',status:'active'
    }});
    const before=await repo.read(),firestore=db(owner);
    await firestoreJournalPort(firestore).appendOnce({
      protocol:1,ownerUid:owner,operationId:before.pending[0].operationId,
      replicaId:before.replicaId,sequence:1,appliedAt:1000,
      operation:before.pending[0].operation
    });
    const path='piante_users/alice/checkpoint_observations/'+before.replicaId;
    const baseline={protocol:1,status:'observation-only',compactionAuthorized:false,
      ownerUid:owner,replicaId:before.replicaId,receiptCount:1,
      observedPrefixes:{[before.replicaId]:1},sha256:'f'.repeat(64)};
    await setDoc(doc(firestore,path),baseline);
    const journal=firestoreJournalReader(firestore);
    const reader=firestoreObservationReader(firestore);
    await expect(inspectObservationAudit(repo,journal,reader,owner,()=>true))
      .rejects.toMatchObject({reason:'digest-disagreement'});
    await env.withSecurityRulesDisabled(async ctx=>{
      await updateDoc(doc(ctx.firestore(),path),{
        observedPrefixes:{[before.replicaId]:2},receiptCount:2
      });
    });
    await expect(inspectObservationAudit(repo,journal,reader,owner,()=>true))
      .rejects.toMatchObject({reason:'prefix-not-observed'});
    expect(await repo.read()).toEqual(before);
  });

  it('denies unauthenticated, foreign and revoked server observations',async()=>{
    const firestore=db(owner);
    const anonymous=firestoreObservationReader(db());
    const foreign=firestoreObservationReader(db('bob'));
    await assertFails(getDoc(doc(db(),'piante_users/alice/checkpoint_observations/nope')));
    await expect(anonymous.readAll(owner,200)).rejects.toThrow();
    await expect(foreign.readAll(owner,200)).rejects.toThrow();
    await env.withSecurityRulesDisabled(async ctx=>{
      await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
    });
    await expect(firestoreObservationReader(firestore).readAll(owner,200))
      .rejects.toThrow();
  });

  it('rejects truncated server scan without returning a false complete audit',async()=>{
    const firestore=db(owner),reader=firestoreObservationReader(firestore);
    await env.withSecurityRulesDisabled(async ctx=>{
      for(let i=0;i<3;i++){
        const replica='123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0');
        await setDoc(doc(ctx.firestore(),
          'piante_users/alice/checkpoint_observations/'+replica),{
          protocol:1,status:'observation-only',compactionAuthorized:false,
          ownerUid:owner,replicaId:replica,receiptCount:0,
          observedPrefixes:{},sha256:'a'.repeat(64)
        });
      }
    });
    await expect(reader.readAll(owner,2))
      .rejects.toMatchObject({reason:'limit-exceeded'});
    expect(await reader.readAll(owner,3)).toHaveLength(3);
  });
});
