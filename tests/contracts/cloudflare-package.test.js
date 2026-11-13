import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const cf = read("../../cloudflare.config.ts");
const vite = read("../../vite.config.mjs");
const prep = read("../../scripts/prepare-cloudflare-cf.mjs");
const html = read("../../cloudflare/site/index.html");

test("cf: worker Piantee, D1 separato e API sempre worker-first", () => {
  assert.match(cf, /name: "piantee"/);
  assert.match(cf, /runWorkerFirst: \["\/api", "\/api\/\*"\]/);
  assert.match(cf, /notFoundHandling: "none"/);
  assert.match(cf, /DB: bindings\.d1\(\{ name: "piantee-db" \}\)/);
  assert.doesNotMatch(cf, /firebase|thelogbook|service[_-]?account|secret/i);
});

test("Vite usa solo la build pubblica e l'icona originali", () => {
  assert.match(vite, /\.\/cloudflare\/dist\//);
  assert.match(vite, /\.\/cloudflare\/public\//);
  assert.match(prep, /buildCloudflareSite\(\)/);
  assert.match(prep, /copyFileSync\(join\(generated, "favicon\.svg"\)/);
  assert.match(html, /src="\/app\.js" type="module"/);
  assert.doesNotMatch(vite, /src\/|root:\s*process\.cwd\(\)/);
});
