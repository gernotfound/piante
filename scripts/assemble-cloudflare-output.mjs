import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
const outputParent = join(root, ".cloudflare", "output");
if (existsSync(outputParent)) {
  if (lstatSync(outputParent).isSymbolicLink() || !lstatSync(outputParent).isDirectory()) {
    throw new Error("Percorso Build Output non sicuro.");
  }
  rmSync(outputParent, { recursive: true, force: true });
}
mkdirSync(outputParent, { recursive: true });
cpSync(generated, destination, { recursive: true });
