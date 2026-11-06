import test from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from "@firebase/rules-unit-testing";
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc, writeBatch } from "firebase/firestore";

let environment;
const published = {
  name: "Mango",
  scientificName: "Mangifera indica",
  category: "Tropicali da frutto",
  variety: "",
  description: "Esemplare pubblicato",
  origin: "",
  light: "",
  water: "",
  imageUrl: "",
  availability: "",
  price: ""
};

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-piante",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "siteOwner", "primary"), { uid: "owner" });
    await setDoc(doc(context.firestore(), "catalog", "mango"), published);
    await setDoc(doc(context.firestore(), "privatePlants", "mango"), {
      ...published, internalNotes: "Queste note non devono uscire"
    });
  });
});

test.after(async () => {
  await environment?.cleanup();
});

test("ospite: legge il catalogo ma non l'inventario né il documento proprietario", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "catalog", "mango")));
  await assertSucceeds(getDocs(collection(db, "catalog")));
  await assertFails(getDoc(doc(db, "privatePlants", "mango")));
  await assertFails(getDocs(collection(db, "privatePlants")));
  await assertFails(getDoc(doc(db, "siteOwner", "primary")));
  await assertFails(setDoc(doc(db, "catalog", "nuova"), published));
});

test("account autenticato non proprietario: non accede ai dati privati", async () => {
  const db = environment.authenticatedContext("estraneo", { email: "other@example.test" }).firestore();
  await assertFails(getDoc(doc(db, "privatePlants", "mango")));
  await assertFails(setDoc(doc(db, "privatePlants", "nuova"), { name: "Altro" }));
  await assertFails(deleteDoc(doc(db, "catalog", "mango")));
  await assertFails(setDoc(doc(db, "loginAliases", "admin"), { email: "other@example.test" }));
});

test("proprietario: legge inventario e pubblica in batch", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  await assertSucceeds(getDoc(doc(db, "siteOwner", "primary")));
  await assertSucceeds(getDoc(doc(db, "privatePlants", "mango")));
  const batch = writeBatch(db);
  batch.set(doc(db, "privatePlants", "limone"), { ...published, internalNotes: "Privato" });
  batch.set(doc(db, "catalog", "limone"), { ...published, name: "Limone" });
  await assertSucceeds(batch.commit());
  await assertSucceeds(deleteDoc(doc(db, "catalog", "limone")));
});

test("il documento del proprietario è immutabile anche per l'account admin", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  await assertFails(setDoc(doc(db, "siteOwner", "primary"), { uid: "estraneo" }));
});

test("catalogo: non ammette l'esposizione delle note interne", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  await assertFails(setDoc(doc(db, "catalog", "errore"), { ...published, internalNotes: "Segreto" }));
  await assertFails(setDoc(doc(db, "catalog", "senza-nome"), { ...published, name: "" }));
});

test("metadati climatici pubblici: allowlist e tipi validati, nessun campo privato", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  const guest = environment.unauthenticatedContext().firestore();
  const docRef = doc(db, "catalog", "clima");
  const valid = {
    ...published, plantGroup: "Piante da frutto", fruitType: "Tropicali e subtropicali",
    growthHabit: "Albero", searchAliases: "avocado, aguacate",
    minColdC: -3, coldSource: "https://example.test/source", coldNotes: "Solo piante adulte",
    pollination: "Autofertile", potSuitability: "Con accorgimenti",
    harvestMonths: [7, 8, 9]
  };
  await assertSucceeds(setDoc(docRef, valid));
  await assertSucceeds(getDoc(doc(guest, "catalog", "clima")));
  await assertFails(setDoc(docRef, { ...valid, internalNotes: "Privato" }));
  await assertFails(setDoc(docRef, { ...valid, minColdC: "-3" }));
  await assertFails(setDoc(docRef, { ...valid, minColdC: -55 }));
  await assertFails(setDoc(docRef, { ...valid, minColdC: null }));
  await assertFails(setDoc(docRef, { ...valid, coldSource: "http://example.test" }));
  await assertFails(setDoc(docRef, { ...valid, coldNotes: "x".repeat(251) }));
  await assertFails(setDoc(docRef, { ...valid, plantGroup: "Privato" }));
  await assertFails(setDoc(docRef, { ...valid, pollination: "Certamente autofertile" }));
  await assertFails(setDoc(docRef, { ...valid, potSuitability: "Indefinita" }));
  await assertFails(setDoc(docRef, { ...valid, harvestMonths: [0] }));
  await assertFails(setDoc(docRef, { ...valid, harvestMonths: [1, "2"] }));
  await assertFails(setDoc(docRef, { ...valid, harvestMonths: "Luglio" }));
  await assertSucceeds(setDoc(docRef, { ...valid, harvestMonths: [] }));
  await assertSucceeds(setDoc(docRef, { ...published, plantGroup: "Piante da frutto" }));
});

