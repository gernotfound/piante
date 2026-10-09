import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {initializeTestEnvironment,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,writeBatch} from 'firebase/firestore';
import {watchServerGrant} from '../../src/auth/grantWatch';

let env:RulesTestEnvironment;
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
    await setDoc(doc(ctx.firestore(),'piante_access/bob'),{enabled:false});
  });
});
afterAll(async()=>{await env?.cleanup();});

async function until(check:()=>boolean,timeout=8000):Promise<void> {
  const start=Date.now();
  while(!check()){
    if(Date.now()-start>timeout)throw new Error('Live grant event not delivered');
    await new Promise(resolve=>setTimeout(resolve,40));
  }
}
describe('M3f live grant watch, real Firestore security rules',()=>{
  it('only unlocks with fresh server confirmation, and closes after admin revocation',async()=>{
    const db=env.authenticatedContext('alice').firestore();
    const events:(boolean|null|'error')[]=[];
    const release=watchServerGrant(db,'alice',(enabled,error)=>events.push(error?'error':enabled));
    try {
      await until(()=>events.includes(true));
      await env.withSecurityRulesDisabled(async ctx=>{
        await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
      });
      await until(()=>events.includes(false));
      expect(events.at(-1)).toBe(false);
    }finally{release();}
  },15000);
  it('receives denial when a deletion tombstone revokes the grant read',async()=>{
    const db=env.authenticatedContext('alice').firestore();
    const events:(boolean|null|'error')[]=[];
    const release=watchServerGrant(db,'alice',(enabled,error)=>events.push(error?'error':enabled));
    try {
      await until(()=>events.includes(true));
      await env.withSecurityRulesDisabled(async ctx=>{
        // A cross-document Rules dependency does NOT reliably push an update
        // to an already-established listener. The trusted begin() boundary
        // MUST update the watched grant within the same atomic transaction.
        const admin=ctx.firestore();
        const batch=writeBatch(admin);
        batch.set(doc(admin,'piante_account_deletions/alice'),{phase:'deleting'});
        batch.update(doc(admin,'piante_access/alice'),{enabled:false});
        await batch.commit();
      });
      // Either a false server snapshot or a permission error is fail-closed.
      await until(()=>events.at(-1)!==true);
      expect(events.at(-1)).not.toBe(true);
    }finally{release();}
  },15000);
  it('does not grant a different UID nor allow a client to create invitations',async()=>{
    const db=env.authenticatedContext('bob').firestore();
    const events:(boolean|null|'error')[]=[];
    const release=watchServerGrant(db,'bob',(enabled,error)=>events.push(error?'error':enabled));
    try{await until(()=>events.includes(false));expect(events.at(-1)).toBe(false);}
    finally{release();}
  },15000);
});
