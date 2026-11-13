import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT = join(ROOT, "dist");
const PUBLIC_FILES = [
  "index.html", "favicon.ico", "favicon.svg", "favicon-16x16.png",
  "favicon-32x32.png", "favicon-48x48.png", "social-preview-v1.png"
];

// Only explicitly reviewed client files may enter dist/. A recursive src/ copy
// would accidentally expose future Worker modules or server-only code.
const CLIENT_MODULES = [
  "src/main.js", "src/config.js", "src/domain.js", "src/catalog.js",
  "src/plant-store.js", "src/specimen-codes.js", "src/taxonomy.js",
  "src/ui/public.js", "src/ui/admin.js", "src/ui/artwork.js"
];
const CLIENT_STYLES = [
  "styles/base.css", "styles/public.css", "styles/admin.css",
  "styles/responsive.css"
];

export function buildSite(output = DEFAULT_OUTPUT) {
  const destination = resolve(output);
  if (destination === ROOT || ROOT.startsWith(destination + sep)) {
    throw new Error("La directory di output non può contenere il repository.");
  }
  if (existsSync(destination)) {
    if (destination !== DEFAULT_OUTPUT || lstatSync(destination).isSymbolicLink()) {
      throw new Error("Directory di output già esistente o collegamento simbolico.");
    }
    rmSync(destination, { recursive: true, force: true });
  }
  mkdirSync(destination, { recursive: true });
  const emitted = [];

  function copy(relativePath) {
    const source = join(ROOT, relativePath);
    if (!lstatSync(source).isFile()) throw new Error("Asset pubblico non regolare: " + relativePath);
    const target = join(destination, relativePath);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(source, target);
    emitted.push(relativePath.replaceAll("\\", "/"));
  }

  for (const file of [...PUBLIC_FILES, ...CLIENT_MODULES, ...CLIENT_STYLES]) copy(file);
  return emitted.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildSite();
  console.log("Build pubblico generato: " + files.length + " asset in dist/");
}
