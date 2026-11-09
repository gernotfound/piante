import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ci = read("../.github/workflows/ci.yml");
const deploy = read("../.github/workflows/deploy-production.yml");
const firestore = read("../.github/workflows/deploy-firestore-rules.yml");
const dependabot = read("../.github/dependabot.yml");

test("CI: permessi minimi e gate obbligatorio aggregato", () => {
  assert.match(ci, /permissions:\s*\n\s+contents: read/);
  assert.match(ci, /name: Canonical Verification/);
  assert.match(ci, /needs: \[check, firestore-rules, codeql\]/);
  assert.match(ci, /name: Security \/ CodeQL/);
  assert.match(ci, /CODEQL_RESULT.*needs\.codeql\.result/);
  assert.match(ci, /CODEQL_RESULT.*!= "success"/);
});

test("Hosting segue Firestore Production, non una CI generica o una PR", () => {
  assert.match(deploy, /workflows: \[Piante Firestore Rules Production\]/);
  assert.match(deploy, /conclusion == 'success'/);
  assert.match(deploy, /workflow_run\.event == 'workflow_run'/);
  assert.match(deploy, /head_branch == 'main'/);
  assert.match(deploy, /head_repository\.full_name == github\.repository/);
  assert.match(deploy, /current_main.*EXPECTED_SHA/);
  assert.match(deploy, /--only hosting:piantee/);
  assert.doesNotMatch(deploy, /workflow_dispatch:/);
  assert.doesNotMatch(deploy, /scripts\/reconcile-firestore-rules\.mjs/);
  assert.doesNotMatch(deploy, /GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT/);
});

test("Firestore segue solo CI main e usa provider e account isolati", () => {
  assert.match(firestore, /name: Piante Firestore Rules Production/);
  assert.match(firestore, /workflows: \[Verifica codice\]/);
  assert.match(firestore, /CI_CONCLUSION/);
  assert.match(firestore, /CI_EVENT/);
  assert.match(firestore, /CI_BRANCH/);
  assert.match(firestore, /CI_REPO/);
  assert.match(firestore, /exit 1/);
  assert.doesNotMatch(firestore, /^    if:/m);
  assert.match(firestore, /current_main.*EXPECTED_SHA/);
  assert.match(firestore, /fetch-depth: 0/);
  assert.match(firestore, /GCP_FIRESTORE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(firestore, /workloadIdentityPools\/github-piante-firestore\/providers\/github-actions/);
  assert.match(firestore, /GCP_FIRESTORE_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(firestore, /token_format: access_token/);
  assert.match(firestore, /create_credentials_file: false/);
  assert.match(firestore, /scripts\/reconcile-firestore-rules\.mjs reconcile/);
  assert.match(firestore, /scripts\/reconcile-firestore-rules\.mjs verify/);
  assert.doesNotMatch(firestore, /--only hosting/);
  assert.doesNotMatch(firestore, /GCP_FIREBASE_DEPLOY_SERVICE_ACCOUNT/);
  assert.doesNotMatch(firestore, /workflow_dispatch:/);
});

test("Tutti i workflow usano action a SHA fisso e checkout senza credenziali", () => {
  for (const [name, yaml] of [["CI", ci], ["Hosting", deploy], ["Firestore", firestore]]) {
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
