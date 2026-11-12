import { catalogProjection } from "./domain.js";
import { changedPlantFields, resolvePlantProfiles } from "./taxonomy.js";

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

export class PlantJournalRetentionError extends Error {
  constructor() {
    super("Il diario contiene osservazioni da conservare o è troppo esteso per un'eliminazione sicura. Imposta lo stato della pianta a Morta o Ceduta e conserva la scheda.");
    this.name = "PlantJournalRetentionError";
  }
}

function assertCurrent(snapshot, expectedVersion) {
  if (!snapshot.exists() || plantVersion(snapshot.data()) !== expectedVersion) {
    throw new PlantConflictError();
  }
}

// Tutte le letture precedono le scritture; le transazioni Firestore ritentano su
// aggiornamenti concorrenti, quindi una versione obsoleta non può fare overwrite.
export async function savePlantRecord(firebase, { id = "", plant, expectedVersion = null, shared = null }) {
  if (id && typeof expectedVersion !== "string") throw new PlantConflictError();
  const documentId = id || firebase.doc(firebase.collection(firebase.db, "privatePlants")).id;
  const privateRef = firebase.doc(firebase.db, "privatePlants", documentId);
  const publicRef = firebase.doc(firebase.db, "catalog", documentId);

  const profileRefs = [shared?.species, shared?.cultivar].filter(Boolean)
    .map(item => ({ ...item, ref: firebase.doc(firebase.db, "plantProfiles", item.id) }));
  const lotRef = shared?.lot ? firebase.doc(firebase.db, "seedLots", shared.lot.id) : null;
  return firebase.runTransaction(firebase.db, async (tx) => {
    const previous = await tx.get(privateRef);
    const profiles = [];
    for (const profile of profileRefs) {
      const snapshot = await tx.get(profile.ref);
      if (snapshot.exists()) {
        if (typeof profile.expectedVersion !== "string" ||
            plantVersion(snapshot.data()) !== profile.expectedVersion) throw new PlantConflictError();
      } else if (profile.expectedVersion !== null) throw new PlantConflictError();
      profiles.push({ profile, snapshot });
    }
    const lotSnapshot = lotRef ? await tx.get(lotRef) : null;
    if (lotSnapshot?.exists() && lotSnapshot.data().speciesId !== plant.speciesId) {
      throw new Error("Il lotto selezionato appartiene a un'altra specie.");
    }
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
    for (const { profile, snapshot } of profiles) {
      const draft = profile.data;
      const modified = !snapshot.exists() || Object.keys(draft).some(key =>
        JSON.stringify(normalized(snapshot.data()[key])) !== JSON.stringify(normalized(draft[key])));
      if (!modified) continue;
      if (snapshot.exists()) tx.update(profile.ref, { ...draft, updatedAt: firebase.serverTimestamp() });
      else tx.set(profile.ref, { ...draft, createdAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp() });
    }
    if (lotRef && !lotSnapshot.exists()) {
      tx.set(lotRef, { ...shared.lot.data, createdAt: firebase.serverTimestamp() });
    }
    const resolved = profiles.length ? resolvePlantProfiles(plant,
      profiles.map(({ profile }) => ({ ...profile.data, id: profile.id }))) : plant;
    if (plant.published) tx.set(publicRef, catalogProjection(resolved));
    else tx.delete(publicRef);
    const eventRef = firebase.doc(firebase.collection(privateRef, "events"));
    tx.set(eventRef, {
      type: id ? "Modifica" : "Creazione",
      changedFields: changedPlantFields(previous.exists() ? previous.data() : {}, plant),
      note: "", eventDate: new Date().toISOString().slice(0, 10),
      createdAt: firebase.serverTimestamp()
    });
    return documentId;
  });
}

export async function deletePlantRecord(firebase, { id, expectedVersion }) {
  if (!id || typeof expectedVersion !== "string") throw new PlantConflictError();
  const privateRef = firebase.doc(firebase.db, "privatePlants", id);
  const publicRef = firebase.doc(firebase.db, "catalog", id);
  // Firestore non elimina le sottoraccolte insieme al documento padre.
  // Se il diario contiene osservazioni, la cancellazione è bloccata: non
  // cancelliamo dati di coltivazione e non lasciamo eventi orfani.
  const events = await firebase.getDocs(firebase.collection(privateRef, "events"));
  if (events.size > 250 || events.docs.some(event =>
    String(event.data().note || "").trim())) throw new PlantJournalRetentionError();
  await firebase.runTransaction(firebase.db, async (tx) => {
    const previous = await tx.get(privateRef);
    assertCurrent(previous, expectedVersion);
    const eventSnapshots = await Promise.all(events.docs.map(event => tx.get(event.ref)));
    if (eventSnapshots.some(snapshot => !snapshot.exists() ||
        String(snapshot.data().note || "").trim())) throw new PlantJournalRetentionError();
    for (const snapshot of eventSnapshots) tx.delete(snapshot.ref);
    tx.delete(privateRef);
    tx.delete(publicRef);
  });
}


// Il diario è privato e append-only. L'aggiornamento del padre rende rilevabili
// attività concorrenti mentre un'altra sessione prova a eliminare la pianta.
export async function saveJournalEntry(firebase, { plantId, kind, note, eventDate }) {
  const validDate = typeof eventDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(eventDate) &&
    Number.isFinite(Date.parse(eventDate)) &&
    new Date(eventDate).toISOString().slice(0, 10) === eventDate;
  if (!plantId || !["Osservazione", "Irrigazione", "Concimazione", "Rinvaso",
    "Trattamento", "Potatura", "Fioritura", "Raccolta", "Problema", "Altro"].includes(kind) ||
    !note?.trim() || note.trim().length > 1500 || !validDate) {
    throw new Error("Compila attività, data valida e descrizione (massimo 1500 caratteri).");
  }
  const parent = firebase.doc(firebase.db, "privatePlants", plantId);
  const eventRef = firebase.doc(firebase.collection(parent, "events"));
  await firebase.runTransaction(firebase.db, async (tx) => {
    const snapshot = await tx.get(parent);
    if (!snapshot.exists()) throw new PlantConflictError();
    tx.set(eventRef, {
      type: kind, note: note.trim(), eventDate, changedFields: [],
      createdAt: firebase.serverTimestamp()
    });
    tx.update(parent, { lastJournalActivityAt: firebase.serverTimestamp() });
  });
}
