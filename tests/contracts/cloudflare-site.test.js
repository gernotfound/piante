import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { buildCloudflareSite } from "../../scripts/build-cloudflare-site.mjs";

const ROOT = new URL("../../", import.meta.url);
const SOURCES = {
  "index.html": "cloudflare/site/index.html",
  "app.js": "cloudflare/site/app.js",
  "styles.css": "cloudflare/site/styles.css",
  "favicon.svg": "favicon.svg"
};
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("Cloudflare costruisce solo gli asset dichiarati, in directory indipendente da Firebase", () => {
  const dir = mkdtempSync(join(tmpdir(), "piantee-cf-build-"));
  try {
    const output = join(dir, "public");
    const emitted = buildCloudflareSite(output);
    assert.deepEqual(emitted, Object.keys(SOURCES).sort());
    for (const [asset, source] of Object.entries(SOURCES)) {
      assert.deepEqual(readFileSync(join(output, asset)), readFileSync(new URL(source, ROOT)));
    }
    assert.equal(existsSync(join(output, "cloudflare", "worker", "index.js")), false);
    assert.equal(existsSync(join(output, "src", "config.js")), false);
    assert.equal(existsSync(join(output, "firebase.json")), false);
    assert.equal(existsSync(join(output, "migrations")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("l'elenco non cresce quando vengono aggiunti file non revisionati", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "piantee-cf-negative-"));
  try {
    for (const source of [...Object.values(SOURCES), "scripts/build-cloudflare-site.mjs"]) {
      const destination = join(workspace, source);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(new URL(source, ROOT), destination);
    }
    const secret = join(workspace, "cloudflare/site/server-secret-never-publish.js");
    writeFileSync(secret, "export const neverPublic = true;\\n");
    const { buildCloudflareSite: isolatedBuild } = await import(
      pathToFileURL(join(workspace, "scripts/build-cloudflare-site.mjs")).href
    );
    const emitted = isolatedBuild();
    assert.deepEqual(emitted, Object.keys(SOURCES).sort());
    assert.equal(existsSync(join(workspace, "cloudflare/dist/server-secret-never-publish.js")), false);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("tutte le risorse statiche HTML hanno un asset pubblicato e non importano Firebase", () => {
  const html = read("cloudflare/site/index.html");
  const js = read("cloudflare/site/app.js");
  const css = read("cloudflare/site/styles.css");
  const paths = [...html.matchAll(/(?:href|src)="(\/[a-z.\/-]+)"/g)].map(match => match[1]);
  for (const path of paths) {
    if (path.startsWith("/#") || path === "/") continue;
    assert.ok(path.slice(1) in SOURCES, "Riferimento non pubblicato: " + path);
  }
  assert.match(html, /lang="it"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /<main>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<dialog\b/);
  assert.match(html, /href="\/favicon.svg"/);
  assert.doesNotMatch(html + js, /firebase\/|firebaseapp|firebaseConfig|<script[^>]*type="module"/i);
  assert.doesNotMatch(html + js, /login|checkout|pagamento/i);
  assert.match(css, /minmax\(0,\s*1fr\)/);
  assert.match(css, /@media \(min-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /\/api\/v1\/catalog/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
});

test("script e source map backend, segreti e DB sono esclusi dalla vetrina", () => {
  const assets = Object.keys(SOURCES);
  assert.equal(assets.some(path => /\.map$|\.env|\.sql$|\.json$|worker|server/i.test(path)), false);
  const buildSource = read("scripts/build-cloudflare-site.mjs");
  assert.doesNotMatch(buildSource, /readdirSync|cpSync.*recursive/);
  assert.match(read(".gitignore"), /\/cloudflare\/dist\//);
});
