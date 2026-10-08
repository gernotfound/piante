import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env:RulesTestEnvironment;
const db=(uid?:string)=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const path=(uid:string,extra='')=>'piante_users/'+uid+(extra?'/'+extra:'');
beforeAll(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Emulator required; never run rules tests against live Firebase');
 env=await initializeTestEnvironment({projectId:'demo-piante-test',firestore:{
  host:'127.0.0.1',port:8177
 }});
});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const admin=context.firestore();
  await setDoc(doc(admin,'piante_access','alice'),{enabled:true});
  await setDoc(doc(admin,'piante_access','bob'),{enabled:false});
  await setDoc(doc(admin,path('alice')),{displayName:'Alice'});
  await setDoc(doc(admin,path('alice','plants/p1')),{commonName:'Avocado',price:10,notes:'private',latitude:40.7});
  await setDoc(doc(admin,path('bob','plants/b1')),{commonName:'Fico d India'});
 });
});
afterAll(async()=>{await env?.cleanup();});
describe('Piante private namespace security',()=>{
 it('denies every private read to anonymous users',async()=>{
  await assertFails(getDoc(doc(db(),path('alice','plants/p1'))));
  await assertFails(getDoc(doc(db(),path('alice'))));
 });
 it('allows only invited owner and protects confidential data from other users',async()=>{
  const mine=await assertSucceeds(getDoc(doc(db('alice'),path('alice','plants/p1'))));
  expect(mine.get('commonName')).toBe('Avocado');
  await assertFails(getDoc(doc(db('bob'),path('alice','plants/p1'))));
  await assertFails(getDoc(doc(db('alice'),path('bob','plants/b1'))));
  await assertFails(getDoc(doc(db('unknown'),path('alice','plants/p1'))));
 });
 it('does not permit self-provisioning invitations or changing other permissions',async()=>{
  await assertFails(setDoc(doc(db('unknown'),'piante_access/unknown'),{enabled:true}));
  await assertFails(updateDoc(doc(db('alice'),'piante_access/alice'),{enabled:false}));
  await assertFails(getDoc(doc(db('bob'),'piante_access/alice')));
  await assertSucceeds(getDoc(doc(db('alice'),'piante_access/alice')));
  await assertFails(getDocs(collection(db('alice'),'piante_access')));
 });
 it('blocks all M2 writes pending validated cloud sync and lifecycle architecture',async()=>{
  await assertFails(setDoc(doc(db('alice'),path('alice','plants/evil')),{secret:'data'}));
  await assertFails(updateDoc(doc(db('alice'),path('alice','plants/p1')),{commonName:'Edited'}));
  await assertFails(deleteDoc(doc(db('alice'),path('alice','plants/p1'))));
 });
 it('revocation makes access immediately unavailable',async()=>{
  await assertSucceeds(getDoc(doc(db('alice'),path('alice','plants/p1'))));
  await env.withSecurityRulesDisabled(async ctx=>{
   await updateDoc(doc(ctx.firestore(),'piante_access/alice'),{enabled:false});
  });
  await assertFails(getDoc(doc(db('alice'),path('alice','plants/p1'))));
 });
 it('does not expose legacy or public collections in the isolated test rules',async()=>{
  await assertFails(getDoc(doc(db('alice'),'users/alice/plants/p1')));
  await assertFails(getDoc(doc(db(),'piante_profiles/alice/plants/p1')));
 });
});
