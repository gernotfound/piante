import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const workerPath = fileURLToPath(new URL("../../cloudflare/worker/index.js", import.meta.url));
const schema = readFileSync(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
const NOW = "2026-11-13T10:00:00.000Z";

function simulator({ withDb = true } = {}) {
  return new Miniflare({
    scriptPath: workerPath,
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    // The pinned stable workerd build supports dates up to 2026-08-06.
    compatibilityDate: "2026-08-06",
    ...(withDb ? { d1Databases: { DB: "00000000-0000-4000-8000-000000000047" } } : {})
  });
}

async function setup(t, { withDb = true } = {}) {
  const worker = simulator({ withDb });
  t.after(() => worker.dispose());
  if (!withDb) return { worker };
  const db = await worker.getD1Database("DB");
  // D1.exec interprets multiline statements as separate queries. The v1
  // migration contains only top-level CREATE TABLE/INDEX/TRIGGER/VIEW statements.
  // Prepare each complete statement without modifying the source migration.
  const executable = schema.split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith("--")).join("\n");
  const statements = executable.split(/(?=^CREATE (?:TABLE|INDEX|TRIGGER|VIEW)\b)/gm)
    .map(statement => statement.trim()).filter(Boolean);
  assert.equal(statements.length, 24, "Review the loader when migration v1 changes");
  assert.ok(statements.every(statement => /^CREATE (?:TABLE|INDEX|TRIGGER|VIEW)\b/.test(statement)
    && statement.endsWith(";")), "Unexpected SQL in initial migration");
  const applied = await db.batch(statements.map(statement =>
    db.prepare(statement.replace(/\r?\n/g, " "))));
  assert.equal(applied.length, statements.length);
  assert.ok(applied.every(result => result.success === true));
  return { worker, db };
}

async function get(worker, path, init) {
  const response = await worker.dispatchFetch("https://piantee.example.test" + path, init);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function seed(db) {
  const tables = [
    ["taxon-1", "Pianta_%!", "pianta-1", "Fruttifere"],
    ["taxon-2", "Pianta privata", "pianta-2", "SEGRETO"],
    ["taxon-3", "Seconda pianta", "pianta-3", "fruttifere"]
  ];
  const statements = [];
  for (let i = 0; i < tables.length; i++) {
    const [id, name, key, category] = tables[i];
    const specimenId = "plant-" + String(i + 1);
    const code = "T" + String(i + 1).padStart(5, "0");
    statements.push(
      db.prepare("INSERT INTO taxa (id,kind,name,name_key,category,created_at,updated_at) VALUES (?,'unverified',?,?,?,?,?)")
        .bind(id, name, key, category, NOW, NOW),
      db.prepare("INSERT INTO specimen_code_reservations (code,specimen_id,reserved_at) VALUES (?,?,?)")
        .bind(code, specimenId, NOW),
      db.prepare("INSERT INTO specimens (id,taxon_id,code,internal_notes,created_at,updated_at) VALUES (?,?,?,?,?,?)")
        .bind(specimenId, id, code, "NOTE_PRIVATE_CONFIDENTIAL", NOW, NOW)
    );
    if (i !== 1) {
      statements.push(
        db.prepare("INSERT INTO public_listings (specimen_id,summary,published_at,updated_at) VALUES (?,?,?,?)")
          .bind(specimenId, "Pubblicata", NOW, NOW)
      );
    }
  }
  const result = await db.batch(statements);
  assert.equal(result.length, statements.length);
  assert.ok(result.every(item => item.success === true));
}

test("workerd + D1: migration effettiva, catalogo realmente vuoto, policy privata chiusa", async t => {
  const { worker, db } = await setup(t);
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_listings'").all();
  assert.deepEqual(tables.results.map(row => row.name), ["public_listings"]);
  const empty = await get(worker, "/api/v1/catalog");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, { items: [], nextCursor: null });
  assert.equal(empty.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal((await get(worker, "/api/v1/catalog/categories")).status, 200);
  assert.deepEqual((await get(worker, "/api/v1/catalog/categories")).body, { categories: [] });
  assert.equal((await get(worker, "/api/v1/admin/plants", {
    headers: { "Cf-Access-Jwt-Assertion": "forged", Cookie: "CF_Authorization=fake" }
  })).status, 403);
  assert.equal((await get(worker, "/api/v1/admin/session")).status, 403);
  assert.equal((await get(worker, "/api/v1/admin/session", {
    headers: { "Cf-Access-Jwt-Assertion": "forged" }
  })).status, 403);
  assert.equal((await get(worker, "/api/v1/missing")).status, 404);
});

test("workerd + D1: query pubblica, filtri, ritiro e protezione delle note", async t => {
  const { worker, db } = await setup(t);
  await seed(db);
  const all = await get(worker, "/api/v1/catalog");
  assert.equal(all.status, 200);
  assert.equal(all.body.items.length, 2);
  assert.equal(JSON.stringify(all.body).includes("NOTE_PRIVATE_CONFIDENTIAL"), false);
  assert.equal(JSON.stringify(all.body).includes("Pianta privata"), false);
  assert.deepEqual((await get(worker, "/api/v1/catalog/categories")).body, { categories: ["Fruttifere"] });
  assert.equal((await get(worker, "/api/v1/catalog?category=FRUTTIFERE")).body.items.length, 2);
  assert.deepEqual(
    (await get(worker, "/api/v1/catalog?q=%23T00001")).body.items.map(item => item.code),
    ["T00001"]
  );
  assert.deepEqual((await get(worker, "/api/v1/catalog?q=%23Pianta")).body.items, []);
  assert.deepEqual(
    (await get(worker, "/api/v1/catalog?q=%25")).body.items.map(item => item.code),
    ["T00001"]
  );
  const detail = await get(worker, "/api/v1/catalog/plant-1");
  assert.equal(detail.status, 200);
  assert.equal(JSON.stringify(detail.body).includes("NOTE_PRIVATE_CONFIDENTIAL"), false);
  await db.prepare("DELETE FROM public_listings WHERE specimen_id = ?").bind("plant-1").run();
  assert.equal((await get(worker, "/api/v1/catalog/plant-1")).status, 404);
  assert.equal((await get(worker, "/api/v1/catalog")).body.items.length, 1);
  assert.equal((await get(worker, "/api/v1/catalog?limit=0")).status, 400);
  assert.equal((await get(worker, "/api/v1/catalog", { method: "POST" })).status, 405);
});

test("workerd: un binding D1 mancante restituisce 503 e non catalogo vuoto", async t => {
  const { worker } = await setup(t, { withDb: false });
  assert.equal((await get(worker, "/api/v1/catalog")).status, 503);
  assert.equal((await get(worker, "/api/v1/catalog/categories")).status, 503);
  assert.equal((await get(worker, "/api/v1/admin")).status, 403);
});
