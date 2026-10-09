import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,deleteDoc,doc,getDoc,getDocs,setDoc,updateDoc,writeBatch} from 'firebase/firestore';

let env:RulesTestEnvironment;
const db=(uid?:string)=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const legacy=(uid:string,sub='')=>'users/'+uid+(sub?'/'+sub:'');
const newPlant=(id:string)=>({id,name:'Avocado',status:'active',createdAt:100});
const uuid='123e4567-e89b-42d3-a456-426614174000';
const row=(uid='alice')=>({
  protocol:1,ownerUid:uid,operationId:uuid+':1',replicaId:uuid,
  sequence:1,appliedAt:1000,
  operation:{type:'plant.create',plant:{id:'new_plant',commonName:'Avocado',origin:'seed',status:'active'}}
});

beforeAll(async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8178')
    throw Error('Compatibility tests require an isolated local Emulator on port 8178');
  env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{
    host:'127.0.0.1',port:8178
  }});
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const admin=context.firestore();
    await setDoc(doc(admin,legacy('alice')),{name:'Legacy owner'});
    await setDoc(doc(admin,legacy('bob')),{name:'Other legacy owner'});
    await setDoc(doc(admin,legacy('alice','plants/pl1')),newPlant('pl1'));
    await setDoc(doc(admin,'piante_access/alice'),{enabled:true});
    await setDoc(doc(admin,'piante_access/bob'),{enabled:false});
    await setDoc(doc(admin,'piante_users/alice'),{displayName:'Synthetic Piante'});
  });
});
afterAll(async()=>{await env?.cleanup();});

describe('M4a: unchanged legacy Pianta semantics under additive Piante rules (CRITICAL)',()=>{
  it('keeps legacy root owner read, update and delete permitted as in reported Rules',async()=>{
    const owner=db('alice');
    await assertSucceeds(getDoc(doc(owner,legacy('alice'))));
    await assertSucceeds(updateDoc(doc(owner,legacy('alice')),{name:'New legacy name'}));
    await assertSucceeds(deleteDoc(doc(owner,legacy('alice'))));
    await assertFails(getDoc(doc(db('bob'),legacy('alice'))));
    await assertFails(setDoc(doc(db('bob'),legacy('alice')),{name:'Intrusion'}));
    await assertFails(getDoc(doc(db(),legacy('alice'))));
  });
  it('preserves plant create required keys, matching ID and int createdAt',async()=>{
    const owner=db('alice');
    await assertSucceeds(setDoc(doc(owner,legacy('alice','plants/new')),newPlant('new')));
    await assertFails(setDoc(doc(owner,legacy('alice','plants/wrong')),newPlant('another')));
    await assertFails(setDoc(doc(owner,legacy('alice','plants/invalid')),{
      id:'invalid',name:'Bad',status:'active',createdAt:'not an integer'
    }));
    await assertFails(setDoc(doc(owner,legacy('alice','plants/missing')),{name:'Bad'}));
    await assertFails(setDoc(doc(db('bob'),legacy('alice','plants/other')),newPlant('other')));
    await assertFails(setDoc(doc(db(),legacy('alice','plants/guest')),newPlant('guest')));
  });
  it('preserves legacy plant logs validation, rejects extra fields and out-of-range pH',async()=>{
    const owner=db('alice'),path=legacy('alice','plants/pl1/logs');
    const valid={id:'log1',date:'2026-10-09',type:'observation',createdAt:123,
      note:'private',photo:null,height:24,ph:7.2,harvest:'none'};
    await assertSucceeds(setDoc(doc(owner,path+'/log1'),valid));
    await assertFails(setDoc(doc(owner,path+'/log2'),{...valid,id:'log2',ph:15}));
    await assertFails(setDoc(doc(owner,path+'/log3'),{...valid,id:'log3',secret:'extra'}));
    await assertFails(setDoc(doc(owner,path+'/log4'),{...valid,id:'log4',date:'09/10/2026'}));
    await assertFails(setDoc(doc(db('bob'),path+'/hack'),{...valid,id:'hack'}));
    await assertSucceeds(deleteDoc(doc(owner,path+'/log1')));
  });
  it('preserves legacy expenses validation, ownership, and deletions',async()=>{
    const path=legacy('alice','expenses/x1');
    const good={id:'x1',date:'2026-10-09',category:'soil',desc:'substrate',cost:19.8};
    await assertSucceeds(setDoc(doc(db('alice'),path),good));
    await assertFails(setDoc(doc(db('alice'),legacy('alice','expenses/x2')),{...good,id:'x2',cost:-3}));
    await assertFails(setDoc(doc(db('bob'),legacy('alice','expenses/x3')),{...good,id:'x3'}));
    await assertSucceeds(deleteDoc(doc(db('alice'),path)));
  });
  it('preserves legacy wishlist optional types and owner access',async()=>{
    const path=legacy('alice','wishlist/w1');
    await assertSucceeds(setDoc(doc(db('alice'),path),{id:'w1',name:'Papaya',price:12,notes:'personal'}));
    await assertFails(setDoc(doc(db('alice'),legacy('alice','wishlist/w2')),{id:'w2',name:'Papaya',price:'bad'}));
    await assertFails(getDoc(doc(db('bob'),path)));
  });
  it('preserves legacy inline images size limit, MIME prefix and schema',async()=>{
    const path=legacy('alice','images/img');
    await assertSucceeds(setDoc(doc(db('alice'),path),{data:'data:image/png;base64,AA==',updatedAt:123}));
    await assertFails(setDoc(doc(db('alice'),legacy('alice','images/bad')),{data:'https://example.invalid/pic'}));
    await assertFails(setDoc(doc(db('alice'),legacy('alice','images/extra')),{data:'data:image/png;base64,AA==',secret:true}));
    await assertFails(setDoc(doc(db('alice'),legacy('alice','images/large')),{data:'data:image/png;base64,'+'A'.repeat(980000)}));
    await assertFails(getDoc(doc(db('bob'),path)));
  });
});

