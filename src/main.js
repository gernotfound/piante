import { firebaseConfig, firebaseConfigured } from "./config.js";
import { categories, plantGroups, fruitTypes, pollinationTypes, potSuitabilityTypes, groupForEditedPlant, decodeRouteId, escapeHtml, normalizeUsername, validUsername, validatePlant } from "./domain.js";
import { plantVersion, savePlantRecord, deletePlantRecord, saveJournalEntry, PlantConflictError, PlantJournalRetentionError,
  JournalValidationError, SeedLotConflictError } from "./plant-store.js";
import { lifeStages, journalKinds, taxonId, lotIdOf, profileByName, sharedProfileDraft, resolvePlantProfiles } from "./taxonomy.js";
import { leafArt } from "./ui/artwork.js";
import { createPublicViews } from "./ui/public.js";
import { createAdminViews } from "./ui/admin.js";

const appRoot = document.querySelector("#app");
const coldOptions = ["", "5", "0", "-3", "-5", "-10", "-15", "-20"];
const state = {
  route: window.location.pathname,
  menuOpen: false,
  catalog: [],
  inventory: [],
  rawInventory: [], rawCatalog: [], profiles: [], profilesReady: false, profilesError: "",
  publicProfiles: [], publicProfilesReady: false, ownerProfiles: [], ownerProfilesReady: false,
  lots: [], lotsReady: false, journalEntries: [], journalError: "", inventoryStage: "Tutte",
  inventoryReady: false,
  inventoryError: "",
  user: null,
  owner: false,
  authReady: !firebaseConfigured,
  username: "",
  error: "",
  flash: "",
  filter: new URLSearchParams(window.location.search).get("q")?.slice(0, 120) || "",
  catalogError: "", publicProfilesError: "",
  category: getCategoryFromUrl(),
  group: getGroupFromUrl(),
  fruitType: getFruitTypeFromUrl(),
  minTempC: getColdFromUrl(),
  pollination: getPollinationFromUrl(),
  potSuitability: getPotFromUrl(),
  harvestMonth: getHarvestFromUrl(),
  filtersOpen: false,
  inventoryQuery: "",
  inventoryVisibility: "Tutte",
  inventoryGroup: "Tutte",
  dbError: ""
};
let firebase = null;
let privateListener = null;
let lotsListener = null;
let profilesListener = null;
let journalListener = null;
let activeJournalId = "";
let journalDirty = false;
let journalSaveInProgress = false;
let authCheckSerial = 0;
let formDirty = false;
let plantSaveInProgress = false;
let editBaseline = null;
let currentPath = window.location.pathname + window.location.search;

