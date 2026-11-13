import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCloudflareSite } from "./build-cloudflare-site.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = join(root, "cloudflare", "dist");
const publicDir = join(root, "cloudflare", "public");
const expected = ["app.js", "favicon.svg", "index.html", "styles.css"];

const files = buildCloudflareSite();
if (JSON.stringify(files) !== JSON.stringify(expected)) {
  throw new Error("Asset Cloudflare inatteso; verificare prima la pubblicazione.");
}
if (existsSync(publicDir)) {
  if (lstatSync(publicDir).isSymbolicLink() || !lstatSync(publicDir).isDirectory()) {
    throw new Error("Directory pubblica Cloudflare non sicura.");
  }
  rmSync(publicDir, { recursive: true, force: true });
}
mkdirSync(publicDir);
copyFileSync(join(generated, "favicon.svg"), join(publicDir, "favicon.svg"));
