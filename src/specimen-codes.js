import { specimenCodeOf, validSpecimenCode } from "./domain.js";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_ATTEMPTS = 24;

export function randomSpecimenCode() {
  let code = "";
  while (code.length < 6) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    for (const value of bytes) {
      // 252 è divisibile per 36: evita un bias nella scelta delle lettere.
      if (value < 252) code += ALPHABET[value % 36];
      if (code.length === 6) break;
    }
  }
  return code;
}

export class SpecimenCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpecimenCodeError";
  }
}

const activationRef = (firebase) =>
  firebase.doc(firebase.db, "specimenRegistry", "activation");
const reservationRef = (firebase, code) =>
  firebase.doc(firebase.db, "specimenCodes", code);

// I codici non vengono mai liberati, neanche cancellando la pianta: un codice
// mostrato al pubblico non deve poter indicare un esemplare diverso in futuro.
export async function consolidateSpecimenCodes(firebase, {
  generateCode = randomSpecimenCode, onProgress = () => {}
} = {}) {
  const statusRef = activationRef(firebase);
  const initialStatus = await firebase.runTransaction(firebase.db, async tx => {
    const status = await tx.get(statusRef);
    if (status.exists()) {
      const value = status.data().status;
      if (value !== "ready" && value !== "migrating") {
        throw new SpecimenCodeError("Stato del registro non riconosciuto: nessuna scheda modificata.");
      }
      return value;
    }
    tx.set(statusRef, { status: "migrating", startedAt: firebase.serverTimestamp() });
    return "migrating";
  });

  const inventoryRef = firebase.collection(firebase.db, "privatePlants");
  const catalogRef = firebase.collection(firebase.db, "catalog");
  const inventory = (await firebase.getDocs(inventoryRef)).docs.sort((a, b) => a.id.localeCompare(b.id));
  const publicDocs = (await firebase.getDocs(catalogRef)).docs;
  const inventoryIds = new Set(inventory.map(item => item.id));
  if (publicDocs.some(item => !inventoryIds.has(item.id))) {
    throw new SpecimenCodeError("Il catalogo contiene schede prive dell'esemplare privato: verificare prima di completare i codici.");
  }
  const protectedCodes = new Set(inventory.map(item => {
    const stored = item.data().specimenCode;
    if (stored !== undefined && !validSpecimenCode(stored)) {
      throw new SpecimenCodeError("Codice non valido nella scheda " + item.id + ": nessuna correzione automatica.");
    }
    return stored || specimenCodeOf({ id: item.id }).slice(1);
  }));
  if (initialStatus === "ready" && inventory.some(item => !validSpecimenCode(item.data().specimenCode))) {
    throw new SpecimenCodeError("Registro già attivo con schede prive di codice: intervenire prima di proseguire.");
  }

  let done = 0;
  for (const entry of inventory) {
    const fixed = entry.data().specimenCode;
    let reserved = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = fixed || (attempt === 0
        ? specimenCodeOf({ id: entry.id }).slice(1) : generateCode());
      if (!validSpecimenCode(code)) {
        throw new SpecimenCodeError("Il generatore ha prodotto un codice non valido.");
      }
      if (!fixed && attempt > 0 && protectedCodes.has(code)) continue;
      const privateRef = firebase.doc(firebase.db, "privatePlants", entry.id);
      const publicRef = firebase.doc(firebase.db, "catalog", entry.id);
      const codeRef = reservationRef(firebase, code);
      const outcome = await firebase.runTransaction(firebase.db, async tx => {
        const current = await tx.get(privateRef);
        if (!current.exists()) return "removed";
        const assigned = current.data().specimenCode;
        if (assigned && assigned !== code) return "changed";
        const [existing, published] = await Promise.all([tx.get(codeRef), tx.get(publicRef)]);
        if (existing.exists() && existing.data().plantId !== entry.id) return "collision";
        if (!existing.exists()) {
          tx.set(codeRef, { plantId: entry.id, createdAt: firebase.serverTimestamp() });
        }
        if (!assigned) tx.update(privateRef, { specimenCode: code });
        if (published.exists() && published.data().specimenCode !== code) {
          tx.update(publicRef, { specimenCode: code });
        }
        return "claimed";
      });
      if (outcome === "changed") {
        throw new SpecimenCodeError("Una scheda è stata modificata durante la procedura: ripeti la verifica.");
      }
      if (outcome === "collision") {
        if (fixed) throw new SpecimenCodeError("Il codice " + code + " risulta associato a un'altra pianta.");
        continue;
      }
      reserved = true;
      protectedCodes.add(code);
      break;
    }
    if (!reserved) throw new SpecimenCodeError("Impossibile ottenere un codice libero. Riprova: le operazioni già completate rimangono valide.");
    onProgress(++done, inventory.length);
  }

  // Verifica tutte le prenotazioni e le proiezioni dopo la conversione.
  const finalInventory = (await firebase.getDocs(inventoryRef)).docs;
  const finalPublic = (await firebase.getDocs(catalogRef)).docs;
  const currentById = new Map(finalInventory.map(item => [item.id, item.data()]));
  const assigned = new Set();
  for (const item of finalInventory) {
    const code = item.data().specimenCode;
    if (!validSpecimenCode(code) || assigned.has(code)) {
      throw new SpecimenCodeError("Codici mancanti o duplicati dopo l'assegnazione: registro non attivato.");
    }
    assigned.add(code);
    const reservation = await firebase.getDoc(reservationRef(firebase, code));
    if (!reservation.exists() || reservation.data().plantId !== item.id) {
      throw new SpecimenCodeError("Prenotazione non coerente per " + item.id + ": registro non attivato.");
    }
  }
  if (finalPublic.some(item =>
    !currentById.has(item.id) ||
    item.data().specimenCode !== currentById.get(item.id).specimenCode)) {
    throw new SpecimenCodeError("Catalogo e inventario non sono allineati: registro non attivato.");
  }
  await firebase.runTransaction(firebase.db, async tx => {
    const status = await tx.get(statusRef);
    if (!status.exists() || !["ready", "migrating"].includes(status.data().status)) {
      throw new SpecimenCodeError("Stato del registro cambiato durante la verifica.");
    }
    if (status.data().status === "migrating") {
      tx.update(statusRef, { status: "ready", completedAt: firebase.serverTimestamp() });
    }
  });
  return { count: finalInventory.length };
}