test("catalogo: controlli di tipo e lunghezza per i campi pubblici esistenti", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  const ref = doc(db, "catalog", "schema");
  await assertSucceeds(setDoc(ref, { ...published, imageUrl: "https://example.test/fruit.jpg" }));
  await assertSucceeds(setDoc(ref, { name: "Scheda precedente", description: "" }));
  await assertFails(setDoc(ref, { ...published, scientificName: 123 }));
  await assertFails(setDoc(ref, { ...published, category: { value: "Agrumi" } }));
  await assertFails(setDoc(ref, { ...published, variety: null }));
  await assertFails(setDoc(ref, { ...published, origin: true }));
  await assertFails(setDoc(ref, { ...published, light: ["sole"] }));
  await assertFails(setDoc(ref, { ...published, water: 3 }));
  await assertFails(setDoc(ref, { ...published, availability: ["disponibile"] }));
  await assertFails(setDoc(ref, { ...published, price: 15 }));
  await assertFails(setDoc(ref, { ...published, price: "x".repeat(51) }));
  await assertFails(setDoc(ref, { ...published, scientificName: "x".repeat(151) }));
  await assertFails(setDoc(ref, { ...published, category: "x".repeat(101) }));
  await assertFails(setDoc(ref, { ...published, imageUrl: "http://example.test/fruit.jpg" }));
  await assertFails(setDoc(ref, { ...published, imageUrl: "javascript:alert(1)" }));
  await assertFails(setDoc(ref, { ...published, imageUrl: 2 }));
  await assertFails(setDoc(ref, { ...published, imageUrl: "https://example.test/" + "a".repeat(4090) }));
  await assertSucceeds(setDoc(ref, { ...published, category: "Nuova categoria", origin: "Italia" }));
});

test("catalogo: i mesi devono essere distinti e i campi facoltativi restano retrocompatibili", async () => {
  const db = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  const ref = doc(db, "catalog", "raccolta");
  await assertSucceeds(setDoc(ref, { ...published, harvestMonths: [1, 12] }));
  await assertSucceeds(setDoc(ref, { ...published, harvestMonths: [] }));
  await assertSucceeds(setDoc(ref, { ...published, coldSource: "" }));
  await assertFails(setDoc(ref, { ...published, harvestMonths: [8, 8] }));
  await assertFails(setDoc(ref, { ...published, searchAliases: 18 }));
  await assertFails(setDoc(ref, { ...published, coldNotes: null }));
  await assertFails(setDoc(ref, { ...published, coldSource: 18 }));
  await assertFails(setDoc(ref, { ...published, coldSource: "https://example.test/" + "a".repeat(510) }));
});

test("alias: singolo lookup pubblico, elenco negato, scrittura solo dal proprietario", async () => {
  const owner = environment.authenticatedContext("owner", { email: "owner@example.test" }).firestore();
  const guest = environment.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(owner, "loginAliases", "vivaio"), { email: "owner@example.test" }));
  await assertSucceeds(getDoc(doc(guest, "loginAliases", "vivaio")));
  await assertFails(getDocs(collection(guest, "loginAliases")));
  await assertFails(setDoc(doc(guest, "loginAliases", "x"), { email: "guest@example.test" }));
  await assertFails(setDoc(doc(owner, "loginAliases", "altro"), { email: "other@example.test" }));
});
