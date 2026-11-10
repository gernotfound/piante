import { catalogProjection } from "./domain.js";

// La versione è calcolata su tutti i campi letti, inclusi quelli non gestiti dall'editor.
// Così anche schede legacy e modifiche esterne prive di updatedAt rilevano conflitti.
function normalized(value) {
  if (value === undefined) return ["undefined"];
  if (value === null || typeof value !== "object") return value;
  if (typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
    return ["timestamp", value.seconds, value.nanoseconds];
  }
  if (Array.isArray(value)) return ["array", value.map(normalized)];
  return ["object", Object.keys(value).sort().map((key) => [key, normalized(value[key])])];
}

export function plantVersion(plant) {
  return JSON.stringify(normalized(plant));
}

export class PlantConflictError extends Error {
  constructor() {
    super("La scheda è cambiata o è stata eliminata da un'altra sessione. I tuoi dati non sono stati sovrascritti. Ricarica la scheda per vedere la versione aggiornata.");
    this.name = "PlantConflictError";
  }
}

function assertCurrent(snapshot, expectedVersion) {
  if (!snapshot.exists() || plantVersion(snapshot.data()) !== expectedVersion) {
    throw new PlantConflictError();
  }
}

// Tutte le letture precedono le scritture; le transazioni Firestore ritentano su
// aggiornamenti concorrenti, quindi una versione obsoleta non può fare overwrite.
export async function savePlantRecord(firebase, { id = "", plant, expectedVersion = null }) {
  if (id && typeof expectedVersion !== "string") throw new PlantConflictError();
  const documentId = id || firebase.doc(firebase.collection(firebase.db, "privatePlants")).id;
  const privateRef = firebase.doc(firebase.db, "privatePlants", documentId);
  const publicRef = firebase.doc(firebase.db, "catalog", documentId);

  return firebase.runTransaction(firebase.db, async (tx) => {
    const previous = await tx.get(privateRef);
    if (id) {
      assertCurrent(previous, expectedVersion);
      // update preserva i metadati non modificati dall'editor, anche dopo future evoluzioni dello schema.
      tx.update(privateRef, { ...plant, updatedAt: firebase.serverTimestamp() });
    } else {
      if (previous.exists()) throw new PlantConflictError();
      tx.set(privateRef, {
        ...plant,
        createdAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp()
      });
    }
    if (plant.published) tx.set(publicRef, catalogProjection(plant));
    else tx.delete(publicRef);
    return documentId;
  });
}

export async function deletePlantRecord(firebase, { id, expectedVersion }) {
  if (!id || typeof expectedVersion !== "string") throw new PlantConflictError();
  const privateRef = firebase.doc(firebase.db, "privatePlants", id);
  const publicRef = firebase.doc(firebase.db, "catalog", id);
  await firebase.runTransaction(firebase.db, async (tx) => {
    const previous = await tx.get(privateRef);
    assertCurrent(previous, expectedVersion);
    tx.delete(privateRef);
    tx.delete(publicRef);
  });
}
