import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC_ASSETS = [
  "index.html", "favicon.ico", "favicon.svg", "favicon-16x16.png",
  "favicon-32x32.png", "favicon-48x48.png", "social-preview-v1.png",
  "src/main.js", "src/config.js", "src/domain.js", "src/catalog.js",
  "src/plant-store.js", "src/specimen-codes.js", "src/taxonomy.js",
  "src/ui/public.js", "src/ui/admin.js", "src/ui/artwork.js",
  "styles/base.css", "styles/public.css", "styles/admin.css",
  "styles/responsive.css"
];

test("il build pubblico non include nuovi moduli server o file JS non esaminati", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "piante-public-boundary-"));
  try {
    for (const file of [...PUBLIC_ASSETS, "scripts/build-site.mjs"]) {
      const destination = join(workspace, file);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(ROOT, file), destination);
    }

    // Simula un modulo del futuro backend e un modulo client ancora non autorizzato.
    for (const file of ["src/server/private-worker.js", "src/ui/new-module.js"]) {
      const destination = join(workspace, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, "export const sensitiveValue = 'should-not-be-public';\n");
    }

    const scriptUrl = pathToFileURL(join(workspace, "scripts/build-site.mjs")).href;
    const { buildSite } = await import(scriptUrl);
    const emitted = buildSite();

    assert.deepEqual(emitted, [...PUBLIC_ASSETS].sort());
    for (const file of ["src/server/private-worker.js", "src/ui/new-module.js"]) {
      assert.equal(existsSync(join(workspace, "dist", file)), false, "Modulo non revisionato pubblicato: " + file);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
