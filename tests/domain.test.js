import test from "node:test";
import assert from "node:assert/strict";
import { catalogProjection, escapeHtml, normalizeUsername, safeImageUrl, validUsername, validatePlant } from "../src/domain.js";

test("un alias utente viene normalizzato ed è limitato a caratteri sicuri", () => {
  assert.equal(normalizeUsername("  Vivaio.G  "), "vivaio.g");
  assert.equal(validUsername(" vivaio.g "), true);
  assert.equal(validUsername("../Admin"), false);
  assert.equal(validUsername("a"), false);
});

test("i link immagini non accettano javascript o http", () => {
  assert.equal(safeImageUrl("javascript:alert(1)"), "");
  assert.equal(safeImageUrl("http://example.org/test.jpg"), "");
  assert.equal(safeImageUrl("https://example.org/test.jpg"), "https://example.org/test.jpg");
});

test("contenuto utente è escapato per il markup", () => {
  const unsafe = '<script>"&' + String.fromCharCode(39);
  assert.equal(escapeHtml(unsafe), "&lt;script&gt;&quot;&amp;&#39;");
});

test("la pubblicazione esclude le note private", () => {
  const pub = catalogProjection({ name: "Mango", description: "Buono", internalNotes: "Dati interni", imageUrl: "https://example.org/mango.jpg" });
  assert.equal(pub.name, "Mango");
  assert.equal("internalNotes" in pub, false);
  assert.equal("published" in pub, false);
});

test("validazione dei campi fondamentali", () => {
  assert.match(validatePlant({name:""}), /nome/);
  assert.match(validatePlant({name:"Mango",imageUrl:"http://example.org/a.jpg"}), /HTTPS/);
  assert.equal(validatePlant({name:"Mango"}), "");
});
