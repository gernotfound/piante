import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const sql = readFileSync(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
const NOW = "2026-01-01T00:00:00Z";

function newDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(sql);
  return db;
}

function taxon(db, id = "t1", name = "Pianta esemplificativa") {
  db.prepare(`INSERT INTO taxa (id, kind, name, name_key, created_at, updated_at)
    VALUES (?, 'unverified', ?, ?, ?, ?)`).run(id, name, name.toLowerCase(), NOW, NOW);
}

function cultivar(db, id = "c1", taxonId = "t1") {
  db.prepare(`INSERT INTO cultivars (id, taxon_id, name, name_key, created_at, updated_at)
    VALUES (?, ?, 'Cultivar di esempio', 'cultivar di esempio', ?, ?)`).run(id, taxonId, NOW, NOW);
}

function reserve(db, code = "ABC123", id = "p1") {
  db.prepare(`INSERT INTO specimen_code_reservations (code, specimen_id, reserved_at)
    VALUES (?, ?, ?)`).run(code, id, NOW);
}

function specimen(db, { id = "p1", taxonId = "t1", cultivarId = null, lotId = null, code = "ABC123" } = {}) {
  db.prepare(`INSERT INTO specimens
    (id, taxon_id, cultivar_id, seed_lot_id, code, internal_notes, source_details, private_location,
     created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'NOTA PRIVATA', 'PROVENIENZA PRIVATA', 'POSIZIONE PRIVATA', ?, ?)`)
    .run(id, taxonId, cultivarId, lotId, code, NOW, NOW);
}

function publish(db, id = "p1") {
  db.prepare(`INSERT INTO public_listings (specimen_id, summary, photo_url, published_at, updated_at)
    VALUES (?, 'Descrizione pubblica', 'https://example.test/photo.jpg', ?, ?)`).run(id, NOW, NOW);
}

test("schema Fresh Start vuoto, FK valide e nessuna dipendenza/seed preesistente", () => {
  const db = newDatabase();
  try {
    const names = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map(x => x.name);
    assert.deepEqual(names.sort(), ["cultivar_harvest_months", "cultivars", "journal_entries", "public_listings",
      "seed_lots", "specimen_code_reservations", "specimens", "taxa", "taxon_aliases", "taxon_harvest_months"].sort());
    assert.equal(db.prepare("SELECT count(*) AS n FROM taxa").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM specimens").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM public_catalog").get().n, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM journal_entries").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM seed_lots").get().n, 0);
  } finally { db.close(); }
});

test("profili botanici e dati sconosciuti rimangono condivisi, senza inferenze", () => {
  const db = newDatabase();
  try {
    taxon(db);
    cultivar(db);
    reserve(db);
    specimen(db, { cultivarId: "c1" });
    publish(db);
    const before = db.prepare("SELECT * FROM public_catalog WHERE id='p1'").get();
    assert.equal(before.taxon_name, "Pianta esemplificativa");
    assert.equal(before.cultivar_name, "Cultivar di esempio");
    assert.equal(before.taxon_cold_min_c, null);
    assert.equal(before.cultivar_cold_min_c, null);
    assert.equal(before.cultivar_fruit_notes, null);
    assert.equal(before.summary, "Descrizione pubblica");
    db.prepare("UPDATE taxa SET name = ?, version=version+1 WHERE id = ?").run("Nome condiviso corretto", "t1");
    assert.equal(db.prepare("SELECT taxon_name FROM public_catalog WHERE id='p1'").get().taxon_name,
      "Nome condiviso corretto");
    db.prepare("DELETE FROM public_listings WHERE specimen_id='p1'").run();
    assert.equal(db.prepare("SELECT count(*) AS n FROM public_catalog").get().n, 0);
  } finally { db.close(); }
});

