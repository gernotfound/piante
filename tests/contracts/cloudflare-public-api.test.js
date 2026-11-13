import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../../cloudflare/worker/index.js";

const schema = readFileSync(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
const NOW = "2026-11-13T10:00:00.000Z";

// Real SQLite parser/constraints with an adapter for D1 prepare/bind/all/first.
// Native D1 runtime parity remains a separate verification obligation.
function syntheticDatabase() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(schema);
  const db = {
    prepare(query) {
      const statement = sql.prepare(query);
      return {
        bind(...args) {
          return {
            async all() { return { success: true, results: statement.all(...args) }; },
            async first() { return statement.get(...args) ?? null; }
          };
        }
      };
    }
  };
  return { sql, db, close: () => sql.close() };
}

function seed(db, count) {
  const taxonomy = db.prepare(`INSERT INTO taxa
    (id, kind, name, name_key, scientific_name, created_at, updated_at)
    VALUES (?, 'species', ?, ?, ?, ?, ?)`);
  const reservations = db.prepare(`INSERT INTO specimen_code_reservations
    (code, specimen_id, reserved_at) VALUES (?, ?, ?)`);
  const specimens = db.prepare(`INSERT INTO specimens
    (id, taxon_id, code, internal_notes, source_details, private_location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const published = db.prepare(`INSERT INTO public_listings
    (specimen_id, summary, photo_url, published_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
  taxonomy.run("taxon-1", "Pianta fittizia", "pianta fittizia", null, NOW, NOW);
  for (let i = 0; i < count; i++) {
    const id = `plant-${String(i).padStart(3, "0")}`;
    const code = `T${String(i).padStart(5, "0")}`;
    const timestamp = new Date(Date.parse(NOW) - Math.floor(i / 2) * 1000).toISOString();
    reservations.run(code, id, NOW);
    specimens.run(id, "taxon-1", code, "RISERVATO", "PROVENIENZA SEGRETA", "POSIZIONE SEGRETA", NOW, NOW);
    published.run(id, "Descrizione pubblica", "https://example.test/photo.jpg", timestamp, NOW);
  }
}

async function request(url, env, init) {
  const response = await worker.fetch(new Request(`https://piantee.example.test${url}`, init), env);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("D1 nuovo e vuoto: catalogo restituisce elenco vero, mai demo", async () => {
  const { db, close } = syntheticDatabase();
  try {
    const out = await request("/api/v1/catalog", { DB: db });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { items: [], nextCursor: null });
    assert.equal(out.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.equal(out.headers.get("Access-Control-Allow-Origin"), null);
  } finally { close(); }
});

test("pubblica solo la vista pubblica, senza dati riservati, e consente ritiro", async () => {
  const { db, sql, close } = syntheticDatabase();
  try {
    seed(sql, 2);
    const list = await request("/api/v1/catalog", { DB: db });
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 2);
    const item = await request("/api/v1/catalog/plant-000", { DB: db });
    assert.equal(item.status, 200);
    assert.equal(item.body.id, "plant-000");
    assert.equal(item.body.scientific_name, null);
    const combined = JSON.stringify([list.body, item.body]);
    for (const secret of ["RISERVATO", "PROVENIENZA SEGRETA", "POSIZIONE SEGRETA", "internal_notes", "seed_lot_id"]) {
      assert.equal(combined.includes(secret), false, secret);
    }
    sql.prepare("DELETE FROM public_listings WHERE specimen_id = ?").run("plant-000");
    assert.equal((await request("/api/v1/catalog/plant-000", { DB: db })).status, 404);
  } finally { close(); }
});

test("paginazione keyset senza duplicazioni anche con date identiche", async () => {
  const { db, sql, close } = syntheticDatabase();
  try {
    seed(sql, 11);
    let cursor = null;
    const seen = [];
    for (let page = 0; page < 6; page++) {
      const url = `/api/v1/catalog?limit=3${cursor ? `&cursor=${cursor}` : ""}`;
      const out = await request(url, { DB: db });
      assert.equal(out.status, 200);
      seen.push(...out.body.items.map(item => item.id));
      cursor = out.body.nextCursor;
      if (!cursor) break;
    }
    assert.equal(seen.length, 11);
    assert.equal(new Set(seen).size, 11);
    assert.deepEqual(seen, ["plant-001", "plant-000", "plant-003", "plant-002",
      "plant-005", "plant-004", "plant-007", "plant-006", "plant-009", "plant-008", "plant-010"]);
  } finally { close(); }
});

test("limiti, parametri doppi/sconosciuti e cursori malevoli respinti", async () => {
  const { db, close } = syntheticDatabase();
  try {
    for (const query of ["limit=0", "limit=41", "limit=-1", "limit=1.2", "limit=0003",
      "limit=99999", "limit=3&limit=4", "cursor=", "cursor=%25", "cursor=not-a-cursor",
      "q=secret", "limit=4&foo=bar", "cursor=" + "x".repeat(513)]) {
      const out = await request(`/api/v1/catalog?${query}`, { DB: db });
      assert.equal(out.status, 400, query);
      assert.deepEqual(out.body, { error: { code: "invalid_request" } });
    }
    assert.equal((await request("/api/v1/catalog/plant-001?bad=1", { DB: db })).status, 400);
    assert.equal((await request("/api/v1/catalog/%2Fadmin", { DB: db })).status, 404);
  } finally { close(); }
});

test("API private sempre bloccate e metodi pubblici di scrittura negati", async () => {
  const { db, close } = syntheticDatabase();
  try {
    for (const method of ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"]) {
      const response = await worker.fetch(new Request("https://piantee.example.test/api/v1/admin/plants", {
        method, headers: { "Cf-Access-Jwt-Assertion": "forged", "Cookie": "CF_Authorization=fake" }
      }), { DB: db });
      assert.equal(response.status, 403, method);
    }
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      const response = await request("/api/v1/catalog", { DB: db }, { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("Allow"), "GET");
    }
    assert.equal((await request("/api/v1/secret", { DB: db })).status, 404);
    assert.equal((await request("/api/v1/admin%2Fplants", { DB: db })).status, 404);
  } finally { close(); }
});

test("binding D1 assente, query fallita e risposta malformata non fanno trapelare errori", async () => {
  assert.equal((await request("/api/v1/catalog", {})).status, 503);
  assert.equal((await request("/api/v1/catalog?limit=0", {})).status, 400);
  const failure = { prepare() { throw new Error("DB_SECRET 123"); } };
  const out = await request("/api/v1/catalog", { DB: failure });
  assert.equal(out.status, 503);
  assert.equal(JSON.stringify(out.body).includes("DB_SECRET"), false);
  const failedResult = { prepare() { return { bind() { return { all: async () => ({ success: false, results: [] }) }; } }; } };
  assert.equal((await request("/api/v1/catalog", { DB: failedResult })).status, 503);
  const badDetail = { prepare() { return { bind() { return { first: async () => ({ id: "other", internal_notes: "PRIVATE" }) }; } }; } };
  const detail = await request("/api/v1/catalog/plant-001", { DB: badDetail });
  assert.equal(detail.status, 503);
  assert.equal(JSON.stringify(detail.body).includes("PRIVATE"), false);
});

test("API sconosciute non ricadono nel fallback SPA; asset separati", async () => {
  let calls = 0;
  const env = { ASSETS: { fetch: async () => { calls++; return new Response("static", { status: 200 }); } } };
  assert.equal((await request("/api/v1/missing", env)).status, 404);
  assert.equal(calls, 0);
  const response = await worker.fetch(new Request("https://piantee.example.test/"), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "static");
  assert.equal(calls, 1);
});

test("query pubbliche parametrizzate e nessun SELECT da tabelle private", () => {
  const source = readFileSync(new URL("../../cloudflare/worker/index.js", import.meta.url), "utf8");
  assert.match(source, /FROM public_catalog/);
  assert.doesNotMatch(source, /FROM\s+(?:specimens|seed_lots|journal_entries|specimen_code_reservations)\b/i);
  assert.doesNotMatch(source, /SELECT\s+\*/i);
  assert.match(source, /\.prepare\(DETAIL_SQL\)\.bind\(id\)/);
  assert.match(source, /\.bind\(cursor\[0\], cursor\[0\], cursor\[1\], limit \+ 1\)/);
});
