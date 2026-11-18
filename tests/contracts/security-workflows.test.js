import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const ci = read("../../.github/workflows/ci.yml");
const pkg = JSON.parse(read("../../package.json"));
const depends = read("../../.github/dependabot.yml");
test("Solo runtime Cloudflare e nessun workflow o dipendenza Firebase", () => {
  assert.equal(Object.keys(pkg.devDependencies).some(name => name.includes("firebase")), false);
  assert.ok(!existsSync(new URL("../../firebase.json", import.meta.url)));
  assert.ok(!existsSync(new URL("../../firestore.rules", import.meta.url)));
  assert.ok(!existsSync(new URL("../../.github/workflows/deploy-production.yml", import.meta.url)));
  assert.ok(!existsSync(new URL("../../.github/workflows/deploy-firestore-rules.yml", import.meta.url)));
  assert.doesNotMatch(ci, /firebase|firestore-rules|service.account|piantee\.web\.app/i);
});
test("CI Cloudflare richiede unit, browser, D1, packaging e CodeQL", () => {
  assert.match(ci, /name: Canonical Verification/);
  assert.match(ci, /needs: \[check, browser-e2e, cloudflare-native, cloudflare-package, codeql\]/);
  for(const key of ["CHECK_RESULT","BROWSER_RESULT","NATIVE_RESULT","PACKAGE_RESULT","CODEQL_RESULT"]) {
    assert.match(ci, new RegExp(key + ":"));
    assert.match(ci, new RegExp('\\$' + key.replace(/./g, x=>x) + '"'));
  }
  assert.match(ci, /name: Security \/ CodeQL/);
  assert.match(ci, /queries: security-extended/);
  assert.match(ci, /permissions:\s*\n\s+contents: read/);
  for(const action of [...ci.matchAll(/uses:\s*([^\s#]+)/g)].map(x=>x[1])) {
    assert.match(action, /@[0-9a-f]{40}$/, "Azione non fissata a SHA: " + action);
  }
  assert.match(ci, /persist-credentials: false/);
});
test("Dipendenze aggiornate settimanalmente", () => {
  assert.match(depends, /package-ecosystem: npm/);
  assert.match(depends, /package-ecosystem: github-actions/);
  assert.equal((depends.match(/interval: weekly/g) || []).length, 2);
});
