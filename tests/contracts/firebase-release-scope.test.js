import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldPublishFirebase } from "../../scripts/firebase-release-scope.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("i soli cambiamenti Cloudflare non avviano i deploy Firebase", () => {
  for (const changed of [
    [],
    ["cloudflare/worker/index.js", "cloudflare/migrations/0001.sql"],
    ["scripts/build-site.mjs", "tests/contracts/publication-boundary.test.js"],
    ["docs/architecture/overview.md", "AGENTS.md"],
    ["src/main.js", "cloudflare/worker/index.js"],
    ["firestore.rules", "wrangler.jsonc"]
  ]) {
    assert.equal(shouldPublishFirebase(changed), false, changed.join(", "));
  }
  assert.throws(() => shouldPublishFirebase([null]), /non valido/);
});

test("un commit esclusivamente Firebase continua a pubblicare i file interessati", () => {
  for (const changed of [
    ["src/main.js"],
    ["styles/responsive.css", "tests/unit/domain.test.js"],
    ["firestore.rules"],
    ["firebase.json"],
    ["index.html", "scripts/build-site.mjs"],
    ["favicon.svg", "social-preview-v1.png"]
  ]) {
    assert.equal(shouldPublishFirebase(changed), true, changed.join(", "));
  }
});

test("entrambi i workflow bloccano il deploy per modifiche fuori perimetro", () => {
  const workflows = [
    {
      path: "../../.github/workflows/deploy-firestore-rules.yml",
      privilegedSteps: [
        "Richiedi la configurazione WIF dedicata a Firestore",
        "Autentica Firestore con token temporaneo",
        "Rifiuta avanzamenti di main prima delle scritture",
        "Riconcilia solo le Firestore Security Rules",
        "Verifica la release effettivamente attiva",
        "Attendi la propagazione dopo una modifica"
      ]
    },
    {
      path: "../../.github/workflows/deploy-production.yml",
      privilegedSteps: [
        "Installa la CLI Firebase",
        "Costruisci la directory pubblica isolata",
        "Controlla la configurazione Workload Identity Federation",
        "Autentica GitHub a Google Cloud senza chiavi JSON",
        "Pubblica solo il sito piantee sul canale live",
        "Verifica raggiungibilità HTTP dei file pubblici"
      ]
    }
  ];

  for (const { path, privilegedSteps } of workflows) {
    const yaml = read(path);
    assert.match(yaml, /id: firebase_scope/);
    assert.match(yaml, /run: node scripts\/firebase-release-scope\.mjs/);
    assert.match(yaml, /fetch-depth: (?:0|2)/);
    for (const name of privilegedSteps) {
      const start = yaml.indexOf(`      - name: ${name}\n`);
      assert.ok(start >= 0, `Step mancante in ${path}: ${name}`);
      const end = yaml.indexOf("\n      - name:", start + 1);
      const step = yaml.slice(start, end < 0 ? undefined : end);
      assert.match(step, /if: .*steps\.firebase_scope\.outputs\.publish == 'true'/,
        `Step non protetto in ${path}: ${name}`);
    }
  }
});
