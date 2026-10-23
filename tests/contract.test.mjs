import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rules=await readFile(new URL("../firestore.rules",import.meta.url),"utf8");
const hosting=JSON.parse(await readFile(new URL("../firebase.json",import.meta.url),"utf8"));
test("nessun deploy automatico di Firestore, Functions o Storage",()=>{
  assert.equal(hosting.hosting.site,"piante");
  assert.equal(hosting.hosting.public,"web");
  assert.equal(hosting.firestore,undefined);
  assert.equal(hosting.storage,undefined);
  assert.equal(hosting.functions,undefined);
});
test("Rules separano profili privati da proiezioni pubbliche",()=>{
  for (const marker of [
    "match /profiles/{uid}","match /handles/{username}",
    "match /public_gardens/{username}",
    "validPublicPlant","gardenIsVisible","match /{document=**}"
  ]) assert.ok(rules.includes(marker),marker);
  assert.match(rules,/allow read, write: if false;/);
});
test("nessuna persistenza PWA di tipo Service Worker",async()=>{
  const index=await readFile(new URL("../web/index.html",import.meta.url),"utf8");
  assert.ok(!index.includes('rel="manifest"'));
  assert.match(index,/name="viewport"/);
});