function getCategoryFromUrl() {
  const value = new URLSearchParams(window.location.search).get("categoria");
  return categories.includes(value) ? value : "Tutte";
}
function getGroupFromUrl() {
  const value = new URLSearchParams(window.location.search).get("gruppo");
  return plantGroups.includes(value) ? value : "Tutte";
}
function getFruitTypeFromUrl() {
  const value = new URLSearchParams(window.location.search).get("tipo");
  return fruitTypes.includes(value) ? value : "Tutte";
}
function getColdFromUrl() {
  const value = new URLSearchParams(window.location.search).get("freddo") || "";
  return coldOptions.includes(value) ? value : "";
}
function getPollinationFromUrl() {
  const value = new URLSearchParams(window.location.search).get("impollinazione");
  return pollinationTypes.includes(value) ? value : "Tutte";
}
function getPotFromUrl() {
  const value = new URLSearchParams(window.location.search).get("vaso");
  return potSuitabilityTypes.includes(value) ? value : "Tutte";
}
function getHarvestFromUrl() {
  const value = new URLSearchParams(window.location.search).get("raccolta") || "";
  return /^(?:[1-9]|1[012])$/.test(value) ? value : "";
}
function readCatalogUrl() {
  state.category = getCategoryFromUrl();
  state.group = getGroupFromUrl();
  state.fruitType = getFruitTypeFromUrl();
  state.minTempC = getColdFromUrl();
  state.pollination = getPollinationFromUrl();
  state.potSuitability = getPotFromUrl();
  state.harvestMonth = getHarvestFromUrl();
  state.filter = new URLSearchParams(window.location.search).get("q")?.slice(0, 120) || "";
}
function syncCatalogUrl() {
  const params = new URLSearchParams();
  if (state.category !== "Tutte") params.set("categoria", state.category);
  if (state.group !== "Tutte") params.set("gruppo", state.group);
  if (state.fruitType !== "Tutte") params.set("tipo", state.fruitType);
  if (state.minTempC !== "") params.set("freddo", state.minTempC);
  if (state.pollination !== "Tutte") params.set("impollinazione", state.pollination);
  if (state.potSuitability !== "Tutte") params.set("vaso", state.potSuitability);
  if (state.harvestMonth !== "") params.set("raccolta", state.harvestMonth);
  if (state.filter) params.set("q", state.filter);
  const path = "/piante" + (params.size ? "?" + params.toString() : "");
  window.history.replaceState({}, "", path);
  currentPath = path;
}
function confirmDiscard() {
  return (!formDirty && !journalDirty) || window.confirm("Hai modifiche non salvate. Vuoi uscire senza salvarle?");
}
function updatePublicErrors() {
  state.dbError = [state.catalogError, state.publicProfilesError].filter(Boolean).join(" ");
}
function refreshSharedPlants() {
  state.profiles = state.owner ? state.ownerProfiles : state.publicProfiles;
  state.profilesReady = state.owner ? state.ownerProfilesReady : state.publicProfilesReady;
  state.catalog = state.rawCatalog.map(item => resolvePlantProfiles(item, state.publicProfiles));
  state.inventory = state.rawInventory.map(item => resolvePlantProfiles(item, state.profiles));
}
function syncJournalListener() {
  const part = state.route.startsWith("/admin/modifica/")
    ? decodeRouteId(state.route.slice("/admin/modifica/".length)) : "";
  const id = state.owner && state.inventoryReady && firebase ? part || "" : "";
  if (id === activeJournalId) return;
  if (journalListener) { journalListener(); journalListener = null; }
  activeJournalId = id;
  state.journalEntries = []; state.journalError = "";
  if (!id) return;
  const entries = firebase.collection(firebase.db, "privatePlants", id, "events");
  journalListener = firebase.onSnapshot(
    firebase.query(entries, firebase.orderBy("createdAt", "desc"), firebase.limit(50)),
    snap => {
      if (activeJournalId !== id) return;
      state.journalEntries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      state.journalError = ""; renderUnlessEditing();
    },
    () => {
      if (activeJournalId !== id) return;
      state.journalError = "Storico temporaneamente non disponibile.";
      renderUnlessEditing();
    }
  );
}
function renderUnlessEditing() {
  if ((formDirty || journalDirty || plantSaveInProgress) &&
      document.querySelector("#plant-form, #journal-form")) return;
  // Gli snapshot asincroni non devono sostituire i moduli durante la compilazione.
  if (document.querySelector("#login-form, #username-form")) return;
  const focusedForm = document.activeElement?.closest?.("form");
  if (["search-form", "inventory-search-form"].includes(focusedForm?.id)) return;
  // Le ricerche non ancora confermate non vanno perse se l'utente esce dal campo.
  const catalogSearch = document.querySelector("#catalog-search-input");
  if (catalogSearch && catalogSearch.value !== state.filter) return;
  // I filtri nuovi, come la ricerca, restano bozze fino al comando Applica.
  const pendingFilters = [
    ["#climate-minimum", state.minTempC],
    ["#pollination-filter", state.pollination],
    ["#harvest-filter", state.harvestMonth],
    ["#pot-filter", state.potSuitability],
    ["#inventory-group", state.inventoryGroup],
    ["#inventory-stage", state.inventoryStage],
    ["#inventory-visibility", state.inventoryVisibility],
    ["#inventory-search-input", state.inventoryQuery]
  ];
  if (pendingFilters.some(([selector, value]) => {
    const field = document.querySelector(selector);
    return field && field.value !== value;
  })) return;
  const expanded = [...document.querySelectorAll("#plant-form details.editor-fold[open]")]
    .map(section => section.id);
  render();
  for (const id of expanded) {
    const section = document.getElementById(id);
    if (section?.closest("#plant-form")) section.open = true;
  }
}
function renderAfterAuthChange() {
  // Le pagine private devono riflettere immediatamente l'autenticazione;
  // quelle pubbliche non devono perdere ricerche in compilazione.
  if (state.route.startsWith("/admin") || state.route === "/login") render();
  else renderUnlessEditing();
}
function showFormError(message, conflict = false) {
  state.error = message;
  const container = document.querySelector(".admin-body");
  if (!container) return;
  let notice = container.querySelector(".notice.error");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "notice error flash";
    notice.setAttribute("role", "alert");
    container.prepend(notice);
  }
  notice.textContent = message;
  if (conflict) {
    const reload = document.createElement("button");
    reload.type = "button";
    reload.className = "btn btn-outline btn-small";
    reload.dataset.action = "reload-editor";
    reload.textContent = "Ricarica la scheda";
    notice.append(reload);
  }
  notice.scrollIntoView({ block: "nearest" });
}
function go(path) {
  if (plantSaveInProgress || journalSaveInProgress) return false;
  const target = new URL(path, window.location.href);
  if (target.origin !== window.location.origin || !confirmDiscard()) return false;
  formDirty = false; journalDirty = false;
  currentPath = target.pathname + target.search;
  window.history.pushState({}, "", currentPath);
  state.route = target.pathname;
  if (state.route === "/piante") readCatalogUrl();
  state.menuOpen = false;
  state.filtersOpen = false;
  state.error = "";
  window.scrollTo(0, 0);
  render();
  return true;
}
const publicViews = createPublicViews({ state, appRoot, coldOptions });
const { shell, homepage, catalogPage, detailPage, aboutPage, contactPage, loginPage, pageHero } = publicViews;
const { adminPage } = createAdminViews({ state, publicViews, setEditBaseline(value) { editBaseline = value; } });

