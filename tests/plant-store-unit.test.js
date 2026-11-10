import test from "node:test";
import assert from "node:assert/strict";
import { plantVersion, PlantConflictError } from "../src/plant-store.js";

test("la versione è indipendente dall'ordine delle proprietà", () => {
  assert.equal(plantVersion({ name: "Mango", nested: { b: 2, a: 1 } }),
    plantVersion({ nested: { a: 1, b: 2 }, name: "Mango" }));
});

test("una modifica di note private o metadati viene rilevata", () => {
  const base = { name: "Mango", internalNotes: "A", updatedAt: { seconds: 1, nanoseconds: 2 } };
  assert.notEqual(plantVersion(base), plantVersion({ ...base, internalNotes: "B" }));
  assert.notEqual(plantVersion(base), plantVersion({ ...base,
    updatedAt: { seconds: 1, nanoseconds: 3 } }));
});

test("dati vecchi senza timestamp sono confrontabili e i valori distinti restano distinti", () => {
  assert.equal(plantVersion({ name: "Mango" }), plantVersion({ name: "Mango" }));
  assert.notEqual(plantVersion({ published: false }), plantVersion({ published: true }));
  assert.notEqual(plantVersion({ optional: null }), plantVersion({ optional: undefined }));
  assert.notEqual(plantVersion({ extra: [] }), plantVersion({ extra: {} }));
  assert.match(new PlantConflictError().message, /non sono stati sovrascritti/);
});
