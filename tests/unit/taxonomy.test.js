import test from "node:test";
import assert from "node:assert/strict";
import { taxonId, profileByName, sharedProfileDraft, resolvePlantProfiles,
  preparePlantDuplicate, changedPlantFields, lotIdOf } from "../../src/taxonomy.js";

test("specie e cultivar hanno identità deterministicamente univoche", () => {
  const avocado = taxonId("species", "Avocado");
  assert.equal(avocado, taxonId("species", " AVOCADO "));
  assert.notEqual(avocado, taxonId("species", "Papaya"));
  assert.notEqual(taxonId("cultivar", "Hass", avocado), taxonId("cultivar", "Bacon", avocado));
  assert.equal(taxonId("cultivar", "Hass", ""), "");
});

test("i profili condivisi si applicano a ogni esemplare; cultivar verificata non dedotta dal seme", () => {
  const sid = taxonId("species", "Avocado");
  const cid = taxonId("cultivar", "Hass", sid);
  const species = { id: sid, kind: "species", name: "Avocado",
    scientificName: "Persea americana", category: "Tropicali da frutto",
    pollination: "Variabile", minColdC: null, harvestMonths: [] };
  const cultivar = { id: cid, kind: "cultivar", parentId: sid, name: "Hass",
    fruitNotes: "Buccia scura", minColdC: null, pollination: "" };
  const seedling = { id: "one", name: "Avocado", sourceDetails: "Seme da frutto Hass",
    seedSourceCultivar: "Hass", lifeStage: "Piantina", published: false };
  const withoutCultivar = resolvePlantProfiles(seedling, [species, cultivar]);
  assert.equal(withoutCultivar.scientificName, "Persea americana");
  assert.equal(withoutCultivar.variety, undefined);
  assert.equal(withoutCultivar.sourceDetails, "Seme da frutto Hass");
  const grafted = resolvePlantProfiles({ ...seedling, cultivarId: cid }, [species, cultivar]);
  assert.equal(grafted.variety, "Hass");
  assert.equal(grafted.fruitNotes, "Buccia scura");
  const changed = resolvePlantProfiles(seedling, [{ ...species, scientificName: "Nome aggiornato" }]);
  assert.equal(changed.scientificName, "Nome aggiornato");
  assert.equal(profileByName([species], "species", "AVOCADO").id, sid);
});

test("la duplicazione non conserva attributi personali o pubblicazione", () => {
  const clone = preparePlantDuplicate({ id: "x", __snapshotVersion: "v",
    name: "Avocado", speciesId: "s_a", cultivarId: "c_a", published: true,
    sourceDetails: "Frutto A", sownOn: "2026-01-01", internalNotes: "Riservato",
    imageUrl: "https://example.test/private.jpg", lifeStage: "Morta" });
  assert.equal(clone.speciesId, "s_a");
  assert.equal(clone.cultivarId, "c_a");
  assert.equal(clone.published, false);
  assert.equal(clone.sourceDetails, "");
  assert.equal(clone.internalNotes, "");
  assert.equal(clone.id, undefined);
  assert.equal(clone.lifeStage, "");
  assert.equal(clone.propagationMethod, "");
  assert.equal(clone.materialSource, "");
  assert.equal(clone.variety, "");
  assert.equal(preparePlantDuplicate({ variety: "Hass", cultivarId: "" }).variety, "");
  assert.equal(preparePlantDuplicate({ variety: "Hass", cultivarId: "c_verified" }).variety, "Hass");
});

test("diff storico contiene solo nomi di campi, senza valori sensibili", () => {
  assert.deepEqual(changedPlantFields({ lifeStage: "Seme", internalNotes: "Segreto" },
    { lifeStage: "Piantina", internalNotes: "Altro" }), ["lifeStage", "internalNotes"]);
  const p = sharedProfileDraft("species", "Avocado", "", {
    scientificName: "Persea americana", minColdC: -2, harvestMonths: [8]
  });
  assert.equal(p.minColdC, -2);
  assert.deepEqual(p.harvestMonths, [8]);
  assert.equal(p.internalNotes, undefined);
});


test("il gruppo esplicito legacy non cambia solo perché la specie viene collegata", () => {
  const species = { id: taxonId("species", "Fico d'India"), kind: "species",
    name: "Fico d'India", category: "Succulente" };
  const legacy = { id: "x", name: "Fico d'India",
    category: "Succulente", plantGroup: "Piante da frutto" };
  assert.equal(resolvePlantProfiles(legacy, [species]).plantGroup, "Piante da frutto");
  assert.equal(resolvePlantProfiles({ ...legacy, category: "Ornamentali" }, [species]).plantGroup,
    "Altre piante");
});

test("l'identità cultivar verificata è distinta dall'indicazione sul seme", () => {
  const speciesId = taxonId("species", "Avocado");
  const seedling = { name: "Avocado", speciesId, seedSourceCultivar: "Hass", variety: "" };
  const species = sharedProfileDraft("species", "Avocado", "", { scientificName: "Persea americana" });
  assert.equal(resolvePlantProfiles(seedling, [{ ...species, id: speciesId }]).variety, "");
  assert.equal(resolvePlantProfiles(seedling, [{ ...species, id: speciesId }]).seedSourceCultivar, "Hass");
});

test("lotto omonimo di specie diverse non collide", () => {
  const papaya = taxonId("species", "Papaya");
  const avocado = taxonId("species", "Avocado");
  assert.notEqual(lotIdOf(papaya, "Semina 2026"), lotIdOf(avocado, "Semina 2026"));
  assert.equal(lotIdOf(avocado, " semina 2026 "), lotIdOf(avocado, "Semina 2026"));
  assert.equal(lotIdOf("", "Semina 2026"), "");
});
