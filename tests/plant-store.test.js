import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { plantVersion, savePlantRecord, deletePlantRecord, PlantConflictError } from "../src/plant-store.js";

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

const adapter = (db) => ({ db, collection, doc, runTransaction, serverTimestamp });
const data = async (db, collectionName, id) => {
  const snapshot = await getDoc(doc(db, collectionName, id));
  return snapshot.exists() ? snapshot.data() : null;
};

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-piante-plant-store",
    firestore: { host: "127.0.0.1", port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") }
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
