import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBASE_SITE_ORIGIN, resolveFirebaseWebConfig, validateFirebaseWebConfig
} from "../web/scripts/firebase-web-config.mjs";

const allowed={
  projectId:"pianta-db", authDomain:"pianta-db.firebaseapp.com",
  apiKey:"web-public-key", appId:"1:123:web:456"
};
test("solo progetto Piante e authDomain attendibili",()=>{
  assert.equal(validateFirebaseWebConfig(allowed).authDomain,"piante.web.app");
  assert.throws(()=>validateFirebaseWebConfig({...allowed,projectId:"logbook"}),/non corrisponde/);
  assert.throws(()=>validateFirebaseWebConfig({...allowed,authDomain:"evil.example"}),/inatteso/);
  assert.throws(()=>validateFirebaseWebConfig({...allowed,apiKey:""}),/API key/);
});
test("config esplicita valida senza fetch",async()=>{
  const result=await resolveFirebaseWebConfig({
    origin:"http://localhost:8080",configured:allowed,
    fetchConfig:()=>{throw Error("Must not fetch");}
  });
  assert.equal(result.projectId,"pianta-db");
});
test("config parziale non viene mescolata con discovery",async()=>{
  await assert.rejects(resolveFirebaseWebConfig({
    origin:FIREBASE_SITE_ORIGIN,
    configured:{...allowed,appId:""},
    fetchConfig:()=>{throw Error("Unexpected fetch");}
  }),/parziale/);
});
test("discovery non avviene su localhost o domini terzi",async()=>{
  for(const origin of ["http://localhost:8080","https://piante.attacker.com","https://pianta-db.web.app"]) {
    await assert.rejects(resolveFirebaseWebConfig({
      origin,configured:{...allowed,apiKey:"",appId:""},
      fetchConfig:()=>{throw Error("Unexpected request");}
    }),/anteprima/);
  }
});
test("Hosting JSON valido, senza segreti o fallback non consentiti",async()=>{
  const fetchConfig=async (url,opts)=>{
    assert.equal(url,"/__/firebase/init.json");
    assert.equal(opts.credentials,"same-origin");
    assert.equal(opts.redirect,"error");
    return {ok:true,headers:new Headers({"content-type":"application/json"}),json:async()=>allowed};
  };
  const cfg=await resolveFirebaseWebConfig({
    origin:FIREBASE_SITE_ORIGIN, configured:{...allowed,apiKey:"",appId:""},
    fetchConfig
  });
  assert.deepEqual(cfg,validateFirebaseWebConfig(allowed));
});
test("hosting HTML o progetto errato bloccano il client",async()=>{
  await assert.rejects(resolveFirebaseWebConfig({
    origin:FIREBASE_SITE_ORIGIN,configured:{...allowed,apiKey:"",appId:""},
    fetchConfig:async()=>({ok:true,headers:new Headers({"content-type":"text/html"})})
  }),/non espone/);
  await assert.rejects(resolveFirebaseWebConfig({
    origin:FIREBASE_SITE_ORIGIN,configured:{...allowed,apiKey:"",appId:""},
    fetchConfig:async()=>({ok:true,headers:new Headers({"content-type":"application/json"}),json:async()=>({...allowed,projectId:"logbook"})})
  }),/non corrisponde/);
});
