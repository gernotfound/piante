import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { plantVersion, savePlantRecord, deletePlantRecord, saveJournalEntry, PlantConflictError, PlantJournalRetentionError } from "../../src/plant-store.js";
import { taxonId, lotIdOf, sharedProfileDraft, resolvePlantProfiles } from "../../src/taxonomy.js";

let environment;
let owner;
let guest;
const plant = {
  name: "Avocado",
  scientificName: "Persea americana",
  category: "Tropicali da frutto",
  variety: "Hass",
  description: "Pianta di prova",
  light: "",
  water: "",
  origin: "",
  imageUrl: "",
  availability: "",
  price: "",
  internalNotes: "Informazione riservata",
  published: false
};

const adapter = (db) => ({ db, collection, doc, getDocs, runTransaction, serverTimestamp });
const data = async (db, collectionName, id) => {
  const snapshot = await getDoc(doc(db, collectionName, id));
  return snapshot.exists() ? snapshot.data() : null;
};

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-piante-plant-store",
    firestore: { host: "127.0.0.1", port: 8080,
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
  await environment.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "siteOwner", "primary"), { uid: "owner" });
  });
  owner = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  guest = environment.unauthenticatedContext().firestore();
});

test.after(async () => environment?.cleanup());

test("creazione privata: scrive solo nell'inventario, con timestamp, senza pubblicare note", async () => {
  const id = await savePlantRecord(adapter(owner), { plant });
  const privatePlant = await data(owner, "privatePlants", id);
  assert.equal(privatePlant.name, "Avocado");
  assert.equal(privatePlant.internalNotes, "Informazione riservata");
  assert.ok(privatePlant.createdAt);
  assert.ok(privatePlant.updatedAt);
  assert.equal(await data(guest, "catalog", id), null);
  await assert.rejects(getDoc(doc(guest, "privatePlants", id)), { code: "permission-denied" });
});

test("pubblicazione, modifica e rimozione dalla vetrina sono atomiche", async () => {
  const id = await savePlantRecord(adapter(owner), { plant });
  const version1 = plantVersion(await data(owner, "privatePlants", id));
  await savePlantRecord(adapter(owner), { id, expectedVersion: version1,
    plant: { ...plant, name: "Avocado maturo", published: true } });
  assert.equal((await data(guest, "catalog", id)).name, "Avocado maturo");
  assert.equal((await data(guest, "catalog", id)).internalNotes, undefined);
  const version2 = plantVersion(await data(owner, "privatePlants", id));
  await savePlantRecord(adapter(owner), { id, expectedVersion: version2,
    plant: { ...plant, description: "Ritorna privata", published: false } });
  assert.equal(await data(guest, "catalog", id), null);
  assert.equal((await data(owner, "privatePlants", id)).description, "Ritorna privata");
});

test("clima: aggiornamento atomico, rimozione della soglia e nessuna fuga delle note private", async () => {
  const id = await savePlantRecord(adapter(owner), { plant: {
    ...plant, published: true, plantGroup: "Piante da frutto",
    fruitType: "Tropicali e subtropicali", minColdC: -5,
    coldSource: "https://example.test/studio", coldNotes: "Dato indicativo",
    searchAliases: "aguacate", harvestMonths: [8, 9], pollination: "Variabile"
  } });
  const oldPrivate = await data(owner, "privatePlants", id);
  const oldPublic = await data(guest, "catalog", id);
  assert.equal(oldPublic.minColdC, -5);
  assert.deepEqual(oldPublic.harvestMonths, [8, 9]);
  assert.equal(oldPublic.internalNotes, undefined);
  assert.equal(oldPrivate.internalNotes, plant.internalNotes);

  await savePlantRecord(adapter(owner), { id, expectedVersion: plantVersion(oldPrivate),
    plant: { ...plant, published: true, plantGroup: "Piante da frutto",
      fruitType: "Tropicali e subtropicali", minColdC: null, harvestMonths: [],
      pollination: "", coldSource: "", coldNotes: "" }
  });
  const updatedPrivate = await data(owner, "privatePlants", id);
  const updatedPublic = await data(guest, "catalog", id);
  assert.equal(updatedPrivate.minColdC, null);
  assert.equal(updatedPublic.minColdC, undefined);
  assert.deepEqual(updatedPublic.harvestMonths, []);
  assert.equal(updatedPublic.coldSource, "");
  assert.equal(updatedPublic.internalNotes, undefined);
});

