import test from "node:test";
import assert from "node:assert/strict";
import { catalogProjection, escapeHtml, groupForCategory, groupForEditedPlant, decodeRouteId, normalizeUsername, plantPresets, safeImageUrl, specimenCodeOf, validUsername, validatePlant } from "../../src/domain.js";

test("un alias utente viene normalizzato ed è limitato a caratteri sicuri", () => {
  assert.equal(normalizeUsername("  Vivaio.G  "), "vivaio.g");
  assert.equal(validUsername(" vivaio.g "), true);
  assert.equal(validUsername("../../Admin"), false);
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

test("categoria univoca in editor e specie precompilate senza varietà dedotta da seme", () => {
  assert.equal(groupForCategory("Tropicali da frutto"), "Piante da frutto");
  assert.equal(groupForCategory("Agrumi"), "Piante da frutto");
  assert.equal(groupForCategory("Orto e tuberi"), "Orto e tuberi");
  assert.equal(groupForCategory("Succulente"), "Altre piante");
  const legacy = { category: "Succulente", plantGroup: "Piante da frutto" };
  assert.equal(groupForEditedPlant("Succulente", legacy), "Piante da frutto");
  assert.equal(groupForEditedPlant("Ornamentali", legacy), "Altre piante");
  assert.equal(groupForEditedPlant("Succulente", { ...legacy, plantGroup: "ignoto" }), "Altre piante");
  assert.equal(decodeRouteId("esemplare%20uno"), "esemplare uno");
  assert.equal(decodeRouteId("%"), "");
  assert.equal(decodeRouteId("%E0%A4%A"), "");
  const papaya = plantPresets.find((preset) => preset.key === "papaya");
  const avocado = plantPresets.find((preset) => preset.key === "avocado");
  assert.equal(papaya.scientificName, "Carica papaya");
  assert.equal(avocado.scientificName, "Persea americana");
  assert.equal("variety" in papaya, false);
  assert.equal("variety" in avocado, false);
});

test("esemplari omonimi mantengono codici diversi e informazioni private escluse dal catalogo", () => {
  const plant = { id: "1234567890abcdefghij", name: "Papaya", category: "Tropicali da frutto",
    propagationMethod: "Da seme",
    materialSource: "Frutto acquistato", sourceDetails: "Frutto etichettato Formosa",
    sownOn: "2026-06-01", plantLocation: "Balcone", specimenSex: "" };
  assert.equal(validatePlant(plant), "");
  assert.equal(specimenCodeOf(plant), "#1234567890abcdefghij");
  assert.notEqual(specimenCodeOf(plant), specimenCodeOf({ ...plant, id: "1234567890abcdefghik" }));
  assert.equal(specimenCodeOf({ ...plant, name: "Papaya rinominata" }), specimenCodeOf(plant));
  assert.match(specimenCodeOf({ id: "legacy-1" }), /^#[a-zA-Z0-9]+$/);
  assert.notEqual(specimenCodeOf({ id: "legacy-1" }), specimenCodeOf({ id: "legacy-2" }));
  assert.equal(specimenCodeOf({}), "");
  const publicPlant = catalogProjection(plant);
  for (const field of ["specimenLabel", "propagationMethod", "materialSource",
    "sourceDetails", "sownOn", "plantLocation", "specimenSex"]) {
    assert.equal(field in publicPlant, false, field + " non deve uscire nel catalogo");
  }
  assert.match(validatePlant({ ...plant, sownOn: "2026-02-30" }), /Data di semina/);
  assert.match(validatePlant({ ...plant, propagationMethod: "Metodologia inesistente" }), /propagazione/);
});
