import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));

test("il deploy web è limitato al site Firebase Hosting piantee", () => {
  const firebase = readJson("../firebase.json");
  const rc = readJson("../.firebaserc");
  assert.equal(rc.projects.default, "piante-a617e");
  assert.deepEqual(rc.targets["piante-a617e"].hosting.piantee, ["piantee"]);
  assert.equal(firebase.hosting.target, "piantee");
  assert.equal(firebase.hosting.site, undefined);
});

test("asset senza hash non restano obsoleti nella cache e i documenti interni non sono distribuiti", () => {
  const { hosting } = readJson("../firebase.json");
  const global = hosting.headers.find((entry) => entry.source === "**");
  const cache = global?.headers.find((entry) => entry.key.toLowerCase() === "cache-control");
  assert.match(cache?.value ?? "", /no-cache/);
  assert.match(cache?.value ?? "", /no-store/);
  assert.match(cache?.value ?? "", /must-revalidate/);
  for (const required of [
    "AGENTS.md", "docs/**", ".agents/**", ".github/**",
    "tests/**", "README.md", "firestore.rules", "gha-creds-*.json"
  ]) assert.ok(hosting.ignore.includes(required), "Ignore mancante: " + required);
});