test("due editor: il secondo non sovrascrive né l'inventario né il catalogo", async () => {
  const id = await savePlantRecord(adapter(owner), { plant: { ...plant, published: true } });
  const version = plantVersion(await data(owner, "privatePlants", id));
  await savePlantRecord(adapter(owner), { id, expectedVersion: version,
    plant: { ...plant, name: "Versione A", published: true, internalNotes: "Nuova nota A" } });
  await assert.rejects(savePlantRecord(adapter(owner), { id, expectedVersion: version,
    plant: { ...plant, name: "Versione B", published: false } }), PlantConflictError);
  assert.equal((await data(owner, "privatePlants", id)).internalNotes, "Nuova nota A");
  assert.equal((await data(guest, "catalog", id)).name, "Versione A");
});

test("due salvataggi realmente simultanei non possono vincere entrambi", async () => {
  const id = await savePlantRecord(adapter(owner), { plant: { ...plant, published: true } });
  const expectedVersion = plantVersion(await data(owner, "privatePlants", id));
  const [a, b] = await Promise.allSettled([
    savePlantRecord(adapter(owner), { id, expectedVersion,
      plant: { ...plant, name: "Prima versione", published: true } }),
    savePlantRecord(adapter(owner), { id, expectedVersion,
      plant: { ...plant, name: "Seconda versione", published: true } })
  ]);
  const results = [a, b];
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected" &&
    (r.reason instanceof PlantConflictError || r.reason?.code === "aborted")).length, 1);
  const privatePlant = await data(owner, "privatePlants", id);
  const publicPlant = await data(guest, "catalog", id);
  assert.equal(publicPlant.name, privatePlant.name);
});

test("un editor obsoleto non può cancellare una scheda aggiornata altrove", async () => {
  const id = await savePlantRecord(adapter(owner), { plant: { ...plant, published: true } });
  const oldVersion = plantVersion(await data(owner, "privatePlants", id));
  await savePlantRecord(adapter(owner), { id, expectedVersion: oldVersion,
    plant: { ...plant, name: "Aggiornata", published: true } });
  await assert.rejects(deletePlantRecord(adapter(owner), { id, expectedVersion: oldVersion }), PlantConflictError);
  assert.equal((await data(guest, "catalog", id)).name, "Aggiornata");
  const currentVersion = plantVersion(await data(owner, "privatePlants", id));
  await deletePlantRecord(adapter(owner), { id, expectedVersion: currentVersion });
  assert.equal((await getDocs(collection(owner, "privatePlants", id, "events"))).size, 0);
  assert.equal(await data(owner, "privatePlants", id), null);
  assert.equal(await data(guest, "catalog", id), null);
  await assert.rejects(savePlantRecord(adapter(owner), { id, expectedVersion: currentVersion,
    plant }), PlantConflictError);
});

test("schede legacy senza updatedAt e campi futuri non perdono metadati", async () => {
  const id = "legacy-" + doc(collection(owner, "privatePlants")).id;
  await setDoc(doc(owner, "privatePlants", id), { ...plant, futureField: "Da conservare" });
  const oldVersion = plantVersion(await data(owner, "privatePlants", id));
  await savePlantRecord(adapter(owner), { id, expectedVersion: oldVersion,
    plant: { ...plant, name: "Conservata" } });
  const current = await data(owner, "privatePlants", id);
  assert.equal(current.futureField, "Da conservare");
  assert.ok(current.updatedAt);
  await assert.rejects(savePlantRecord(adapter(owner), { id, expectedVersion: oldVersion,
    plant: { ...plant, name: "Da rifiutare" } }), PlantConflictError);
});

test("il controllo di versione non si affida soltanto ad updatedAt", async () => {
  const id = "external-" + doc(collection(owner, "privatePlants")).id;
  await setDoc(doc(owner, "privatePlants", id), { ...plant });
  const oldVersion = plantVersion(await data(owner, "privatePlants", id));
  await setDoc(doc(owner, "privatePlants", id), { ...plant, internalNotes: "Modifica esterna senza timestamp" });
  await assert.rejects(savePlantRecord(adapter(owner), { id, expectedVersion: oldVersion,
    plant: { ...plant, name: "Non sovrascrivere" } }), PlantConflictError);
  assert.equal((await data(owner, "privatePlants", id)).internalNotes, "Modifica esterna senza timestamp");
});

test("una transazione rifiutata dalle Rules non crea una scheda privata orfana", async () => {
  const privateBefore = (await getDocs(collection(owner, "privatePlants"))).size;
  const publicBefore = (await getDocs(collection(guest, "catalog"))).size;
  // Anche il client fidato può ricevere input invalido; le Rules devono bloccare l'intera transazione.
  await assert.rejects(savePlantRecord(adapter(owner), { plant: { ...plant, name: "", published: true } }),
    { code: "permission-denied" });
  await assert.rejects(savePlantRecord(adapter(guest), { plant: { ...plant, published: true } }),
    { code: "permission-denied" });
  assert.equal((await getDocs(collection(owner, "privatePlants"))).size, privateBefore);
  assert.equal((await getDocs(collection(guest, "catalog"))).size, publicBefore);
});

