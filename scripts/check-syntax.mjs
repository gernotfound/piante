import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const directories = ["src", "scripts", "tests"];
let checked = 0;

function checkDirectory(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Collegamento simbolico non previsto: " + path);
    if (entry.isDirectory()) checkDirectory(path);
    else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", join(ROOT, path)], { encoding: "utf8" });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.stderr.write(result.stderr || "Errore di sintassi in " + path);
        process.exitCode = 1;
      }
      checked++;
    }
  }
}

for (const dir of directories) checkDirectory(dir);
console.log("Verificati " + checked + " file JavaScript.");