test("la vista anonima non espone inventario, diario, lotti o informazioni private", () => {
  const db = newDatabase();
  try {
    taxon(db);
    reserve(db);
    specimen(db);
    const cols = db.prepare("PRAGMA table_info(public_catalog)").all().map(x => x.name);
    for (const privateColumn of ["internal_notes", "source_details", "private_location", "seed_lot_id",
      "image_url", "source_cultivar_label", "private_notes", "note", "event_on", "life_stage"]) {
      assert.ok(!cols.includes(privateColumn), `Il catalogo espone ${privateColumn}`);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM public_catalog").get().n, 0);
    publish(db);
    const exposed = JSON.stringify(db.prepare("SELECT * FROM public_catalog").all());
    for (const secret of ["NOTA PRIVATA", "PROVENIENZA PRIVATA", "POSIZIONE PRIVATA"]) {
      assert.equal(exposed.includes(secret), false);
    }
    assert.throws(() => db.prepare(`INSERT INTO public_listings
      (specimen_id, photo_url, published_at, updated_at) VALUES ('bad', 'https://example.test/a', ?, ?)`)
      .run(NOW, NOW), /FOREIGN KEY/);
    assert.throws(() => db.prepare(`UPDATE public_listings SET photo_url = 'http://not-secure.test' WHERE specimen_id='p1'`).run(), /CHECK/);
  } finally { db.close(); }
});

test("coltivar e lotti non possono appartenere a una specie diversa", () => {
  const db = newDatabase();
  try {
    taxon(db);
    taxon(db, "t2", "Altra pianta");
    cultivar(db, "c1", "t2");
    db.prepare(`INSERT INTO seed_lots (id, taxon_id, label, created_at, updated_at)
      VALUES ('lot2', 't2', 'Lotto di prova', ?, ?)`).run(NOW, NOW);
    reserve(db);
    assert.throws(() => specimen(db, { cultivarId: "c1" }), /FOREIGN KEY/);
    assert.throws(() => specimen(db, { lotId: "lot2" }), /FOREIGN KEY/);
    specimen(db);
    assert.equal(db.prepare("SELECT cultivar_id, seed_lot_id FROM specimens").get().cultivar_id, null);
  } finally { db.close(); }
});

test("alias ambiguo non diventa un'identità o un collegamento automatico", () => {
  const db = newDatabase();
  try {
    taxon(db);
    taxon(db, "t2", "Pianta alternativa");
    const stmt = db.prepare(`INSERT INTO taxon_aliases(taxon_id, alias, alias_key) VALUES (?, 'Nome ambiguo', 'nome ambiguo')`);
    stmt.run("t1");
    stmt.run("t2");
    const matches = db.prepare("SELECT taxon_id FROM taxon_aliases WHERE alias_key='nome ambiguo'").all();
    assert.equal(matches.length, 2);
    assert.throws(() => stmt.run("t1"), /UNIQUE/);
  } finally { db.close(); }
});

test("codici di sei caratteri: unicità, identità immutabile e non riciclo dopo cancellazione", () => {
  const db = newDatabase();
  try {
    taxon(db);
    for (const bad of ["abc123", "ABCDE", "ABC1234", "AB-123", "ÀBC123"]) {
      assert.throws(() => reserve(db, bad, "x"), /CHECK/);
    }
    reserve(db);
    assert.throws(() => reserve(db, "ABC123", "p2"), /already reserved/);
    assert.throws(() => reserve(db, "ABC124", "p1"), /already reserved/);
    // SQLite REPLACE otherwise deletes the previous reservation behind the
    // BEFORE DELETE trigger unless recursive_triggers happens to be enabled.
    assert.throws(() => db.prepare(`INSERT OR REPLACE INTO specimen_code_reservations
      (code, specimen_id, reserved_at) VALUES ('ABC123', 'p2', ?)`)
      .run(NOW), /already reserved/);
    assert.throws(() => db.prepare(`INSERT OR REPLACE INTO specimen_code_reservations
      (code, specimen_id, reserved_at) VALUES ('ABC124', 'p1', ?)`)
      .run(NOW), /already reserved/);
    assert.throws(() => specimen(db, { id: "p2" }), /FOREIGN KEY/);
    specimen(db);
    db.prepare("DELETE FROM specimens WHERE id='p1'").run();
    assert.equal(db.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n, 1);
    assert.throws(() => db.prepare("DELETE FROM specimen_code_reservations").run(), /permanent/);
    assert.throws(() => db.prepare("UPDATE specimen_code_reservations SET specimen_id='p2'").run(), /immutable/);
    assert.throws(() => reserve(db, "ABC123", "p2"), /already reserved/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("diario append-only blocca perdite accidentali e cancellazione di un esemplare osservato", () => {
  const db = newDatabase();
  try {
    taxon(db);
    reserve(db);
    specimen(db);
    db.prepare(`INSERT INTO journal_entries(id, specimen_id, origin, kind, note, event_on, created_at)
      VALUES ('j1', 'p1', 'manual', 'Osservazione', 'Promemoria', ?, ?)`).run(NOW, NOW);
    assert.throws(() => db.prepare(`INSERT OR REPLACE INTO journal_entries
      (id, specimen_id, origin, kind, note, event_on, created_at)
      VALUES ('j1', 'p1', 'manual', 'Correzione', 'NOTA CAMBIATA', ?, ?)`)
      .run(NOW, NOW), /already recorded/);
    assert.throws(() => db.prepare("UPDATE journal_entries SET note='cambiata' WHERE id='j1'").run(), /append-only/);
    assert.throws(() => db.prepare("DELETE FROM journal_entries WHERE id='j1'").run(), /append-only/);
    assert.throws(() => db.prepare("DELETE FROM specimens WHERE id='p1'").run(), /FOREIGN KEY/);
  } finally { db.close(); }
});

test("un vincolo fallito può annullare l'intera creazione in transazione", () => {
  const db = newDatabase();
  try {
    taxon(db);
    db.exec("BEGIN");
    try {
      reserve(db);
      specimen(db, { cultivarId: "no-such-cultivar" });
      db.exec("COMMIT");
      assert.fail("La transazione avrebbe dovuto fallire");
    } catch (error) {
      assert.match(error.message, /FOREIGN KEY/);
      db.exec("ROLLBACK");
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM specimen_code_reservations").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM specimens").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM taxa").get().n, 1);
  } finally { db.close(); }
});

test("versioni CAS e indici: i conflitti sono riconoscibili, non errori SQL automatici", () => {
  const db = newDatabase();
  try {
    taxon(db);
    const update = db.prepare("UPDATE taxa SET description=?, version=version+1 WHERE id=? AND version=?");
    assert.equal(update.run("Prima modifica", "t1", 1).changes, 1);
    assert.equal(update.run("Seconda modifica obsoleta", "t1", 1).changes, 0);
    assert.equal(db.prepare("SELECT description FROM taxa WHERE id='t1'").get().description, "Prima modifica");
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT specimen_id FROM public_listings
      ORDER BY published_at DESC, specimen_id DESC LIMIT 20`).all();
    assert.ok(plan.some(row => String(row.detail).includes("idx_public_listings_date")));
  } finally { db.close(); }
});