test("assenza della versione iniziale impedisce modifiche distruttive", async () => {
  const id = await savePlantRecord(adapter(owner), { plant });
  await assert.rejects(savePlantRecord(adapter(owner), { id, plant }), PlantConflictError);
  await assert.rejects(deletePlantRecord(adapter(owner), { id }), PlantConflictError);
  assert.ok(await data(owner, "privatePlants", id));
});

test("esemplari distinti dalla stessa specie conservano provenienza privata, senza perdita di isolamento", async () => {
  const base = { ...plant, name: "Papaya", variety: "", published: true,
    category: "Tropicali da frutto", plantGroup: "Piante da frutto",
    propagationMethod: "Da seme",
    materialSource: "Frutto acquistato", sourceDetails: "Frutto Formosa" };
  const firstId = await savePlantRecord(adapter(owner), { plant: base });
  const secondId = await savePlantRecord(adapter(owner), { plant: base });
  assert.notEqual(firstId, secondId);
  assert.equal((await data(owner, "privatePlants", firstId)).sourceDetails, "Frutto Formosa");
  assert.equal((await data(owner, "privatePlants", secondId)).name, "Papaya");
  assert.equal((await data(owner, "privatePlants", secondId)).specimenLabel, undefined);
  for (const id of [firstId, secondId]) {
    const projected = await data(guest, "catalog", id);
    assert.equal(projected.name, "Papaya");
    assert.equal(projected.specimenLabel, undefined);
    assert.equal(projected.sourceDetails, undefined);
  }
});


test("profili botanici: transazione atomica, cultivar e dati privati separati", async () => {
  const speciesId = taxonId("species", "Avocado condiviso");
  const cultivarId = taxonId("cultivar", "Bacon", speciesId);
  const species = sharedProfileDraft("species", "Avocado condiviso", "", {
    scientificName: "Persea americana", category: "Tropicali da frutto",
    fruitType: "Tropicali e subtropicali", minColdC: null,
    description: "Descrizione condivisa", pollination: "Variabile"
  });
  const cultivar = sharedProfileDraft("cultivar", "Bacon", speciesId, {
    fruitNotes: "Buccia verde", minColdC: -3, pollination: ""
  });
  const specimen = { ...plant, name: "Avocado condiviso", variety: "Bacon",
    speciesId, cultivarId, published: true, sourceDetails: "Privato",
    seedSourceCultivar: "Hass", lifeStage: "Piantina" };
  const id = await savePlantRecord(adapter(owner), { plant: specimen, shared: {
    species: { id: speciesId, expectedVersion: null, data: species },
    cultivar: { id: cultivarId, expectedVersion: null, data: cultivar }
  } });
  const saved = await data(owner, "privatePlants", id);
  const visible = await data(guest, "catalog", id);
  const publicSpecies = await data(guest, "plantProfiles", speciesId);
  assert.equal(saved.sourceDetails, "Privato");
  assert.equal(visible.sourceDetails, undefined);
  assert.equal(visible.seedSourceCultivar, undefined);
  assert.equal(visible.lifeStage, undefined);
  assert.equal(visible.minColdC, -3);
  assert.equal(publicSpecies.internalNotes, undefined);
  assert.equal(publicSpecies.public, true);
  assert.equal(visible.speciesId, speciesId);
  assert.equal(visible.cultivarId, cultivarId);
  const currentSpecies = await data(owner, "plantProfiles", speciesId);
  const updatedSpecies = { ...species, description: "Nuova descrizione per tutti" };
  const nextId = await savePlantRecord(adapter(owner), { plant: {
    ...plant, name: "Avocado condiviso", variety: "", speciesId, published: false
  }, shared: {
    species: { id: speciesId, expectedVersion: plantVersion(currentSpecies), data: updatedSpecies }
  } });
  assert.notEqual(nextId, id);
  const resolved = resolvePlantProfiles({ ...visible, id }, [
    { id: speciesId, ...await data(guest, "plantProfiles", speciesId) },
    { id: cultivarId, ...await data(guest, "plantProfiles", cultivarId) }
  ]);
  assert.equal(resolved.description, "Nuova descrizione per tutti");
  assert.equal(resolved.fruitNotes, "Buccia verde");
  assert.equal(resolved.sourceDetails, undefined);
  await assert.rejects(savePlantRecord(adapter(owner), { plant: {
    ...plant, name: "Avocado condiviso", speciesId, published: true
  }, shared: {
    species: { id: speciesId, expectedVersion: plantVersion(currentSpecies), data: species }
  } }), PlantConflictError);
  await assert.rejects(getDoc(doc(guest, "privatePlants", id)),
    { code: "permission-denied" });
});