describe('M4a: isolated Piante permissions without legacy namespace expansion',()=>{
  it('only the invited UID can read their private operations and grant',async()=>{
    const owner=db('alice');
    await assertSucceeds(getDoc(doc(owner,'piante_users/alice')));
    await assertSucceeds(getDoc(doc(owner,'piante_access/alice')));
    await assertFails(getDoc(doc(db('bob'),'piante_users/alice')));
    await assertFails(getDoc(doc(db(),'piante_users/alice')));
    await assertFails(getDoc(doc(db('alice'),'piante_access/bob')));
    await assertFails(getDocs(collection(owner,'piante_access')));
  });
  it('permits only validated append-only receipts, not updates, deletes or owner impersonation',async()=>{
    const owner=db('alice'),id=uuid+':1',path='piante_users/alice/operations/'+id;
    await assertSucceeds(setDoc(doc(owner,path),row()));
    await assertFails(updateDoc(doc(owner,path),{appliedAt:2000}));
    await assertFails(deleteDoc(doc(owner,path)));
    await assertFails(setDoc(doc(db('bob'),'piante_users/alice/operations/forged'),{
      ...row(),operationId:'forged'
    }));
    await assertFails(setDoc(doc(owner,'piante_users/alice/operations/mismatch'),row()));
    await assertFails(setDoc(doc(owner,'piante_users/alice/operations/'+uuid+':2'),{
      ...row(),operationId:uuid+':2',ownerUid:'bob'
    }));
  });
  it('rejects self-provisioning grants and deletion tombstones',async()=>{
    await assertFails(setDoc(doc(db('alice'),'piante_access/alice'),{enabled:true}));
    await assertFails(updateDoc(doc(db('alice'),'piante_access/alice'),{enabled:false}));
    await assertFails(setDoc(doc(db('alice'),'piante_account_deletions/alice'),{phase:'complete'}));
    await assertFails(getDoc(doc(db(),'piante_account_deletions/alice')));
    await assertFails(getDoc(doc(db('alice'),'piante_account_deletions/alice')));
  });
  it('a tombstone closes new Piante paths without disabling Pianta legacy permissions',async()=>{
    const owner=db('alice');
    await env.withSecurityRulesDisabled(async ctx=>{
      const admin=ctx.firestore(),batch=writeBatch(admin);
      batch.set(doc(admin,'piante_account_deletions/alice'),{phase:'deleting'});
      batch.update(doc(admin,'piante_access/alice'),{enabled:false});
      await batch.commit();
    });
    await assertFails(getDoc(doc(owner,'piante_users/alice')));
    await assertFails(getDoc(doc(owner,'piante_access/alice')));
    await assertFails(setDoc(doc(owner,'piante_users/alice/operations/'+uuid+':1'),row()));
    await assertSucceeds(getDoc(doc(owner,legacy('alice','plants/pl1'))));
    await assertSucceeds(setDoc(doc(owner,legacy('alice','plants/pl2')),newPlant('pl2')));
  });
  it('unknown global paths remain denied to all clients',async()=>{
    const paths=['piante_profiles/alice','piante_public/alice','private_keys/any',
      'other/anything','account_deletions/alice'];
    for(const path of paths){
      await assertFails(getDoc(doc(db('alice'),path)));
      await assertFails(getDoc(doc(db(),path)));
      await assertFails(setDoc(doc(db('alice'),path),{x:true}));
    }
  });
});
