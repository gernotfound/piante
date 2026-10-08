import { describe, expect, it } from 'vitest';
import { parseFirebaseWebConfig,authTestModeEnabled } from './firebaseConfig';
const valid={apiKey:'example-public-key',authDomain:'piante.web.app',projectId:'pianta-db',appId:'1:123:web:abc'};
describe('OAuth domain and test mode',()=>{
 it('points only at Piante Hosting rather than the legacy auth domain',()=>{
  expect(parseFirebaseWebConfig(valid)).toEqual(valid);
  expect(()=>parseFirebaseWebConfig({...valid,authDomain:'pianta-db.firebaseapp.com'})).toThrow('authDomain');
 });
 it('fails closed on missing or mismatched config',()=>{
  for(const override of [{apiKey:''},{appId:''},{projectId:'other'},{authDomain:'https://piante.web.app'}]){
   expect(()=>parseFirebaseWebConfig({...valid,...override})).toThrow();
  }
 });
 it('requires explicit enablement',()=>{
  expect(authTestModeEnabled(undefined)).toBe(false);
  expect(authTestModeEnabled('TRUE')).toBe(false);
  expect(authTestModeEnabled('true')).toBe(true);
 });
});
