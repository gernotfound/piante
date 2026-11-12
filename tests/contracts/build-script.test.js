import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("i controlli sintattici scoprono automaticamente i file futuri", () => {
  const pkg = JSON.parse(read("../../package.json"));
  assert.equal(pkg.scripts.check, "node scripts/check-syntax.mjs");
  const scanner = read("../../scripts/check-syntax.mjs");
  assert.match(scanner, /const directories = \["src", "scripts", "tests"\]/);
  assert.match(scanner, /readdirSync\(/);
  assert.match(scanner, /--check/);
  assert.match(scanner, /entry\.isDirectory\(\)/);
});

test("la CI compila i soli asset pubblici prima di completare i controlli", () => {
  const pkg = JSON.parse(read("../../package.json"));
  const ci = read("../../.github/workflows/ci.yml");
  assert.equal(pkg.scripts.build, "node scripts/build-site.mjs");
  assert.match(ci, /run: npm run build/);
  assert.match(ci, /name: Canonical Verification/);
});