test("lotti e diario sono privati e non contaminano i campi del catalogo", async () => {
  const name = "Papaya lotto integration";
  const speciesId = taxonId("species", name);
  const lotId = lotIdOf(speciesId, "Lotto test integration");
  const base = { ...plant, name, speciesId, lotId, lotName: "Lotto test integration",
    published: true, variety: "", sourceDetails: "Frutto Formosa", seedSourceCultivar: "Formosa",
    lifeStage: "Seme" };
  const id = await savePlantRecord(adapter(owner), {
    plant: base, shared: {
      species: { id: speciesId, expectedVersion: null,
        data: sharedProfileDraft("species", name, "", base) },
      lot: { id: lotId, data: { name: base.lotName, speciesId, sourceDetails: base.sourceDetails,
        seedSourceCultivar: base.seedSourceCultivar, sownOn: "2026-11-01" } }
    }
  });
  assert.equal((await data(owner, "seedLots", lotId)).sourceDetails, "Frutto Formosa");
  assert.equal((await data(guest, "catalog", id)).lotId, undefined);
  await assert.rejects(saveJournalEntry(adapter(owner), { plantId: id,
    kind: "Rinvaso", note: "Errore", eventDate: "2026-99-99" }), /data valida/i);
  await saveJournalEntry(adapter(owner), { plantId: id, kind: "Rinvaso",
    note: "Substrato drenante", eventDate: "2026-11-12" });
  const entries = await getDocs(collection(owner, "privatePlants", id, "events"));
  assert.ok(entries.docs.some(d => d.data().note === "Substrato drenante"));
  await assert.rejects(getDocs(collection(guest, "privatePlants", id, "events")),
    { code: "permission-denied" });
  await assert.rejects(getDoc(doc(guest, "seedLots", lotId)), { code: "permission-denied" });
});


test("eliminazione bloccata se il diario contiene osservazioni: nessun dato perso", async () => {
  const id = await savePlantRecord(adapter(owner), { plant: { ...plant, published: true } });
  await saveJournalEntry(adapter(owner), {
    plantId: id, kind: "Osservazione", note: "Frutto campione da conservare",
    eventDate: "2026-11-12"
  });
  const current = await data(owner, "privatePlants", id);
  assert.ok(current.lastJournalActivityAt, "L'attività aggiorna il documento padre");
  await assert.rejects(deletePlantRecord(adapter(owner), {
    id, expectedVersion: plantVersion(current)
  }), PlantJournalRetentionError);
  assert.ok(await data(owner, "privatePlants", id));
  assert.ok(await data(guest, "catalog", id));
  const events = await getDocs(collection(owner, "privatePlants", id, "events"));
  assert.ok(events.docs.some(event => event.data().note.includes("Frutto campione")));
  await assert.rejects(deletePlantRecord(adapter(owner), {
    id, expectedVersion: plantVersion({ ...current, lastJournalActivityAt: null })
  }), PlantJournalRetentionError);
});


test("specie associata soltanto a esemplare privato non è enumerabile dal pubblico", async () => {
  const name = "Specie riservata di test";
  const speciesId = taxonId("species", name);
  const individual = { ...plant, name, speciesId, published: false, variety: "" };
  const species = sharedProfileDraft("species", name, "", individual);
  const id = await savePlantRecord(adapter(owner), { plant: individual, shared: {
    species: { id: speciesId, data: species, expectedVersion: null }
  } });
  const privateProfile = await data(owner, "plantProfiles", speciesId);
  assert.equal(privateProfile.public, false);
  await assert.rejects(getDoc(doc(guest, "plantProfiles", speciesId)),
    { code: "permission-denied" });
  const existing = await data(owner, "privatePlants", id);
  await savePlantRecord(adapter(owner), {
    id, expectedVersion: plantVersion(existing),
    plant: { ...individual, published: true }, shared: {
      species: {
        id: speciesId, data: species,
        expectedVersion: plantVersion(privateProfile)
      }
    }
  });
  assert.equal((await data(guest, "plantProfiles", speciesId)).public, true);
  const nextPrivate = await data(owner, "privatePlants", id);
  const publishedProfile = await data(owner, "plantProfiles", speciesId);
  await savePlantRecord(adapter(owner), {
    id, expectedVersion: plantVersion(nextPrivate),
    plant: { ...individual, published: false }, shared: {
      species: {
        id: speciesId, data: species,
        expectedVersion: plantVersion(publishedProfile)
      }
    }
  });
  assert.equal((await data(guest, "plantProfiles", speciesId)).public, true);
  assert.equal(await data(guest, "catalog", id), null);
});