function render() {
  syncJournalListener();
  const path = state.route;
  let page;
  if (path === "/") page = homepage();
  else if (path === "/piante") page = catalogPage();
  else if (path.startsWith("/piante/")) page = detailPage(decodeRouteId(path.slice(8)));
  else if (path === "/chi-siamo") page = aboutPage();
  else if (path === "/contatti") page = contactPage();
  else if (path === "/login") page = !state.authReady && firebaseConfigured
    ? `<div class="boot" role="status">Verifica della sessione…</div>` : loginPage();
  else if (path.startsWith("/admin")) page = adminPage();
  else page = pageHero("Pagina inesistente", "Pagina non trovata", "Il collegamento richiesto non esiste.") +
    `<section class="section"><div class="container"><a href="/" data-nav class="btn btn-primary">Torna alla home</a></div></section>`;
  shell(page);
}
async function startFirebase() {
  if (!firebaseConfigured) { render(); return; }
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    firebase = { ...authMod, ...dbMod, auth: authMod.getAuth(app), db: dbMod.getFirestore(app) };
    // I visitatori vedono solo profili già pubblicati. Le specie legate
    // soltanto a esemplari privati non sono enumerabili fuori dall'admin.
    firebase.onSnapshot(
      firebase.query(firebase.collection(firebase.db, "plantProfiles"),
        firebase.where("public", "==", true)),
      snap => {
        state.publicProfiles = snap.docs.map(d => {
          const data = d.data();
          return { ...data, id: d.id, __snapshotVersion: plantVersion(data) };
        });
        state.publicProfilesReady = true;
        state.publicProfilesError = "";
        updatePublicErrors();
        refreshSharedPlants(); renderUnlessEditing();
      }, () => {
        state.publicProfilesReady = false;
        state.publicProfilesError = "Impossibile leggere le schede botaniche pubbliche.";
        updatePublicErrors();
        refreshSharedPlants(); renderUnlessEditing();
      });
    firebase.onSnapshot(firebase.collection(firebase.db, "catalog"), (snap) => {
      state.rawCatalog = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it"));
      state.catalogError = "";
      updatePublicErrors(); refreshSharedPlants(); renderUnlessEditing();
    }, () => {
      state.catalogError = "Impossibile leggere il catalogo. Controlla le regole Firestore.";
      updatePublicErrors(); renderUnlessEditing();
    });
    firebase.onAuthStateChanged(firebase.auth, async (user) => {
      const serial = ++authCheckSerial;
      if (privateListener) { privateListener(); privateListener = null; }
      if (profilesListener) { profilesListener(); profilesListener = null; }
      if (lotsListener) { lotsListener(); lotsListener = null; }
      if (journalListener) { journalListener(); journalListener = null; }
      activeJournalId = "";
      state.user = user; state.owner = false; state.username = "";
      state.ownerProfiles = []; state.ownerProfilesReady = false; state.profilesError = "";
      state.inventory = []; state.rawInventory = []; state.lots = []; state.journalEntries = [];
      state.lotsReady = false;
      refreshSharedPlants();
      state.inventoryReady = false; state.inventoryError = ""; editBaseline = null;
      state.authReady = false; renderAfterAuthChange();
      if (user) {
        try {
          const ownerDoc = await firebase.getDoc(firebase.doc(firebase.db, "siteOwner", "primary"));
          if (serial !== authCheckSerial) return;
          if (ownerDoc.exists() && ownerDoc.data().uid === user.uid) {
            state.owner = true;
            refreshSharedPlants();
            const profile = await firebase.getDoc(firebase.doc(firebase.db, "adminProfiles", user.uid));
            if (serial !== authCheckSerial) return;
            state.username = profile.exists() ? profile.data().username || "" : "";
            profilesListener = firebase.onSnapshot(
              firebase.collection(firebase.db, "plantProfiles"), snap => {
                if (serial !== authCheckSerial || !state.owner) return;
                state.ownerProfiles = snap.docs.map(d => {
                  const data = d.data();
                  return { ...data, id: d.id, __snapshotVersion: plantVersion(data) };
                });
                state.ownerProfilesReady = true; state.profilesError = "";
                refreshSharedPlants(); renderUnlessEditing();
              }, () => {
                if (serial !== authCheckSerial || !state.owner) return;
                state.ownerProfilesReady = false;
                state.profilesError = "Impossibile leggere le schede botaniche private.";
                refreshSharedPlants(); renderUnlessEditing();
              });
            privateListener = firebase.onSnapshot(firebase.collection(firebase.db, "privatePlants"), (snap) => {
              state.rawInventory = snap.docs.map((d) => {
                const data = d.data();
                return { ...data, id: d.id, __snapshotVersion: plantVersion(data) };
              })
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it"));
              refreshSharedPlants();
              state.inventoryReady = true; state.inventoryError = ""; renderUnlessEditing();
            }, () => { state.inventoryError = "Impossibile leggere l'inventario privato."; renderUnlessEditing(); });
            lotsListener = firebase.onSnapshot(firebase.collection(firebase.db, "seedLots"), snap => {
              state.lots = snap.docs.map(d => ({ ...d.data(), id: d.id }));
              state.lotsReady = true; renderUnlessEditing();
            }, () => {
              state.lotsReady = false;
              state.inventoryError = "Impossibile leggere i lotti di semina."; renderUnlessEditing();
            });
          } else {
            state.error = "Questo account non è autorizzato a gestire il sito.";
            await firebase.signOut(firebase.auth);
          }
        } catch {
          if (serial !== authCheckSerial) return;
          state.error = "Impossibile verificare l'account amministratore. Controlla il documento siteOwner/primary e le regole.";
          await firebase.signOut(firebase.auth);
        }
      }
      if (serial === authCheckSerial) { state.authReady = true; renderAfterAuthChange(); }
    });
    renderUnlessEditing();
  } catch {
    state.catalogError = "Connessione Firebase non disponibile.";
    updatePublicErrors();
    state.error = "Non è stato possibile inizializzare Firebase.";
    state.authReady = true;
    render();
  }
}
async function login(form) {
  if (!firebase) return;
  const identity = String(form.get("identity") || "").trim();
  const password = String(form.get("password") || "");
  state.error = ""; state.flash = "";
  try {
    let email = identity;
    if (!identity.includes("@")) {
      if (!validUsername(identity)) throw new Error("Credenziali non valide.");
      const alias = await firebase.getDoc(firebase.doc(firebase.db, "loginAliases", normalizeUsername(identity)));
      if (!alias.exists() || !alias.data().email) throw new Error("Credenziali non valide.");
      email = alias.data().email;
    }
    await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
    go("/admin");
  } catch (err) {
    state.error = err.message === "Credenziali non valide." ? err.message :
      "Accesso non riuscito. Verifica le credenziali e la configurazione Firebase.";
    render();
  }
}
async function savePlant(form, id) {
  if (journalSaveInProgress) {
    showFormError("È già in corso un salvataggio del diario. La scheda non è stata modificata.");
    return;
  }
  if (plantSaveInProgress || !firebase) return;
  if (!state.inventoryReady || !state.lotsReady || !state.profilesReady ||
      state.inventoryError || state.profilesError) {
    showFormError("Inventario non disponibile oppure schede botaniche o lotti non accessibili. I dati non sono stati salvati.");
    return;
  }
  const keys = ["name", "scientificName", "category", "variety", "origin",
    "availability", "light", "water", "price", "imageUrl", "description",
    "internalNotes", "fruitType", "growthHabit", "searchAliases", "coldSource",
    "coldNotes", "pollination", "potSuitability", "propagationMethod",
    "materialSource", "sourceDetails", "sownOn", "plantLocation", "specimenSex",
    "lifeStage", "seedSourceCultivar"];
  const plant = Object.fromEntries(keys.map(key => [key, String(form.get(key) || "").trim()]));
  const previous = id && editBaseline?.id === id ? editBaseline : null;
  plant.plantGroup = groupForEditedPlant(plant.category, previous);
  if (plant.plantGroup !== "Piante da frutto") plant.fruitType = "";
  plant.published = form.has("published");
  plant.harvestMonths = [...new Set(form.getAll("harvestMonth").map(Number))].sort((a, b) => a - b);
  const rawCold = String(form.get("minColdC") || "").trim();
  plant.minColdC = rawCold ? Number(rawCold.replace(",", ".")) : null;
  const cultivarName = String(form.get("cultivarName") || "").trim();
  const species = profileByName(state.profiles, "species", plant.name);
  // Una diversa maiuscola non deve rinominare il profilo botanico condiviso.
  if (species) plant.name = species.name;
  plant.speciesId = species?.id || taxonId("species", plant.name);
  const cultivar = cultivarName
    ? profileByName(state.profiles, "cultivar", cultivarName, plant.speciesId) : null;
  plant.cultivarId = cultivarName
    ? cultivar?.id || taxonId("cultivar", cultivarName, plant.speciesId) : "";
  if (cultivarName) plant.variety = cultivarName;
  else if (previous?.cultivarId) plant.variety = "";
  const lotName = String(form.get("lotName") || "").trim();
  const existingLot = state.lots.find(lot => lot.speciesId === plant.speciesId &&
    lot.name.toLocaleLowerCase("it") === lotName.toLocaleLowerCase("it"));
  plant.lotName = lotName;
  plant.lotId = lotName ? existingLot?.id || lotIdOf(plant.speciesId, lotName) : "";
  const validation = validatePlant(plant);
  if (validation) { showFormError(validation); return; }
  if (!plant.speciesId || plant.speciesId.length > 900 ||
      (plant.cultivarId && plant.cultivarId.length > 1100)) {
    showFormError("Il nome della specie o cultivar è troppo lungo."); return;
  }
  if (plant.lotId.length > 1200) {
    showFormError("Nome del lotto troppo lungo per questa specie."); return;
  }
  if (cultivarName.length > 100 || lotName.length > 100 ||
      plant.seedSourceCultivar.length > 100) {
    showFormError("Il nome della cultivar o del lotto supera 100 caratteri."); return;
  }
  if (plant.lifeStage && !lifeStages.includes(plant.lifeStage)) {
    showFormError("Stato della pianta non riconosciuto."); return;
  }
  if (existingLot && existingLot.speciesId !== plant.speciesId) {
    showFormError("Il lotto selezionato appartiene a un'altra specie."); return;
  }
  const cultivarCold = String(form.get("cultivarMinColdC") || "").trim();
  const cultivarData = {
    fruitNotes: String(form.get("cultivarFruitNotes") || "").trim(),
    minColdC: cultivarCold ? Number(cultivarCold.replace(",", ".")) : null,
    coldSource: String(form.get("cultivarColdSource") || "").trim(),
    coldNotes: String(form.get("cultivarColdNotes") || "").trim(),
    pollination: String(form.get("cultivarPollination") || ""),
    harvestMonths: [...new Set(form.getAll("cultivarHarvestMonth").map(Number))].sort((a, b) => a - b)
  };
  const cultivarError = cultivarName ? validatePlant({
    name: cultivarName, category: plant.category, ...cultivarData
  }) : "";
  if (cultivarError || cultivarData.fruitNotes.length > 750) {
    showFormError(cultivarError || "La descrizione del frutto supera 750 caratteri."); return;
  }
  let pendingJournal = null;
  if (journalDirty) {
    const diaryForm = document.querySelector("#journal-form");
    if (diaryForm?.dataset.id === id) {
      const draft = new FormData(diaryForm);
      pendingJournal = {
        kind: String(draft.get("eventKind") || ""),
        note: String(draft.get("eventNotes") || ""),
        eventDate: String(draft.get("eventDate") || "")
      };
      if (!window.confirm("Il diario contiene una bozza. Vuoi salvare insieme, in un'unica operazione, le modifiche alla pianta e questa attività?")) return;
    }
  }
  const editor = document.querySelector("#plant-form");
  const expectedVersion = id && editBaseline?.id === id ? editBaseline.version : null;
  const shared = {
    species: {
      id: plant.speciesId, data: sharedProfileDraft("species", plant.name, "", plant),
      expectedVersion: editor?.dataset.speciesId === plant.speciesId
        ? editor.dataset.speciesVersion || null : null
    },
    cultivar: cultivarName ? {
      id: plant.cultivarId,
      data: sharedProfileDraft("cultivar", cultivarName, plant.speciesId, cultivarData),
      expectedVersion: editor?.dataset.cultivarId === plant.cultivarId
        ? editor.dataset.cultivarVersion || null : null
    } : null,
    lot: lotName ? {
      id: plant.lotId,
      data: { name: lotName, speciesId: plant.speciesId, sownOn: plant.sownOn,
        seedSourceCultivar: plant.seedSourceCultivar, sourceDetails: plant.sourceDetails }
    } : null
  };
  const controls = Array.from(editor?.querySelectorAll("input, select, textarea, button") || [])
    .map(control => ({ control, wasDisabled: control.disabled }));
  const button = editor?.querySelector('[type="submit"]');
  plantSaveInProgress = true;
  controls.forEach(({ control }) => { control.disabled = true; });
  if (button) button.textContent = "Salvataggio…";
  let completed = false;
  try {
    await savePlantRecord(firebase, { id, plant, expectedVersion, shared, pendingJournal });
    completed = true;
  } catch (err) {
    showFormError(err instanceof PlantConflictError || err instanceof JournalValidationError ||
      err instanceof SeedLotConflictError ? err.message :
      "Salvataggio non riuscito. I dati inseriti sono ancora nel modulo. Controlla la connessione e riprova.",
      err instanceof PlantConflictError);
  } finally {
    plantSaveInProgress = false;
    controls.forEach(({ control, wasDisabled }) => { if (control.isConnected) control.disabled = wasDisabled; });
    if (button?.isConnected) button.textContent = "Salva pianta";
    if (completed) {
      state.error = "";
      state.flash = pendingJournal
        ? "Pianta, schede botaniche e attività del diario salvate correttamente."
        : "Pianta e schede botaniche salvate correttamente.";
      formDirty = false; journalDirty = false;
      go("/admin/piante");
    }
  }
}

