import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp,
  setDoc, deleteDoc } from "firebase/firestore";
import { savePlantRecord, deletePlantRecord, plantVersion } from "../../src/plant-store.js";
import { randomSpecimenCode, SpecimenCodeError } from "../../src/specimen-codes.js";

let environment, owner, guest;
const adapter = db => ({ db, doc, collection, getDoc, getDocs, runTransaction, serverTimestamp });
const plant = { name: "Avocado", category: "Tropicali da frutto", description: "",
  internalNotes: "Da conservare", published: true };
const read = (db, path, id) => getDoc(doc(db, path, id));
const next = codes => () => codes.shift() || "JKL444";

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-piante-unique-codes",
    firestore: { host: "127.0.0.1", port: 8080,
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") }
  });
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "siteOwner", "primary"), { uid: "owner" });
  });
  owner = environment.authenticatedContext("owner").firestore();
  guest = environment.unauthenticatedContext().firestore();
});
test.after(async () => environment?.cleanup());

test("ogni creazione assegna automaticamente un codice riservato senza marker di attivazione", async () => {
  assert.match(randomSpecimenCode(), /^[A-Z0-9]{6}$/);
  assert.equal((await read(owner, "specimenRegistry", "activation")).exists(), false);
  const id = await savePlantRecord(adapter(owner), {
    plant, generateCode: () => "ABC123"
  });
  const saved = (await read(owner, "privatePlants", id)).data();
  assert.equal(saved.specimenCode, "ABC123");
  assert.equal(saved.internalNotes, "Da conservare");
  assert.equal((await read(owner, "specimenCodes", "ABC123")).data().plantId, id);
  assert.equal((await read(guest, "catalog", id)).data().specimenCode, "ABC123");
  assert.equal((await read(guest, "catalog", id)).data().internalNotes, undefined);
  await assertFails(setDoc(doc(owner, "privatePlants", "without-code"), plant));
  await assertFails(setDoc(doc(owner, "privatePlants", "unreserved"), {
    ...plant, specimenCode: "ZZZ999"
  }));
  await assertFails(setDoc(doc(owner, "specimenRegistry", "activation"), { status: "ready" }));
  await assertFails(getDoc(doc(guest, "specimenCodes", "ABC123")));
  await assertFails(getDocs(collection(guest, "specimenCodes")));
  await assertFails(deleteDoc(doc(owner, "specimenCodes", "ABC123")));
  await assertFails(setDoc(doc(owner, "specimenCodes", "ABC123"), { plantId: "other" }));
  await assertFails(setDoc(doc(owner, "privatePlants", id),
    { ...saved, specimenCode: "ZZZ999" }));
  await assertFails(setDoc(doc(owner, "catalog", id),
    { name: "Avocado", description: "", specimenCode: "ZZZ999" }));
});

test("una scheda storica senza codice viene registrata automaticamente al primo salvataggio", async () => {
  const id = "legacy-no-code";
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "privatePlants", id),
      { ...plant, plantLocation: "Balcone" });
  });
  const original = (await read(owner, "privatePlants", id)).data();
  await savePlantRecord(adapter(owner), {
    id, expectedVersion: plantVersion(original), plant,
    generateCode: () => "LEG123"
  });
  const saved = (await read(owner, "privatePlants", id)).data();
  assert.equal(saved.specimenCode, "LEG123");
  assert.equal(saved.plantLocation, "Balcone");
  assert.equal((await read(owner, "specimenCodes", "LEG123")).data().plantId, id);
  assert.equal((await read(guest, "catalog", id)).data().specimenCode, "LEG123");
  const version = plantVersion(saved);
  await savePlantRecord(adapter(owner), {
    id, expectedVersion: version, plant: { ...plant, name: "Avocado rinominato" },
    generateCode: () => "OTHER1"
  });
  assert.equal((await read(owner, "privatePlants", id)).data().specimenCode, "LEG123");
  assert.equal((await read(owner, "specimenCodes", "OTHER1")).exists(), false);
});

test("collisioni, concorrenza e cancellazione non permettono di riutilizzare un codice", async () => {
  const a = await savePlantRecord(adapter(owner), {
    plant, generateCode: next(["ABC123", "DEF456"])
  });
  assert.equal((await read(owner, "privatePlants", a)).data().specimenCode, "DEF456");
  const results = await Promise.allSettled([
    savePlantRecord(adapter(owner), { plant, generateCode: next(["KLM777", "PQR888"]) }),
    savePlantRecord(adapter(owner), { plant, generateCode: next(["KLM777", "XYZ999"]) })
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 2);
  const ids = results.map(r => r.value);
  const codes = [];
  for (const id of ids) codes.push((await read(owner, "privatePlants", id)).data().specimenCode);
  assert.equal(new Set(codes).size, 2);
  assert.ok(codes.includes("KLM777"));
  const original = (await read(owner, "privatePlants", a)).data();
  await deletePlantRecord(adapter(owner), { id: a, expectedVersion: plantVersion(original) });
  assert.equal((await read(owner, "privatePlants", a)).exists(), false);
  assert.equal((await read(owner, "specimenCodes", "DEF456")).data().plantId, a);
  const fresh = await savePlantRecord(adapter(owner), {
    plant, generateCode: next(["DEF456", "RST123"])
  });
  assert.equal((await read(owner, "privatePlants", fresh)).data().specimenCode, "RST123");
  await assert.rejects(savePlantRecord(adapter(owner), {
    plant, generateCode: () => "ABC123"
  }), SpecimenCodeError);
  await assertFails(setDoc(doc(guest, "specimenCodes", "AAAAAA"), { plantId: "untrusted" }));
});
