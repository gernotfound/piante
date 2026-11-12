import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildSite } from "../../scripts/build-site.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const read = (path) => readFileSync(join(ROOT, path));

test("Hosting pubblica soltanto il target Firebase previsto da una directory isolata", () => {
  const firebase = readJson("../../firebase.json");
  const rc = readJson("../../.firebaserc");
  assert.equal(rc.projects.default, "piante-a617e");
  assert.deepEqual(rc.targets["piante-a617e"].hosting.piantee, ["piantee"]);
  assert.equal(firebase.hosting.target, "piantee");
  assert.equal(firebase.hosting.site, undefined);
  assert.equal(firebase.hosting.public, "dist");
  assert.ok(firebase.hosting.ignore.includes("**/.*"));
});

test("l'output Hosting include solo gli asset dichiarati, senza file operativi o dati privati", () => {
  const workspace = mkdtempSync(join(tmpdir(), "piante-hosting-test-"));
  try {
    const destination = join(workspace, "site");
    const emitted = buildSite(destination);
    const allowedRoot = new Set([
      "index.html", "favicon.ico", "favicon.svg",
      "favicon-16x16.png", "favicon-32x32.png", "favicon-48x48.png",
      "social-preview-v1.png"
    ]);
    assert.ok(emitted.length >= allowedRoot.size + 1);
    for (const file of emitted) {
      assert.ok(allowedRoot.has(file) || /^src\/(?:[a-z-]+\/)*[a-z-]+\.js$/.test(file) ||
        /^styles\/(?:[a-z-]+\/)*[a-z-]+\.css$/.test(file), "File non consentito nel build: " + file);
      assert.deepEqual(readFileSync(join(destination, file)), read(file), "Asset alterato: " + file);
    }
    for (const file of allowedRoot) assert.ok(emitted.includes(file), "Asset pubblico mancante: " + file);
    for (const forbidden of ["firestore.rules", "firebase.json", ".firebaserc", "README.md",
      "AGENTS.md", "package.json", ".github/workflows/ci.yml", "tests/contracts/hosting.test.js",
      "scripts/reconcile-firestore-rules.mjs", "docs/README.md"]) {
      assert.ok(!emitted.includes(forbidden), "File interno distribuito: " + forbidden);
    }

    const html = readFileSync(join(destination, "index.html"), "utf8");
    const localResources = [
      ...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/[^"]+)"/g)
    ].map((match) => match[1].slice(1));
    for (const resource of localResources) {
      assert.ok(emitted.includes(resource), "Risorsa referenziata ma non distribuita: " + resource);
    }
    for (const file of emitted.filter((path) => path.startsWith("src/") && path.endsWith(".js"))) {
      const source = readFileSync(join(destination, file), "utf8");
      for (const match of source.matchAll(/\b(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
        const dependency = posix.normalize(posix.join(posix.dirname(file), match[1]));
        assert.ok(emitted.includes(dependency), "Modulo JS locale non distribuito: " + dependency);
      }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("asset senza hash non vengono serviti da cache persistenti e lo smoke test verifica i moduli", () => {
  const { hosting } = readJson("../../firebase.json");
  const global = hosting.headers.find((entry) => entry.source === "**");
  const cache = global?.headers.find((entry) => entry.key.toLowerCase() === "cache-control");
  assert.match(cache?.value ?? "", /no-cache/);
  assert.match(cache?.value ?? "", /no-store/);
  assert.match(cache?.value ?? "", /must-revalidate/);

  const html = read("index.html").toString("utf8");
  const workflow = read(".github/workflows/deploy-production.yml").toString("utf8");
  const css = [...html.matchAll(/<link rel="stylesheet" href="(\/styles\/[^"]+\.css)"/g)].map((match) => match[1]);
  assert.deepEqual(css, ["/styles/base.css", "/styles/public.css", "/styles/admin.css", "/styles/responsive.css"]);
  for (const path of [...css, "/src/main.js", "/src/ui/public.js", "/src/ui/admin.js", "/src/ui/artwork.js"]) {
    assert.ok(workflow.includes(path.slice(1)), "Asset non coperto dallo smoke test: " + path);
  }
  assert.ok(workflow.indexOf("npm run build") > 0 &&
    workflow.indexOf("npm run build") < workflow.indexOf("npx firebase deploy"),
    "La compilazione pubblica deve precedere il rilascio.");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, "Titolo HTML mancante");
  assert.ok(workflow.includes(`grep -q '${title}' /tmp/piante-home.html`),
    "Lo smoke test di Hosting deve cercare il titolo realmente distribuito.");
  assert.match(workflow, /content_type=.*--write-out/);
  assert.doesNotMatch(workflow, /piantee\.web\.app\/styles\.css/);
});
