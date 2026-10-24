import test from "node:test";
import assert from "node:assert/strict";
import { inspectHostingSite, describeNetworkFailure } from "../scripts/hosting-readiness.mjs";
import { FIREBASE_SITE_ORIGIN } from "../web/scripts/firebase-web-config.mjs";
const publicConfig={projectId:"pianta-db",authDomain:"pianta-db.firebaseapp.com",apiKey:"web-public-not-secret",appId:"1:123:web:456"};
function fixture({project="pianta-db",oldPage=false,missingHeader=false,badJson=false}={}){
  const requests=[];
  const fetcher=async (url,opts)=>{
    requests.push({url:String(url),opts});
    const path=new URL(url).pathname;
    if(path==="/")return new Response(oldPage?"Firebase Welcome":'<div id="app"></div><script src="/scripts/app.mjs"></script>',{
      headers:{"content-type":"text/html","x-content-type-options":"nosniff",
        ...(missingHeader?{}:{"content-security-policy":"default-src 'self'"})}
    });
    if(path==="/__/firebase/init.json")return new Response(badJson?"<html/>":JSON.stringify({...publicConfig,projectId:project}),{
      headers:{"content-type":badJson?"text/html":"application/json"}
    });
    if(path==="/scripts/app.mjs")return new Response("import { loadFirebase } from './firebase.mjs'; const makeDataClient=1;",{
      headers:{"content-type":"text/javascript"}
    });
    return new Response("Not found",{status:404});
  };
  return {fetcher,requests};
}
test("sito Hosting corretto e config Web pubblica",async()=>{
  const {fetcher,requests}=fixture();
  const report=await inspectHostingSite(fetcher);
  assert.equal(report.ready,true);
  assert.equal(report.checks.length,4);
  for(const request of requests){
    assert.equal(new URL(request.url).origin,FIREBASE_SITE_ORIGIN);
    assert.equal(request.opts.redirect,"error");
    assert.equal(request.opts.credentials,"omit");
  }
});
test("rifiuta progetto diverso senza stampare API key",async()=>{
  const report=await inspectHostingSite(fixture({project:"logbook"}).fetcher);
  assert.equal(report.ready,false);
  assert.equal(report.checks.find(c=>c.name==="firebase_config").ok,false);
  assert.doesNotMatch(JSON.stringify(report),/web-public-not-secret/);
});
test("rileva welcome page, CSP mancante e HTML su endpoint JSON",async()=>{
  const report=await inspectHostingSite(fixture({oldPage:true,missingHeader:true,badJson:true}).fetcher);
  assert.equal(report.ready,false);
  assert.equal(report.checks.filter(c=>!c.ok).length,3);
});
test("errore di rete non rivela dettagli né dichiara readiness",async()=>{
  const report=await inspectHostingSite(async()=>{throw Error("secret-id");});
  assert.equal(report.ready,false);
  assert.ok(report.checks.every(c=>!c.ok));
  assert.doesNotMatch(JSON.stringify(report),/secret-id/);
});

test("diagnostica di rete distinguibile senza stampare dettagli privati",()=>{
  assert.equal(describeNetworkFailure({message:"HTTP 404"}),"HTTP 404");
  assert.equal(describeNetworkFailure({name:"TimeoutError"}),"Timeout di rete");
  assert.equal(describeNetworkFailure({cause:{code:"ENOTFOUND"}}),"DNS non risolto");
  assert.equal(describeNetworkFailure({message:"apiKey=SECRET, fetch failed"}),"Connessione HTTP non disponibile");
});
