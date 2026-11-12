import test from "node:test";
import assert from "node:assert/strict";
import { catalogProjection, escapeHtml, groupForCategory, groupForEditedPlant, decodeRouteId, normalizeUsername, plantPresets, safeImageUrl, specimenCodeOf, varietyLabel, validUsername, validatePlant } from "../../src/domain.js";

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
  assert.equal(groupForEditedPlant(undefined, null), "Altre piante");
  assert.equal(groupForEditedPlant("Tropicali da frutto", null), "Piante da frutto");
  assert.equal(groupForEditedPlant("Ornamentali", legacy), "Altre piante");
  assert.equal(groupForEditedPlant("Succulente", { ...legacy, plantGroup: "ignoto" }), "Altre piante");
  assert.equal(decodeRouteId("esemplare%20uno"), "esemplare uno");
  assert.equal(decodeRouteId("%"), null);
  assert.equal(decodeRouteId("%E0%A4%A"), null);
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
  assert.match(specimenCodeOf(plant), /^#[A-Z0-9]{6}$/);
  assert.notEqual(specimenCodeOf(plant), specimenCodeOf({ ...plant, id: "1234567890abcdefghik" }));
  assert.equal(specimenCodeOf({ ...plant, name: "Papaya rinominata" }), specimenCodeOf(plant));
  assert.match(specimenCodeOf({ id: "legacy-1" }), /^#[A-Z0-9]{6}$/);
  assert.notEqual(specimenCodeOf({ id: "legacy-1" }), specimenCodeOf({ id: "legacy-2" }));
  assert.equal(specimenCodeOf({}), "");
  assert.equal(specimenCodeOf({ id: "àvocado-legacy" }), specimenCodeOf({ id: "àvocado-legacy" }),
    "Anche gli ID legacy non ASCII devono conservare il codice");
  assert.match(specimenCodeOf({ id: "àvocado-legacy" }), /^#[A-Z0-9]{6}$/);
  assert.equal(specimenCodeOf({ id: "1234567890abcdefghij", name: "Papaya" }), specimenCodeOf(plant),
    "Il nome, il profilo e la visibilità non devono modificare il codice");
  const publicPlant = catalogProjection(plant);
  for (const field of ["specimenLabel", "propagationMethod", "materialSource",
    "sourceDetails", "sownOn", "plantLocation", "specimenSex"]) {
    assert.equal(field in publicPlant, false, field + " non deve uscire nel catalogo");
  }
  assert.match(validatePlant({ ...plant, sownOn: "2026-02-30" }), /Data di semina/);
  assert.match(validatePlant({ ...plant, propagationMethod: "Metodologia inesistente" }), /propagazione/);
});

test("La cultivar verificata e le indicazioni varietali storiche restano distinguibili", () => {
  assert.equal(varietyLabel({ name: "Avocado", variety: "Fuerte", cultivarId: "c_verificata" }),
    "Cultivar: Fuerte");
  assert.equal(varietyLabel({ name: "Papaya", variety: "Formosa" }),
    "Indicazione varietale (da verificare): Formosa");
  assert.equal(varietyLabel({ name: "Avocado", seedSourceCultivar: "Hass" }), "");
  assert.equal(varietyLabel({ name: "Avocado", variety: " " }), "");
  const publicData = catalogProjection({
    name: "Avocado", variety: "Fuerte", cultivarId: "c_verificata",
    seedSourceCultivar: "Hass", internalNotes: "Riservato"
  });
  assert.equal(publicData.variety, "Fuerte");
  assert.equal(publicData.cultivarId, "c_verificata");
  assert.equal("seedSourceCultivar" in publicData, false);
  assert.equal("internalNotes" in publicData, false);
});
