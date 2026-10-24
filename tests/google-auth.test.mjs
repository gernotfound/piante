import test from "node:test";
import assert from "node:assert/strict";
import { classifyGooglePopupFailure, signInGoogle } from "../web/scripts/google-auth.mjs";
const error = code => Object.assign(new Error(code),{code});
function fakeApi(behavior) {
  const calls=[];
  class GoogleAuthProvider {
    setCustomParameters(parameters){calls.push(["options",parameters]);}
  }
  return {calls,
    GoogleAuthProvider,
    signInWithPopup:async()=>{calls.push(["popup"]); if(behavior)throw error(behavior);},
    signInWithRedirect:async()=>{calls.push(["redirect"]);}};
}
test("LogBook classification portata senza Guest/PWA",()=>{
  assert.equal(classifyGooglePopupFailure(error("auth/popup-blocked")),"redirect");
  assert.equal(classifyGooglePopupFailure(error("auth/operation-not-supported-in-this-environment")),"redirect");
  assert.equal(classifyGooglePopupFailure(error("auth/popup-closed-by-user")),"cancelled");
  assert.equal(classifyGooglePopupFailure(error("auth/network-request-failed")),"network");
  assert.equal(classifyGooglePopupFailure(null),"error");
});
test("popup riuscito sceglie account",async()=>{
  const api=fakeApi();
  assert.equal(await signInGoogle({},api),"signed_in");
  assert.deepEqual(api.calls,[["options",{prompt:"select_account"}],["popup"]]);
});
test("popup bloccato: redirect avviato, senza falso successo",async()=>{
  const api=fakeApi("auth/popup-blocked");
  assert.equal(await signInGoogle({},api),"redirect_started");
  assert.equal(api.calls.some(x=>x[0]==="redirect"),true);
});
test("cancellazione silenziosa; network dà messaggio dedicato",async()=>{
  assert.equal(await signInGoogle({},fakeApi("auth/popup-closed-by-user")),"cancelled");
  await assert.rejects(signInGoogle({},fakeApi("auth/network-request-failed"))),/Connessione/);
});
test("errore generico non espone dettagli sensibili",async()=>{
  await assert.rejects(signInGoogle({},fakeApi("auth/invalid-api-key"))),/Accesso Google non riuscito/);
});
