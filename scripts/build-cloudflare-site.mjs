import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT = join(ROOT, "cloudflare", "dist");
const PUBLIC_ASSETS = Object.freeze({
  "cloudflare/site/index.html": "index.html",
  "cloudflare/site/app.js": "app.js",
  "cloudflare/site/styles.css": "styles.css",
  "favicon.svg": "favicon.svg"
});

// Cloudflare's build is intentionally separate from the legacy Firebase dist/.
// Never discover assets recursively: an API module or private file must require
// an explicit review before it is allowed onto the public CDN.
export function buildCloudflareSite(output = DEFAULT_OUTPUT) {
  const destination = resolve(output);
  if (destination === ROOT || ROOT.startsWith(destination + sep)) {
    throw new Error("La directory di output non può contenere il repository.");
  }
  if (existsSync(destination)) {
    if (destination !== DEFAULT_OUTPUT || lstatSync(destination).isSymbolicLink()) {
      throw new Error("Directory di output non sicura o già esistente.");
    }
    rmSync(destination, { recursive: true, force: true });
  }
  mkdirSync(destination, { recursive: true });
  const emitted = [];
  for (const [sourcePath, publicPath] of Object.entries(PUBLIC_ASSETS)) {
    const source = join(ROOT, sourcePath);
    if (!lstatSync(source).isFile()) throw new Error("Asset non regolare: " + sourcePath);
    const target = join(destination, publicPath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    emitted.push(publicPath);
  }
  return emitted.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const emitted = buildCloudflareSite();
  console.log("Build Cloudflare isolato: " + emitted.join(", "));
}
