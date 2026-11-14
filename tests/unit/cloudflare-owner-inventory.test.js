import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../../cloudflare/worker/index.js";

const schema = readFileSync(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
const ISSUER = "https://piantee-owner-tests.cloudflareaccess.com";
const AUDIENCE = "a".repeat(64);
const OWNER = "7335d417-61da-459d-899c-0a01c76a2f94";
const KID = "synthetic-admin-inventory-key";

function newDatabase() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(schema);
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      return {
        bind(...args) {
          return {
            async all() { return { success: true, results: stmt.all(...args) }; },
            async first() { return stmt.get(...args) ?? null; }
          };
        }
      };
    }
  };
  return { sql, db, close() { sql.close(); } };
}

function seed(sql) {
  const now = "2026-11-14T10:00:00.000Z";
  sql.prepare(`INSERT INTO taxa
    (id,kind,name,name_key,category,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run("tax-1", "species", "Specie riservata", "specie riservata", "Fruttifere", now, now);
  sql.prepare(`INSERT INTO taxa
    (id,kind,name,name_key,category,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run("tax-2", "unverified", "Altra specie", "altra specie", null, now, now);
  sql.prepare(`INSERT INTO seed_lots
    (id,taxon_id,label,private_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?)`).run("lot-1", "tax-1", "LOTTO_PRIVATO", "NOTE_LOTTO", now, now);
  const reserve = sql.prepare(`INSERT INTO specimen_code_reservations
    (code,specimen_id,reserved_at) VALUES (?,?,?)`);
  const specimen = sql.prepare(`INSERT INTO specimens
    (id,taxon_id,seed_lot_id,code,internal_notes,source_details,private_location,
    created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const published = sql.prepare(`INSERT INTO public_listings
    (specimen_id,published_at,updated_at) VALUES (?,?,?)`);
  for (let i = 0; i < 7; i++) {
    const id = "plant-" + String(i);
    const code = "T" + String(i).padStart(5, "0");
    const updated = new Date(Date.parse(now) + i * 1000).toISOString();
    reserve.run(code, id, now);
    specimen.run(id, "tax-1", i === 0 ? "lot-1" : null, code,
      "NOTE_SEGRETE_" + String(i), "PROVENIENZA_INTERNA", "POSIZIONE_PRIVATA", now, updated);
    if (i === 0) published.run(id, now, now);
  }
}

async function accessFixture(t) {
  const keyPair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const previousFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async url => {
    fetched++;
    assert.equal(url, ISSUER + "/cdn-cgi/access/certs");
    return Response.json({ keys: [{
      kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", kid: KID
    }] });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const env = { ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_AUD: AUDIENCE, ACCESS_OWNER_SUB: OWNER };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  async function jwt(changes = {}) {
    const now = Math.floor(Date.now() / 1000);
    const prefix = encode({ alg: "RS256", kid: KID, typ: "JWT" }) + "." + encode({
      iss: ISSUER, aud: [AUDIENCE], type: "app", sub: OWNER,
      iat: now - 10, nbf: now - 10, exp: now + 600, ...changes
    });
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey,
      new TextEncoder().encode(prefix));
    return prefix + "." + Buffer.from(signature).toString("base64url");
  }
  return { env, jwt, fetchCount: () => fetched };
}

async function call(path, env, token = null, method = "GET") {
  const response = await worker.fetch(new Request("https://piantee.example.test" + path, {
    method,
    ...(token ? { headers: { "Cf-Access-Jwt-Assertion": token } } : {})
  }), env);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("proprietario unico: inventario privato e profili restano chiusi senza JWT", async t => {
  const { sql, db, close } = newDatabase();
  t.after(close);
  seed(sql);
  const f = await accessFixture(t);
  for (const path of [
    "/api/v1/admin/specimens", "/api/v1/admin/specimens/plant-0",
    "/api/v1/admin/taxa", "/api/v1/admin/taxa/tax-1"
  ]) {
    const result = await call(path, { DB: db, ...f.env });
    assert.equal(result.status, 403, path);
    assert.equal(JSON.stringify(result.body).includes("NOTE_SEGRETE"), false);
  }
  assert.equal(f.fetchCount(), 0, "No JWKS calls without a plausible token");
  const publicCatalog = await call("/api/v1/catalog", { DB: db });
  assert.equal(publicCatalog.body.items.length, 1);
  assert.equal(JSON.stringify(publicCatalog.body).includes("NOTE_SEGRETE"), false);
  assert.equal(JSON.stringify(publicCatalog.body).includes("LOTTO_PRIVATO"), false);
});

test("JWT firmato del solo owner abilita lettura privata senza account D1", async t => {
  const { sql, db, close } = newDatabase();
  t.after(close);
  seed(sql);
  const f = await accessFixture(t);
  const token = await f.jwt();
  const list = await call("/api/v1/admin/specimens?limit=2", { DB: db, ...f.env }, token);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(list.body.items.length, 2);
  assert.ok(list.body.nextCursor);
  assert.equal(list.body.items[0].id, "plant-6");
  assert.equal(Object.hasOwn(list.body.items[0], "internal_notes"), false);

  const ids = [...list.body.items.map(row => row.id)];
  let cursor = list.body.nextCursor;
  while (cursor) {
    const page = await call("/api/v1/admin/specimens?limit=2&cursor=" +
      encodeURIComponent(cursor), { DB: db, ...f.env }, token);
    assert.equal(page.status, 200);
    ids.push(...page.body.items.map(row => row.id));
    cursor = page.body.nextCursor;
  }
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  assert.deepEqual(ids, ["plant-6", "plant-5", "plant-4", "plant-3",
    "plant-2", "plant-1", "plant-0"]);

  const item = await call("/api/v1/admin/specimens/plant-0", { DB: db, ...f.env }, token);
  assert.equal(item.status, 200);
  assert.equal(item.body.internal_notes, "NOTE_SEGRETE_0");
  assert.equal(item.body.source_details, "PROVENIENZA_INTERNA");
  assert.equal(item.body.private_location, "POSIZIONE_PRIVATA");
  assert.equal(item.body.seed_lot_label, "LOTTO_PRIVATO");
  assert.ok(item.body.published_at);
  assert.equal(item.headers.get("Access-Control-Allow-Origin"), null);

  const taxa = await call("/api/v1/admin/taxa?limit=1", { DB: db, ...f.env }, token);
  assert.equal(taxa.status, 200);
  assert.equal(taxa.body.items.length, 1);
  assert.ok(taxa.body.nextCursor);
  const taxon = await call("/api/v1/admin/taxa/tax-1", { DB: db, ...f.env }, token);
  assert.equal(taxon.status, 200);
  assert.equal(taxon.body.name, "Specie riservata");
  assert.equal(taxon.body.version, 1);
  assert.equal(await sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='users'").get().n, 0);
});

test("solo il proprietario configurato: altra identità, servizio assente e bypass negati", async t => {
  const { sql, db, close } = newDatabase();
  t.after(close);
  seed(sql);
  const f = await accessFixture(t);
  const token = await f.jwt();
  assert.equal((await call("/api/v1/admin/specimens", { DB: db, ...f.env,
    ACCESS_OWNER_SUB: "7335d417-61da-459d-899c-0a01c76a2f95" }, token)).status, 403);
  assert.equal((await call("/api/v1/admin/specimens", { DB: db, ...f.env },
    await f.jwt({ sub: "7335d417-61da-459d-899c-0a01c76a2f95" }))).status, 403);
  assert.equal((await call("/api/v1/admin/specimens", { DB: db }, token)).status, 403);
  assert.equal((await call("/api/v1/admin/specimens", { ...f.env }, token)).status, 503);
  assert.equal((await call("/api/v1/admin/specimens", { DB: db, ...f.env }, token, "POST")).status, 405);
  assert.equal((await call("/api/v1/admin/write", { DB: db, ...f.env }, token)).status, 403);
  assert.equal((await call("/api/v1/admin/specimens/plant-999", { DB: db, ...f.env }, token)).status, 404);
  assert.equal((await call("/api/v1/admin/taxa/tax-999", { DB: db, ...f.env }, token)).status, 404);
});

test("endpoint privati: parametri doppi, cursori malevoli, path e metodi respinti", async t => {
  const { sql, db, close } = newDatabase();
  t.after(close);
  seed(sql);
  const f = await accessFixture(t);
  const token = await f.jwt();
  const invalid = [
    "/api/v1/admin/specimens?limit=0",
    "/api/v1/admin/specimens?limit=41",
    "/api/v1/admin/specimens?limit=2&limit=3",
    "/api/v1/admin/specimens?cursor=evil",
    "/api/v1/admin/specimens?cursor=" + "a".repeat(513),
    "/api/v1/admin/specimens?name=secret",
    "/api/v1/admin/taxa?q=privata",
    "/api/v1/admin/taxa?limit=1&bad=1",
    "/api/v1/admin/specimens/plant-0?limit=1",
    "/api/v1/admin/taxa/tax-1?x=y"
  ];
  for (const path of invalid) {
    const result = await call(path, { DB: db, ...f.env }, token);
    assert.equal(result.status, 400, path);
    assert.equal(JSON.stringify(result.body).includes("NOTE_SEGRETE"), false);
  }
  assert.equal((await call("/api/v1/admin/specimens/plant-0/extra",
    { DB: db, ...f.env }, token)).status, 403);
  assert.equal((await call("/api/v1/admin/specimens/%2Fsession",
    { DB: db, ...f.env }, token)).status, 403);
});

test("query D1 rotta: risposta opaca senza esporre errori o dati", async t => {
  const f = await accessFixture(t);
  const token = await f.jwt();
  const failing = { prepare() { throw new Error("SECRETS_ARE_PRIVATE"); } };
  const response = await call("/api/v1/admin/specimens", { DB: failing, ...f.env }, token);
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(response.body).includes("SECRETS_ARE_PRIVATE"), false);
  const corrupt = { prepare() { return { bind() { return { all: async () => ({
    success: true, results: [{ id: "plant-0", version: 0, updated_at: "invalid", internal_notes: "SECRET" }]
  }) }; } }; } };
  const response2 = await call("/api/v1/admin/taxa", { DB: corrupt, ...f.env }, token);
  assert.equal(response2.status, 503);
  assert.equal(JSON.stringify(response2.body).includes("SECRET"), false);
});
