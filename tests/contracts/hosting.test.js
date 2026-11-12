import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));

test("il deploy web è limitato al site Firebase Hosting piantee", () => {
  const firebase = readJson("../../firebase.json");
  const rc = readJson("../../.firebaserc");
  assert.equal(rc.projects.default, "piante-a617e");
  assert.deepEqual(rc.targets["piante-a617e"].hosting.piantee, ["piantee"]);
  assert.equal(firebase.hosting.target, "piantee");
  assert.equal(firebase.hosting.site, undefined);
});

test("asset senza hash non restano obsoleti nella cache e i documenti interni non sono distribuiti", () => {
  const { hosting } = readJson("../../firebase.json");
  const global = hosting.headers.find((entry) => entry.source === "**");
  const cache = global?.headers.find((entry) => entry.key.toLowerCase() === "cache-control");
  assert.match(cache?.value ?? "", /no-cache/);
  assert.match(cache?.value ?? "", /no-store/);
  assert.match(cache?.value ?? "", /must-revalidate/);
  for (const required of [
    "AGENTS.md", "docs/**", ".agents/**", ".github/**",
    "tests/**", "scripts/**", "README.md", "firestore.rules", "gha-creds-*.json"
  ]) assert.ok(hosting.ignore.includes(required), "Ignore mancante: " + required);
});

test("i moduli e i CSS pubblicati sono verificati nello smoke test di produzione", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
  const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="(\/styles\/[^"]+\.css)"/g)].map((match) => match[1]);
  assert.deepEqual(stylesheets, [
    "/styles/base.css", "/styles/public.css", "/styles/admin.css", "/styles/responsive.css"
  ]);
  for (const path of [...stylesheets, "/src/main.js", "/src/ui/public.js", "/src/ui/admin.js", "/src/ui/artwork.js"]) {
    assert.ok(readFileSync(new URL("../.." + path, import.meta.url)).length > 0, "Asset inesistente: " + path);
    assert.ok(workflow.includes(path.slice(1)), "Asset non coperto dallo smoke test: " + path);
  }
  assert.match(workflow, /content_type=.*--write-out/);
  assert.match(workflow, /text\/css/);
  assert.match(workflow, /javascript/);
  assert.doesNotMatch(workflow, /piantee\.web\.app\/styles\.css/);
});
