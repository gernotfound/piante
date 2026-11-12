import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp,
  setDoc, deleteDoc } from "firebase/firestore";
import { specimenCodeOf } from "../../src/domain.js";
import { savePlantRecord, deletePlantRecord, plantVersion } from "../../src/plant-store.js";
import { consolidateSpecimenCodes, SpecimenCodeError } from "../../src/specimen-codes.js";

let environment, owner, guest;
const adapter = db => ({ db, doc, collection, getDoc, getDocs, runTransaction, serverTimestamp });
const plant = { name: "Avocado", category: "Tropicali da frutto", description: "",
  internalNotes: "Da conservare", published: true };
const read = (db, path, id) => getDoc(doc(db, path, id));

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

test("attivazione riprendibile: orfani bloccati, collisione risolta, dati storici intatti", async () => {
  const first = "legacy-avocado-A", second = "legacy-avocado-B";
  const oldCode = specimenCodeOf({ id: first }).slice(1);
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "privatePlants", first), { ...plant, plantLocation: "Balcone" });
    await setDoc(doc(db, "catalog", first), { name: plant.name, description: "" });
    await setDoc(doc(db, "privatePlants", second), { ...plant, published: false });
    await setDoc(doc(db, "specimenCodes", oldCode),
      { plantId: "pianta-eliminata", createdAt: new Date("2026-01-01") });
    await setDoc(doc(db, "catalog", "orphan"), { name: "Orfana", description: "" });
  });
  await assert.rejects(consolidateSpecimenCodes(adapter(owner)), SpecimenCodeError);
  assert.equal((await read(owner, "specimenRegistry", "activation")).data().status, "migrating");
  await deleteDoc(doc(owner, "catalog", "orphan"));
  const migrated = await consolidateSpecimenCodes(adapter(owner), {
    generateCode: () => "ABC123"
  });
  assert.equal(migrated.count, 2);
  const dataA = (await read(owner, "privatePlants", first)).data();
  const dataB = (await read(owner, "privatePlants", second)).data();
  assert.equal(dataA.specimenCode, "ABC123");
  assert.match(dataB.specimenCode, /^[A-Z0-9]{6}$/);
  assert.notEqual(dataA.specimenCode, dataB.specimenCode);
  assert.equal(dataA.internalNotes, "Da conservare");
  assert.equal(dataA.plantLocation, "Balcone");
  assert.equal((await read(guest, "catalog", first)).data().specimenCode, dataA.specimenCode);
  assert.equal((await read(guest, "catalog", first)).data().internalNotes, undefined);
  assert.equal((await read(owner, "specimenCodes", dataA.specimenCode)).data().plantId, first);
  assert.equal((await read(owner, "specimenCodes", oldCode)).data().plantId, "pianta-eliminata");
  assert.equal((await read(owner, "specimenRegistry", "activation")).data().status, "ready");
  const repeat = await consolidateSpecimenCodes(adapter(owner));
  assert.equal(repeat.count, 2);
  assert.equal((await read(owner, "privatePlants", first)).data().specimenCode, "ABC123");
  await assertFails(getDoc(doc(guest, "specimenCodes", "ABC123")));
  await assertFails(getDocs(collection(guest, "specimenCodes")));
  await assertFails(getDoc(doc(guest, "specimenRegistry", "activation")));
  await assertFails(deleteDoc(doc(owner, "specimenCodes", "ABC123")));
  await assertFails(setDoc(doc(owner, "specimenCodes", "ABC123"), { plantId: second }));
  await assertFails(setDoc(doc(owner, "privatePlants", first),
    { ...dataA, specimenCode: "ZZZZZZ" }));
  await assertFails(setDoc(doc(owner, "catalog", first),
    { name: "Avocado", description: "", specimenCode: "ZZZZZZ" }));
});

test("prenotazione atomica: collisione, concorrenza e codici non riutilizzabili", async () => {
  const next = items => () => items.shift() || "JKL444";
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
  const old = (await read(owner, "privatePlants", a)).data();
  await deletePlantRecord(adapter(owner), { id: a, expectedVersion: plantVersion(old) });
  assert.equal((await read(owner, "privatePlants", a)).exists(), false);
  assert.equal((await read(owner, "specimenCodes", "DEF456")).data().plantId, a);
  const fresh = await savePlantRecord(adapter(owner), {
    plant, generateCode: next(["DEF456", "RST123"])
  });
  assert.equal((await read(owner, "privatePlants", fresh)).data().specimenCode, "RST123");
  await assertFails(setDoc(doc(guest, "specimenCodes", "AAAAAA"), { plantId: "untrusted" }));
});
