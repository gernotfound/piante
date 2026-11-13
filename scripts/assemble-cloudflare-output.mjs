import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = join(root, "cloudflare", "dist", ".cloudflare", "output", "v0");
const destination = join(root, ".cloudflare", "output", "v0");
const manifest = join(generated, "config.json");

if (!existsSync(manifest) || !lstatSync(manifest).isFile()) {
  throw new Error("Vite non ha prodotto il Build Output Cloudflare atteso.");
}
const config = JSON.parse(readFileSync(manifest, "utf8"));
assert.ok(config && typeof config === "object", "Build Output invalido");
const bundle = join(generated, "workers", "default", "bundle", "index.js");
const staticDir = join(generated, "workers", "default", "assets");
assert.ok(existsSync(bundle) && lstatSync(bundle).isFile(), "Worker server non incluso nel build.");
assert.ok(existsSync(staticDir) && lstatSync(staticDir).isDirectory(), "Asset pubblici mancanti.");

function assetPaths(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error("Symlink vietato negli asset pubblici: " + relative);
    if (entry.isDirectory()) return assetPaths(join(directory, entry.name), relative + "/");
    if (!entry.isFile()) throw new Error("Elemento non regolare negli asset pubblici: " + relative);
    return [relative];
  });
}
const assetFiles = assetPaths(staticDir).sort();
for (const required of ["favicon.svg", "index.html"]) {
  assert.ok(assetFiles.includes(required), "Asset obbligatorio assente: " + required);
}
assert.ok(assetFiles.some(file => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(file)),
  "Bundle JavaScript client mancante.");
assert.ok(assetFiles.some(file => /^assets\/index-[A-Za-z0-9_-]+\.css$/.test(file)),
  "Bundle CSS client mancante.");
for (const file of assetFiles) {
  if (!["favicon.svg", "index.html"].includes(file) &&
      !/^assets\/index-[A-Za-z0-9_-]+\.(?:js|css)$/.test(file)) {
    throw new Error("Asset inatteso nell'output pubblico: " + file);
  }
}

const outputParent = join(root, ".cloudflare", "output");
if (existsSync(outputParent)) {
  if (lstatSync(outputParent).isSymbolicLink() || !lstatSync(outputParent).isDirectory()) {
    throw new Error("Percorso Build Output non sicuro.");
  }
  rmSync(outputParent, { recursive: true, force: true });
}
mkdirSync(outputParent, { recursive: true });
cpSync(generated, destination, { recursive: true });
