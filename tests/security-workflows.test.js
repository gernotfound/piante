import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ci = read("../.github/workflows/ci.yml");
const deploy = read("../.github/workflows/deploy-production.yml");
const dependabot = read("../.github/dependabot.yml");

test("CI: permessi minimi e gate obbligatorio aggregato", () => {
  assert.match(ci, /permissions:\s*\n\s+contents: read/);
  assert.match(ci, /name: Canonical Verification/);
  assert.match(ci, /needs: \[check, firestore-rules, codeql\]/);
  assert.match(ci, /name: Security \/ CodeQL/);
  assert.match(ci, /CODEQL_RESULT.*needs\.codeql\.result/);
  assert.match(ci, /CODEQL_RESULT.*!= "success"/);
});

test("Deploy: vietata pubblicazione da PR, manual dispatch o branch non main", () => {
  assert.match(deploy, /workflow_run:/);
  assert.match(deploy, /conclusion == 'success'/);
  assert.match(deploy, /workflow_run\.event == 'push'/);
  assert.match(deploy, /head_branch == 'main'/);
  assert.match(deploy, /head_repository\.full_name == github\.repository/);
  assert.match(deploy, /current_main.*EXPECTED_SHA/);
  assert.match(deploy, /--only hosting:piantee/);
  assert.doesNotMatch(deploy, /workflow_dispatch:/);
  assert.doesNotMatch(deploy, /--only\s+firestore/);
});

test("Deploy: Firestore precede Hosting con WIF separata e sola Rules API", () => {
  assert.match(deploy, /firestore-rules:\s*\n/);
  assert.match(deploy, /needs: \[firestore-rules\]/);
  assert.match(deploy, /GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(deploy, /GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(deploy, /token_format: access_token/);
  assert.match(deploy, /create_credentials_file: false/);
  assert.match(deploy, /scripts\/reconcile-firestore-rules\.mjs reconcile/);
  assert.match(deploy, /scripts\/reconcile-firestore-rules\.mjs verify/);
  assert.match(deploy, /steps\.reconcile\.outputs\.changed == 'true'/);
  assert.match(deploy, /sleep 600/);
  assert.match(deploy, /fetch-depth: 2/);
});

test("Actions di terze parti fissate a commit SHA, senza persist-credentials", () => {
  for (const [name, yaml] of [["CI", ci], ["deploy", deploy]]) {
    const uses = [...yaml.matchAll(/\buses:\s*([^\s#]+)/g)].map((match) => match[1]);
    assert.ok(uses.length > 0, name);
    for (const action of uses) {
      assert.match(action, /@[0-9a-f]{40}$/, name + ": action senza SHA fisso " + action);
    }
    assert.match(yaml, /persist-credentials: false/);
  }
});

test("Dependabot: npm e GitHub Actions ricevono revisioni settimanali", () => {
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.equal((dependabot.match(/interval: weekly/g) || []).length, 2);
});
