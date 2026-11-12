import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT = join(ROOT, "dist");
const PUBLIC_FILES = [
  "index.html", "favicon.ico", "favicon.svg", "favicon-16x16.png",
  "favicon-32x32.png", "favicon-48x48.png", "social-preview-v1.png"
];
const SOURCE_DIRECTORIES = [["src", ".js"], ["styles", ".css"]];

// Only explicitly approved public files and frontend source types are deployed.
// New documentation, tests and operational files must never be copied automatically.
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

  function copySourceDirectory(dir, extension) {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Symlink non previsto tra i sorgenti pubblici: " + path);
      if (entry.isDirectory()) copySourceDirectory(path, extension);
      else if (entry.isFile() && extname(entry.name) === extension) copy(path);
    }
  }

  for (const file of PUBLIC_FILES) copy(file);
  for (const [dir, extension] of SOURCE_DIRECTORIES) copySourceDirectory(dir, extension);
  return emitted.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildSite();
  console.log("Build pubblico generato: " + files.length + " asset in dist/");
}
