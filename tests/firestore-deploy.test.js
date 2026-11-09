import test from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeRules, rulesEquivalent, decideReconciliation, extractRulesSource, reconcileRules
} from "../scripts/reconcile-firestore-rules.mjs";

const RELEASE = "projects/piante-a617e/releases/cloud.firestore";
const OLD = "projects/piante-a617e/rulesets/old123";
const NEW = "projects/piante-a617e/rulesets/new123";
const baseline = "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { allow read: if false; } }";
const formatted = `// Commento visibile nella console
rules_version = '2';
service cloud.firestore { /* commento */
  match /databases/{database}/documents {
    allow read: if false; // non permettere accessi
  }
}`;
const candidate = baseline.replace("false", "true");

function mockRulesApi({ source = formatted, concurrentChange = false, invalidStructure = false } = {}) {
  let rulesetName = OLD;
  let releaseGets = 0;
  const actions = [];
  const request = async (method, resource, body) => {
    actions.push({ method, resource, body });
    if (method === "GET" && resource === RELEASE) {
      releaseGets++;
      if (concurrentChange && releaseGets > 1) rulesetName = "projects/piante-a617e/rulesets/concurrent";
      return { name: RELEASE, rulesetName };
    }
    if (method === "GET" && resource === OLD) {
      return { source: { files: invalidStructure ? [] : [{ name: "firestore.rules", content: source }] } };
    }
    if (method === "POST" && resource === "projects/piante-a617e/rulesets") {
      assert.deepEqual(body.source.files.map((f) => f.name), ["firestore.rules"]);
      assert.equal(body.source.files[0].content, candidate);
      return { name: NEW };
    }
    if (method === "PATCH" && resource === RELEASE) {
      assert.equal(body.updateMask, "rulesetName");
      assert.equal(body.release.rulesetName, NEW);
      rulesetName = NEW;
      return { name: RELEASE, rulesetName };
    }
    if (method === "GET" && resource === NEW) {
      return { source: { files: [{ name: "firestore.rules", content: candidate }] } };
    }
    throw new Error(`Unexpected API request ${method} ${resource}`);
  };
  return { request, actions };
}

test("Il confronto ignora soltanto commenti e spazi, conservando le stringhe", () => {
  assert.equal(rulesEquivalent(formatted, baseline), true);
  assert.equal(rulesEquivalent(formatted, candidate), false);
  assert.equal(rulesEquivalent("x = 'https://a//b';", "x = 'https://a//b';"), true);
  assert.equal(rulesEquivalent("x = 'https://a//b';", "x = 'https://a';"), false);
  assert.deepEqual(tokenizeRules("foo bar"), ["foo", "bar"]);
  assert.deepEqual(tokenizeRules("foobar"), ["foobar"]);
  assert.throws(() => tokenizeRules("/* unfinished"), /Unterminated/);
  assert.throws(() => tokenizeRules("'unfinished"), /Unterminated/);
});

test("Il confronto impedisce drift non autorizzato", () => {
  assert.equal(decideReconciliation(formatted, [baseline], baseline), "unchanged");
  assert.equal(decideReconciliation(formatted, [baseline], candidate), "deploy");
  assert.throws(() => decideReconciliation("allow read: if true;", [baseline], "allow write: if false;"), /differ/);
});

test("Una release approvata ma saltata in un precedente deploy è recuperabile", () => {
  assert.equal(decideReconciliation(formatted, [candidate, baseline], candidate), "deploy");
  assert.throws(() => decideReconciliation(formatted, [], candidate), /Missing approved/);
  assert.throws(() => decideReconciliation("allow write: if true;", [baseline, candidate], candidate), /differ/);
});

test("Ruleset non valido viene rifiutato", () => {
  assert.throws(() => extractRulesSource({ source: { files: [] } }), /Unexpected/);
  assert.throws(() => extractRulesSource({ source: { files: [{ content: "x" }, { content: "y" }] } }), /Unexpected/);
  assert.throws(() => extractRulesSource({ source: { files: [{ content: "" }] } }), /Unexpected/);
});

test("Policy semanticamente identica: nessun rilascio o scrittura", async () => {
  const api = mockRulesApi();
  const result = await reconcileRules({ desired: baseline, approvedHistory: [baseline], request: api.request });
  assert.equal(result.changed, false);
  assert.equal(api.actions.length, 2);
  assert.deepEqual(api.actions.map((a) => a.method), ["GET", "GET"]);
});

test("Cambio autorizzato: crea ruleset, aggiorna release e rilegge sorgente", async () => {
  const api = mockRulesApi();
  const result = await reconcileRules({ desired: candidate, approvedHistory: [baseline], request: api.request });
  assert.equal(result.changed, true);
  assert.equal(result.rulesetName, NEW);
  assert.deepEqual(api.actions.map((a) => a.method), ["GET", "GET", "POST", "GET", "PATCH", "GET", "GET"]);
  const verify = await reconcileRules({ desired: candidate, approvedHistory: [baseline], request: api.request, mode: "verify" });
  assert.equal(verify.changed, false);
});

test("Policy estranea e aggiornamento concorrente bloccano la pubblicazione", async () => {
  const drift = mockRulesApi({ source: "allow write: if true;" });
  await assert.rejects(reconcileRules({
    desired: candidate, approvedHistory: [baseline], request: drift.request
  }), /differ/);
  assert.equal(drift.actions.some((a) => a.method === "PATCH"), false);

  const concurrent = mockRulesApi({ concurrentChange: true });
  await assert.rejects(reconcileRules({
    desired: candidate, approvedHistory: [baseline], request: concurrent.request
  }), /concurrently/);
  assert.equal(concurrent.actions.some((a) => a.method === "PATCH"), false);
});

test("Una risposta Ruleset o release inattesa blocca la scrittura", async () => {
  const wrong = mockRulesApi({ invalidStructure: true });
  await assert.rejects(reconcileRules({ desired: candidate, approvedHistory: [baseline], request: wrong.request }), /Unexpected/);
  assert.equal(wrong.actions.length, 2);
  await assert.rejects(reconcileRules({
    desired: candidate, approvedHistory: [baseline],
    request: async () => ({ name: "projects/other/releases/cloud.firestore", rulesetName: OLD })
  }), /Unexpected Firestore release/);
});
