import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
  for (const name of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ACCESS_OWNER_SUB"]) {
    assert.match(cf, new RegExp(name + ": bindings\\.secret\\(\\)"));
  }
  assert.doesNotMatch(cf, /firebase|thelogbook|service[_-]?account/i);
});

test("Vite usa solo la build pubblica e l'icona originali", () => {
  assert.match(vite, /\.\/cloudflare\/dist\//);
  assert.match(vite, /\.\/cloudflare\/public\//);
  assert.match(prep, /buildCloudflareSite\(\)/);
  assert.match(prep, /copyFileSync\(join\(generated, "favicon\.svg"\)/);
  assert.match(html, /src="\/app\.js" type="module"/);
  assert.doesNotMatch(vite, /src\/|root:\s*process\.cwd\(\)/);
});

function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), "piantee-cf-output-"));
  const script = join(root, "scripts", "assemble-cloudflare-output.mjs");
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, read("../../scripts/assemble-cloudflare-output.mjs"));
  const base = join(root, "cloudflare", "dist", ".cloudflare", "output", "v0");
  const publicDir = join(base, "workers", "default", "assets");
  const files = [
    ["config.json", "{}"],
    ["workers/default/bundle/index.js", "export default { fetch() {} };"],
    ["workers/default/assets/index.html", "<html></html>"],
    ["workers/default/assets/favicon.svg", "<svg></svg>"],
    ["workers/default/assets/assets/index-123abc.js", "export {};"],
    ["workers/default/assets/assets/index-123abc.css", "body {}"]
  ];
  for (const [path, content] of files) {
    const target = join(base, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { root, base, publicDir, script, run: () => execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" }) };
}

test("Build Output: include il Worker e solo gli asset pubblici previsti", () => {
  const f = buildFixture();
  try {
    f.run();
    assert.equal(readFileSync(join(f.root, ".cloudflare", "output", "v0", "workers/default/assets/index.html"), "utf8"), "<html></html>");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Build Output: rifiuta asset aggiuntivi non autorizzati", () => {
  const f = buildFixture();
  try {
    writeFileSync(join(f.publicDir, "private.json"), '{"private":true}');
    assert.throws(f.run);
    assert.equal(readFileSync(join(f.publicDir, "private.json"), "utf8"), '{"private":true}');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Build Output: non segue un symlink al posto del manifest", () => {
  const f = buildFixture();
  try {
    const manifest = join(f.base, "config.json");
    const other = join(f.root, "other.json");
    writeFileSync(other, "{}");
    rmSync(manifest);
    symlinkSync(other, manifest);
    assert.throws(f.run);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Build Output: non riscrive una directory di destinazione collegata altrove", () => {
  const f = buildFixture();
  try {
    const external = join(f.root, "external");
    mkdirSync(external);
    writeFileSync(join(external, "sentinel"), "intatto");
    const output = join(f.root, ".cloudflare", "output");
    mkdirSync(dirname(output), { recursive: true });
    symlinkSync(external, output, "dir");
    assert.throws(f.run);
    assert.equal(readFileSync(join(external, "sentinel"), "utf8"), "intatto");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
