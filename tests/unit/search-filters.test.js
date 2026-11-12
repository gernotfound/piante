import test from "node:test";
import assert from "node:assert/strict";
import { filterCatalog, filterInventory, normalizePlantQuery } from "../../src/catalog.js";
import { catalogProjection, coldMinimumOf, fruitTypeOf, plantGroupOf, normalizedHarvestMonths, specimenCodeOf, validatePlant } from "../../src/domain.js";

const items = [
  { id: "a", name: "Avocado", scientificName: "Persea americana", category: "Tropicali da frutto", variety: "da seme", minColdC: -2, pollination: "Variabile", potSuitability: "Con accorgimenti", harvestMonths: [10, 11], published: true },
  { id: "b", name: "Fico d’India", scientificName: "Opuntia ficus-indica", category: "Succulente", plantGroup: "Piante da frutto", fruitType: "Mediterranee", growthHabit: "Succulenta", minColdC: -5, pollination: "Autofertile", potSuitability: "Non consigliata", harvestMonths: [8, 9], published: true },
  { id: "c", name: "Granadilla", scientificName: "Passiflora ligularis", category: "Tropicali da frutto", growthHabit: "Rampicante", published: false },
  { id: "d", name: "Batata", scientificName: "Ipomoea batatas", category: "Orto e tuberi", potSuitability: "Adatta", published: true },
  { id: "e", name: "Aloe", scientificName: "Aloe vera", category: "Succulente", published: true },
  { id: "f", name: "Passiflora", scientificName: "Passiflora edulis", category: "Tropicali da frutto", searchAliases: "Maracujà, Passion fruit", minColdC: 0, pollination: "Autofertile", harvestMonths: [7], published: true }
];

