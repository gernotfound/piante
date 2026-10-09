import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertStaticReleaseBoundary,ReleaseBoundaryError} from './release-boundary.mjs';
const firebase=JSON.parse(readFileSync('firebase.json','utf8'));
const project=JSON.parse(readFileSync('.firebaserc','utf8'));
const config=()=>({firebaseConfig:structuredClone(firebase),projectConfig:structuredClone(project),
  environmentFiles:[],environment:{}});
function denied(modify,code) {
 const item=config();
 modify(item);
 assert.throws(()=>assertStaticReleaseBoundary(item),
   e=>e instanceof ReleaseBoundaryError && e.code===code);
}
describe('M3e static release boundary (CRITICAL shared Firebase)',()=>{
 it('accepts only the existing static Piante hosting-only shell, not a Firebase provider proof',()=>{
   assert.deepEqual(assertStaticReleaseBoundary(config()),{
     status:'static-release-boundary-ok',site:'piante',project:'pianta-db',authentication:'disabled'
   });
 });
 it('blocks adding production Firestore Rules or Storage even alongside valid Hosting',()=>{
   for(const key of ['firestore','storage','functions','database','extensions','emulators']){
     denied(x=>{x.firebaseConfig[key]={rules:'firestore.m2-test.rules'};},
       'forbidden-firebase-resource:'+key);
   }
 });
 it('rejects wrong firebase project, extra aliases and wrong hosting target',()=>{
   denied(x=>{x.projectConfig.projects.default='other-project';},'wrong-firebase-project');
   denied(x=>{x.projectConfig.projects.other='pianta-db';},'wrong-firebase-project');
   denied(x=>{x.firebaseConfig.hosting.site='pianta-db';},'wrong-hosting-site');
   denied(x=>{x.firebaseConfig.hosting.target='piante';},'hosting-hooks-or-target-not-allowed');
   denied(x=>{x.firebaseConfig.hosting.predeploy=['firebase deploy'];},
     'hosting-hooks-or-target-not-allowed');
   denied(x=>{x.firebaseConfig.hosting.source='.';},'unsupported-hosting-directive');
   denied(x=>{x.firebaseConfig.hosting.frameworksBackend={region:'europe-west1'};},
     'unsupported-hosting-directive');
 });
 it('blocks unreviewed deployment routing, path changes and dropped headers',()=>{
   denied(x=>{x.firebaseConfig.hosting.public='public';},'wrong-hosting-directory');
   denied(x=>{x.firebaseConfig.hosting.rewrites=[{source:'**',destination:'/admin'}];},
     'hosting-rewrites-changed');
   denied(x=>{x.firebaseConfig.hosting.redirects=[{source:'**',destination:'https://elsewhere'}];},
     'hosting-redirects-not-reviewed');
   denied(x=>{x.firebaseConfig.hosting.headers=[];},'hosting-security-headers-missing');
   denied(x=>{const item=x.firebaseConfig.hosting.headers.find(row=>row.source==='/**');
     item.headers.find(h=>h.key==='X-Frame-Options').value='SAMEORIGIN';
   },'hosting-security-header-weakened:x-frame-options');
   denied(x=>{const item=x.firebaseConfig.hosting.headers.find(row=>row.source==='/**');
     item.headers.find(h=>h.key==='Content-Security-Policy').value="default-src *";
   },'hosting-content-security-policy-weakened');
   denied(x=>{x.firebaseConfig.hosting.headers.push({source:'/app',headers:[{
     key:'Content-Security-Policy',value:'default-src *'
   }]});},'overlapping-hosting-security-header');
 });
 it('rejects enabled or indeterminate Auth test builds regardless of env file precedence',()=>{
   for(const raw of ['true','TRUE','1','', '"true"',"'true'"]){
     denied(x=>{x.environmentFiles=[{name:'.env',content:'VITE_AUTH_TEST_MODE='+raw}];},
       'test-login-must-be-disabled [.env]');
   }
   denied(x=>{x.environmentFiles=[{name:'.env.production.local',
     content:'export VITE_AUTH_TEST_MODE="true" # comment'}];},
     'test-login-must-be-disabled [.env.production.local]');
   denied(x=>{x.environment={VITE_AUTH_TEST_MODE:'true'};},
     'test-login-must-be-disabled [process-env]');
 });
 it('accepts explicit false, benign comments and absent flag',()=>{
   const x=config();
   x.environmentFiles=[
     {name:'.env',content:'# VITE_AUTH_TEST_MODE=true\nVITE_AUTH_TEST_MODE=false\n'},
     {name:'.env.production',content:"export VITE_AUTH_TEST_MODE='false'\n"}
   ];
   x.environment={VITE_AUTH_TEST_MODE:'false'};
   assert.equal(assertStaticReleaseBoundary(x).authentication,'disabled');
 });
});