async function saveJournal(form, plantId) {
  if (journalSaveInProgress || !state.owner || !firebase ||
      !state.inventoryReady || !plantId || plantSaveInProgress) return;
  if (formDirty) {
    showFormError("Salva prima le modifiche alla scheda della pianta: il diario non è stato registrato e i dati nel modulo sono rimasti invariati.");
    return;
  }
  const note = String(form.get("eventNotes") || "").trim();
  const kind = String(form.get("eventKind") || "");
  const date = String(form.get("eventDate") || "");
  if (!journalKinds.includes(kind)) { showFormError("Tipo di attività non valido."); return; }
  const element = document.querySelector("#journal-form");
  const controls = Array.from(document.querySelectorAll(
    '#journal-form button[type="submit"], #plant-form button[type="submit"], [data-action="delete-plant"]'
  )).map(control => ({ control, disabled: control.disabled }));
  journalSaveInProgress = true;
  for (const { control } of controls) control.disabled = true;
  try {
    await saveJournalEntry(firebase, { plantId, kind, note, eventDate: date });
    journalDirty = false;
    if (element?.isConnected) {
      element.reset();
      const status = element.querySelector("[role='status']");
      if (status) status.textContent = "Attività registrata nel diario.";
    }
    renderUnlessEditing();
  } catch (err) {
    showFormError(err instanceof PlantConflictError ? err.message :
      "Attività non salvata. Controlla descrizione, data e connessione; i dati sono rimasti nel modulo.");
  } finally {
    journalSaveInProgress = false;
    for (const { control, disabled } of controls) {
      if (control.isConnected) control.disabled = disabled;
    }
  }
}
async function deletePlant(id) {
  if (journalSaveInProgress) {
    showFormError("È in corso il salvataggio del diario. Nessuna eliminazione eseguita.");
    return;
  }
  if (plantSaveInProgress || !firebase) return;
  if (!state.inventoryReady || state.inventoryError) {
    showFormError("Inventario non disponibile. Nessuna eliminazione eseguita: verifica la connessione e riprova.");
    return;
  }
  if (!window.confirm("Eliminare definitivamente questa pianta, le modifiche automatiche e la proiezione pubblica? Se il diario contiene osservazioni personali, l'eliminazione sarà bloccata per conservarle.")) return;
  const expectedVersion = editBaseline?.id === id ? editBaseline.version : null;
  const editor = document.querySelector("#plant-form");
  const controls = Array.from(editor?.querySelectorAll("input, select, textarea, button") || [])
    .map((control) => ({ control, wasDisabled: control.disabled }));
  plantSaveInProgress = true;
  controls.forEach(({ control }) => { control.disabled = true; });
  let completed = false;
  try {
    await deletePlantRecord(firebase, { id, expectedVersion });
    completed = true;
  } catch (err) {
    showFormError(err instanceof PlantConflictError || err instanceof PlantJournalRetentionError
      ? err.message : "Eliminazione non riuscita. La scheda non è stata modificata da questa operazione.",
      err instanceof PlantConflictError);
  } finally {
    plantSaveInProgress = false;
    controls.forEach(({ control, wasDisabled }) => { if (control.isConnected) control.disabled = wasDisabled; });
    if (completed) {
      state.error = "";
      state.flash = "Pianta eliminata.";
      formDirty = false;
      go("/admin/piante");
    }
  }
}
async function saveUsername(form) {
  const username = normalizeUsername(form.get("username"));
  if (!validUsername(username)) {
    state.error = "Nome utente non valido: usa 3–32 caratteri, lettere, numeri, punto, trattino o underscore.";
    render(); return;
  }
  try {
    const profileRef = firebase.doc(firebase.db, "adminProfiles", state.user.uid);
    const aliasRef = firebase.doc(firebase.db, "loginAliases", username);
    await firebase.runTransaction(firebase.db, async (tx) => {
      const [profile, target] = await Promise.all([tx.get(profileRef), tx.get(aliasRef)]);
      const old = profile.exists() ? profile.data().username : "";
      if (target.exists() && target.data().email !== state.user.email) {
        throw new Error("Alias già utilizzato.");
      }
      if (old && old !== username) {
        tx.delete(firebase.doc(firebase.db, "loginAliases", old));
      }
      tx.set(aliasRef, { email: state.user.email });
      tx.set(profileRef, { username });
    });
    state.username = username; state.error = ""; state.flash = "Nome utente aggiornato.";
    render();
  } catch {
    state.error = "Impossibile aggiornare il nome utente. Verifica le autorizzazioni e riprova.";
    render();
  }
}
async function handleClick(event) {
  const link = event.target.closest("a[data-nav]");
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
    event.preventDefault();
    go(link.getAttribute("href"));
    return;
  }
  if (event.target.closest("[data-toggle-menu]")) {
    state.menuOpen = !state.menuOpen;
    const opening = state.menuOpen;
    render();
    document.querySelector(opening ? "#primary-navigation a" : "[data-toggle-menu]")?.focus();
    return;
  }
  if (event.target.closest("[data-toggle-filters]")) {
    state.filtersOpen = !state.filtersOpen;
    render();
    document.querySelector("[data-toggle-filters]")?.focus();
    return;
  }
  const categoryButton = event.target.closest("[data-category-filter]");
  if (categoryButton) {
    const category = categoryButton.dataset.categoryFilter;
    if (!["Tutte", ...categories].includes(category)) return;
    state.category = category;
    state.group = "Tutte";
    state.fruitType = "Tutte";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    return;
  }
  const groupButton = event.target.closest("[data-group-filter]");
  if (groupButton) {
    const group = groupButton.dataset.groupFilter;
    if (!["Tutte", ...plantGroups].includes(group)) return;
    state.group = group;
    state.category = "Tutte";
    state.fruitType = "Tutte";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    return;
  }
  const fruitButton = event.target.closest("[data-fruit-filter]");
  if (fruitButton) {
    const type = fruitButton.dataset.fruitFilter;
    if (!["Tutte", ...fruitTypes].includes(type)) return;
    state.fruitType = type;
    state.group = "Piante da frutto";
    state.category = "Tutte";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    return;
  }
  if (event.target.closest("[data-reset-filters]")) {
    state.category = "Tutte";
    state.group = "Tutte";
    state.fruitType = "Tutte";
    state.minTempC = "";
    state.pollination = "Tutte";
    state.potSuitability = "Tutte";
    state.harvestMonth = "";
    state.filter = "";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    document.querySelector("#catalog-search-input")?.focus();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action?.dataset.action === "reload-editor" && state.owner && !plantSaveInProgress) {
    if (!confirmDiscard()) return;
    formDirty = false; journalDirty = false; state.error = ""; state.flash = "";
    render();
    return;
  }
  if (action?.dataset.action === "delete-plant" && state.owner && firebase) {
    await deletePlant(action.dataset.id);
  }
  if (action?.dataset.action === "logout" && firebase &&
      !plantSaveInProgress && !journalSaveInProgress && confirmDiscard()) {
    formDirty = false; journalDirty = false;
    await firebase.signOut(firebase.auth);
    state.flash = "Hai effettuato la disconnessione.";
    go("/login");
  }
}
function handleSubmit(event) {
  const form = event.target;
  if (!["search-form", "climate-form", "traits-form", "inventory-search-form", "login-form", "plant-form", "username-form", "journal-form"].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "search-form") {
    state.filter = String(data.get("q") || "").trim().slice(0, 120);
    syncCatalogUrl();
    render();
    return;
  }
  if (form.id === "climate-form") {
    const minimum = String(data.get("minimum") || "");
    state.minTempC = coldOptions.includes(minimum) ? minimum : "";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    return;
  }
  if (form.id === "traits-form") {
    const pollination = String(data.get("pollination") || "Tutte");
    const pot = String(data.get("potSuitability") || "Tutte");
    const month = String(data.get("harvestMonth") || "");
    state.pollination = ["Tutte", ...pollinationTypes].includes(pollination) ? pollination : "Tutte";
    state.potSuitability = ["Tutte", ...potSuitabilityTypes].includes(pot) ? pot : "Tutte";
    state.harvestMonth = /^(?:[1-9]|1[012])$/.test(month) ? month : "";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    return;
  }
  if (form.id === "inventory-search-form") {
    state.inventoryQuery = String(data.get("q") || "").trim();
    const group = String(data.get("group") || "Tutte");
    state.inventoryGroup = ["Tutte", ...plantGroups].includes(group) ? group : "Tutte";
    const visibility = String(data.get("visibility") || "Tutte");
    state.inventoryVisibility = ["Tutte", "Pubblicate", "Private"].includes(visibility) ? visibility : "Tutte";
    const stage = String(data.get("stage") || "Tutte");
    state.inventoryStage = ["Tutte", ...lifeStages].includes(stage) ? stage : "Tutte";
    render();
    return;
  }
  if (form.id === "login-form") return login(data);
  if (!state.owner || !firebase) return;
  if (form.id === "plant-form") return savePlant(data, form.dataset.id);
  if (form.id === "journal-form") return saveJournal(data, form.dataset.id);
  if (form.id === "username-form") return saveUsername(data);
}
function fillProfileFields(form, profile, cultivar = false) {
  const fields = cultivar
    ? ["fruitNotes", "minColdC", "coldSource", "coldNotes", "pollination"]
    : ["scientificName", "category", "fruitType", "growthHabit", "searchAliases",
      "origin", "light", "water", "description", "pollination", "potSuitability",
      "minColdC", "coldSource", "coldNotes"];
  for (const key of fields) {
    const name = cultivar ? "cultivar" + key[0].toUpperCase() + key.slice(1) : key;
    const control = form.elements.namedItem(name);
    if (control && "value" in control) control.value =
      profile?.[key] === null ? "" : profile?.[key] ?? "";
  }
  const name = cultivar ? "cultivarHarvestMonth" : "harvestMonth";
  const months = new Set(profile?.harvestMonths || []);
  form.querySelectorAll('input[name="' + name + '"]').forEach(input => {
    input.checked = months.has(Number(input.value));
  });
}
function updateSharedProfileWarnings(form) {
  const species = profileByName(state.profiles, "species",
    form.elements.namedItem("name")?.value);
  const cultivarName = form.elements.namedItem("cultivarName")?.value || "";
  const cultivar = species && cultivarName
    ? profileByName(state.profiles, "cultivar", cultivarName, species.id) : null;
  const changed = (profile, prefix, fields, monthField) => {
    if (!profile) return false;
    if (fields.some(name => {
      const key = prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
      const input = form.elements.namedItem(key);
      return input && String(input.value ?? "").trim() !== String(profile[name] ?? "").trim();
    })) return true;
    const months = [...form.querySelectorAll('input[name="' + monthField + '"]:checked')]
      .map(input => Number(input.value)).sort((a, b) => a - b);
    return JSON.stringify(months) !==
      JSON.stringify([...(profile.harvestMonths || [])].sort((a, b) => a - b));
  };
  const speciesChanged = species && form.dataset.speciesId === species.id &&
    changed(species, "", ["scientificName", "category", "fruitType", "growthHabit",
      "searchAliases", "origin", "light", "water", "description", "pollination",
      "potSuitability", "minColdC", "coldSource", "coldNotes"], "harvestMonth");
  const cultivarChanged = cultivar && form.dataset.cultivarId === cultivar.id &&
    changed(cultivar, "cultivar", ["fruitNotes", "minColdC", "coldSource",
      "coldNotes", "pollination"], "cultivarHarvestMonth");
  for (const [kind, show] of [["species", speciesChanged], ["cultivar", cultivarChanged]]) {
    const warning = form.querySelector('[data-shared-warning="' + kind + '"]');
    if (warning) warning.hidden = !show;
  }
}
function updateSpeciesStatus(form) {
  const indicator = form.querySelector("[data-species-status]");
  if (!indicator) return;
  const species = profileByName(state.profiles, "species",
    form.elements.namedItem("name")?.value);
  indicator.textContent = species
    ? "Specie registrata: informazioni botaniche recuperate."
    : form.elements.namedItem("name")?.value.trim()
      ? "Specie non registrata: verifica i dati botanici prima del salvataggio."
      : "";
}
function handlePlantSelection(event) {
  const form = event.target.closest?.("#plant-form");
  if (!form) return;
  if (event.target.name === "name") {
    const species = profileByName(state.profiles, "species", event.target.value);
    const oldId = form.dataset.speciesId;
    if (species) {
      event.target.value = species.name;
      fillProfileFields(form, species);
    }
    // Un nome ancora sconosciuto può essere una correzione lessicale: non
    // cancellare categoria e dati già compilati, né bloccare il salvataggio.
    form.dataset.speciesId = species?.id || "";
    form.dataset.speciesVersion = species?.__snapshotVersion || "";
    const choices = form.querySelector("#known-cultivars");
    if (choices) choices.innerHTML = state.profiles
      .filter(item => item.kind === "cultivar" && item.parentId === species?.id)
      .map(item => '<option value="' + escapeHtml(item.name) + '"></option>').join("");
    if (oldId !== (species?.id || "")) {
      const cultivar = form.elements.namedItem("cultivarName");
      if (cultivar) cultivar.value = "";
      fillProfileFields(form, null, true);
      form.dataset.cultivarId = ""; form.dataset.cultivarVersion = "";
    }
  }
  if (event.target.name === "cultivarName") {
    const speciesId = form.dataset.speciesId ||
      profileByName(state.profiles, "species", form.elements.namedItem("name")?.value)?.id ||
      taxonId("species", form.elements.namedItem("name")?.value);
    const cultivar = profileByName(state.profiles, "cultivar", event.target.value, speciesId);
    fillProfileFields(form, cultivar, true);
    form.dataset.cultivarId = cultivar?.id || "";
    form.dataset.cultivarVersion = cultivar?.__snapshotVersion || "";
  }
  if (event.target.name === "lotName") {
    const speciesId = form.dataset.speciesId ||
      taxonId("species", form.elements.namedItem("name")?.value);
    const lot = state.lots.find(item => item.speciesId === speciesId &&
      item.name.toLocaleLowerCase("it") ===
      event.target.value.trim().toLocaleLowerCase("it"));
    if (lot) for (const [key, value] of [
      ["sownOn", lot.sownOn], ["sourceDetails", lot.sourceDetails],
      ["seedSourceCultivar", lot.seedSourceCultivar]]) {
      const control = form.elements.namedItem(key);
      if (control && !control.value) control.value = value || "";
    }
  }
  if (event.target.name === "name") updateSpeciesStatus(form);
  if (event.target.name === "name" || event.target.name === "category") {
    const typeField = form.querySelector("[data-fruit-type-field]");
    if (typeField) typeField.hidden =
      groupForEditedPlant(form.elements.namedItem("category")?.value,
        form.dataset.id && editBaseline?.id === form.dataset.id ? editBaseline : null) !== "Piante da frutto";
  }
  updateSharedProfileWarnings(form);
}
function markPlantDirty(event) {
  if (event.target.closest?.("#plant-form")) formDirty = true;
  if (event.target.closest?.("#journal-form")) journalDirty = true;
}
function handlePopState() {
  if (plantSaveInProgress || journalSaveInProgress || !confirmDiscard()) {
    window.history.pushState({}, "", currentPath);
    return;
  }
  formDirty = false; journalDirty = false;
  currentPath = window.location.pathname + window.location.search;
  state.route = window.location.pathname;
  if (state.route === "/piante") readCatalogUrl();
  state.error = "";
  state.menuOpen = false;
  state.filtersOpen = false;
  render();
}
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", markPlantDirty);
document.addEventListener("input", event => {
  const form = event.target.closest?.("#plant-form");
  if (form) updateSharedProfileWarnings(form);
});
document.addEventListener("change", markPlantDirty);
document.addEventListener("change", handlePlantSelection);
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute("data-photo")) {
    event.target.parentElement.innerHTML = leafArt;
  }
}, true);
window.addEventListener("popstate", handlePopState);
window.addEventListener("beforeunload", (event) => {
  if (!formDirty && !journalDirty && !plantSaveInProgress && !journalSaveInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});
render();
startFirebase();