test("Ricerca: accenti, apostrofi, trattini e refusi senza API esterne", () => {
  assert.equal(normalizePlantQuery("  FICÒ d’IndiA "), "fico d india");
  assert.deepEqual(filterCatalog(items, { query: "avocdo" }).map(x => x.id), ["a"]);
  assert.deepEqual(filterCatalog(items, { query: "opuntia" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterCatalog(items, { query: "patata dolce" }).map(x => x.id), ["d"]);
  assert.deepEqual(filterCatalog(items, { query: "maracuja" }).map(x => x.id), ["f"]);
  assert.deepEqual(filterInventory(items, { query: "GRANADILLA", visibility: "Private" }).map(x => x.id), ["c"]);
});

test("Le equivalenze non confondono la granadilla dolce con la passiflora edulis", () => {
  assert.deepEqual(filterCatalog(items, { query: "granadilla dolce" }).map(x => x.id), ["c"]);
  assert.deepEqual(filterCatalog(items, { query: "passiflora edulis" }).map(x => x.id), ["f"]);
});

test("Fruttifere prima nel catalogo; gruppi non coincidono con la forma di crescita", () => {
  assert.equal(plantGroupOf(items[0]), "Piante da frutto");
  assert.equal(fruitTypeOf(items[0]), "Tropicali e subtropicali");
  assert.equal(plantGroupOf(items[1]), "Piante da frutto");
  assert.equal(items[1].growthHabit, "Succulenta");
  assert.equal(plantGroupOf(items[3]), "Orto e tuberi");
  assert.deepEqual(filterCatalog(items, { group: "Orto e tuberi" }).map(x => x.id), ["d"]);
  assert.deepEqual(filterCatalog(items, { fruitType: "Mediterranee" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterInventory(items, { group: "Piante da frutto", visibility: "Private" }).map(x => x.id), ["c"]);
  const unfiltered = filterCatalog(items);
  const firstOther = unfiltered.findIndex(x => plantGroupOf(x) !== "Piante da frutto");
  assert.ok(unfiltered.slice(0, firstOther).every(x => plantGroupOf(x) === "Piante da frutto"));
});

test("Clima: filtro inclusivo sul limite, ignora le soglie assenti e preserva 0 °C", () => {
  assert.equal(coldMinimumOf({ minColdC: 0 }), 0);
  assert.equal(coldMinimumOf({ minColdC: "" }), null);
  assert.equal(coldMinimumOf({ minColdC: "-3" }), null);
  assert.deepEqual(filterCatalog(items, { minTempC: "-5" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterCatalog(items, { minTempC: "0" }).map(x => x.id), ["a", "b", "f"]);
  assert.deepEqual(filterCatalog(items, { minTempC: "5" }).map(x => x.id), ["a", "b", "f"]);
  assert.deepEqual(filterCatalog(items, { minTempC: "nonsense" }), []);
});

test("Autofertilità, vaso e mesi di raccolta si combinano; ignoti non danno falsi positivi", () => {
  assert.deepEqual(filterCatalog(items, { pollination: "Autofertile" }).map(x => x.id), ["b", "f"]);
  assert.deepEqual(filterCatalog(items, { potSuitability: "Adatta" }).map(x => x.id), ["d"]);
  assert.deepEqual(filterCatalog(items, { harvestMonth: "9" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterCatalog(items, { harvestMonth: "9", minTempC: "-5" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterCatalog(items, { harvestMonth: "1" }).map(x => x.id), []);
  assert.deepEqual(filterCatalog(items, { harvestMonth: "13" }), []);
  assert.deepEqual(filterCatalog(items, { pollination: "Richiede impollinazione" }), []);
  assert.deepEqual(normalizedHarvestMonths([9, 8, 9]), [8, 9]);
  assert.deepEqual(normalizedHarvestMonths(["9"]), []);
});

test("Proiezione pubblica: solo i metadati ammessi; vecchie schede ancora leggibili", () => {
  const projected = catalogProjection({ ...items[1], internalNotes: "Privato", minColdC: -5, coldNotes: "Solo esemplari adulti." });
  assert.equal(projected.minColdC, -5);
  assert.equal(projected.fruitType, "Mediterranee");
  assert.equal(projected.pollination, "Autofertile");
  assert.equal(projected.potSuitability, "Non consigliata");
  assert.deepEqual(projected.harvestMonths, [8, 9]);
  assert.equal("internalNotes" in projected, false);
  assert.equal("published" in projected, false);
  const old = catalogProjection({ name: "Pianta senza dati", category: "Altre" });
  assert.equal("minColdC" in old, false);
  assert.equal(old.plantGroup, "Altre piante");
  assert.deepEqual(old.harvestMonths, []);
  assert.equal(old.pollination, "");
  assert.equal(old.potSuitability, "");
  assert.equal(validatePlant({ name: "Avocado", minColdC: Number.NaN }), "La temperatura minima deve essere un numero tra -40 e +25 °C.");
  assert.match(validatePlant({ name: "Avocado", minColdC: -60 }), /temperatura minima/);
  assert.match(validatePlant({ name: "Avocado", coldSource: "javascript:alert(1)" }), /HTTPS/);
  assert.match(validatePlant({ name: "Avocado", harvestMonths: [0] }), /mesi validi/);
  assert.match(validatePlant({ name: "Avocado", harvestMonths: [1, "2"] }), /mesi validi/);
  assert.match(validatePlant({ name: "Avocado", pollination: "Certamente" }), /impollinazione/);
  assert.match(validatePlant({ name: "Avocado", potSuitability: "Non so" }), /vaso/);
});


test("il codice breve è ricercabile nel catalogo, mentre i dettagli privati restano nell'inventario", () => {
  const plant = { id: "1234567890abcdefghij", name: "Papaya",
    category: "Tropicali da frutto", sourceDetails: "Frutto etichettato Formosa", published: true };
  const shortCode = specimenCodeOf(plant);
  assert.deepEqual(filterInventory([plant], { query: shortCode }).map(item => item.id), [plant.id]);
  assert.deepEqual(filterCatalog([plant], { query: shortCode }).map(item => item.id), [plant.id]);
  assert.deepEqual(filterInventory([plant], { query: "#1234567890abcdefghij" }).map(item => item.id),
    [plant.id], "Il vecchio ID documentale resta ricercabile dal proprietario");
  assert.deepEqual(filterCatalog([plant], { query: "#1234567890abcdefghij" }), [],
    "La ricerca pubblica indicizza solo il codice breve");
  assert.deepEqual(filterInventory([plant], { query: "Formosa" }).map(item => item.id), [plant.id]);
  assert.deepEqual(filterCatalog([plant], { query: "Formosa" }), []);
});
