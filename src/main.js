import { firebaseConfig, firebaseConfigured } from "./config.js";
import { categories, plantGroups, fruitTypes, pollinationTypes, potSuitabilityTypes, plantPresets, groupForCategory, normalizeUsername, validUsername, validatePlant } from "./domain.js";
import { plantVersion, savePlantRecord, deletePlantRecord, PlantConflictError } from "./plant-store.js";
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
  inventoryReady: false,
  inventoryError: "",
  user: null,
  owner: false,
  authReady: !firebaseConfigured,
  username: "",
  error: "",
  flash: "",
  filter: new URLSearchParams(window.location.search).get("q")?.slice(0, 120) || "",
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
  return !formDirty || window.confirm("Hai modifiche non salvate. Vuoi uscire senza salvarle?");
}
function renderUnlessEditing() {
  if ((formDirty || plantSaveInProgress) && document.querySelector("#plant-form")) return;
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
    ["#inventory-visibility", state.inventoryVisibility],
    ["#inventory-search-input", state.inventoryQuery]
  ];
  if (pendingFilters.some(([selector, value]) => {
    const field = document.querySelector(selector);
    return field && field.value !== value;
  })) return;
  render();
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
  if (plantSaveInProgress) return false;
  const target = new URL(path, window.location.href);
  if (target.origin !== window.location.origin || !confirmDiscard()) return false;
  formDirty = false;
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
  const path = state.route;
  let page;
  if (path === "/") page = homepage();
  else if (path === "/piante") page = catalogPage();
  else if (path.startsWith("/piante/")) page = detailPage(decodeURIComponent(path.slice(8)));
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
    firebase.onSnapshot(firebase.collection(firebase.db, "catalog"), (snap) => {
      state.catalog = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it"));
      state.dbError = ""; renderUnlessEditing();
    }, () => { state.dbError = "Impossibile leggere il catalogo. Controlla le regole Firestore."; renderUnlessEditing(); });
    firebase.onAuthStateChanged(firebase.auth, async (user) => {
      const serial = ++authCheckSerial;
      if (privateListener) { privateListener(); privateListener = null; }
      state.user = user; state.owner = false; state.username = ""; state.inventory = [];
      state.inventoryReady = false; state.inventoryError = ""; editBaseline = null;
      state.authReady = false; renderAfterAuthChange();
      if (user) {
        try {
          const ownerDoc = await firebase.getDoc(firebase.doc(firebase.db, "siteOwner", "primary"));
          if (serial !== authCheckSerial) return;
          if (ownerDoc.exists() && ownerDoc.data().uid === user.uid) {
            state.owner = true;
            const profile = await firebase.getDoc(firebase.doc(firebase.db, "adminProfiles", user.uid));
            if (serial !== authCheckSerial) return;
            state.username = profile.exists() ? profile.data().username || "" : "";
            privateListener = firebase.onSnapshot(firebase.collection(firebase.db, "privatePlants"), (snap) => {
              state.inventory = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it"));
              state.inventoryReady = true; state.inventoryError = ""; renderUnlessEditing();
            }, () => { state.inventoryError = "Impossibile leggere l'inventario privato."; renderUnlessEditing(); });
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
    state.dbError = "Connessione Firebase non disponibile.";
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
  if (plantSaveInProgress || !firebase) return;
  if (!state.inventoryReady || state.inventoryError) {
    showFormError("Inventario non disponibile. I dati non sono stati salvati: verifica la connessione e riprova.");
    return;
  }
  const keys = ["name", "scientificName", "category", "variety", "origin", "availability", "light", "water", "price", "imageUrl", "description", "internalNotes", "fruitType", "growthHabit", "searchAliases", "coldSource", "coldNotes", "pollination", "potSuitability", "propagationMethod", "materialSource", "sourceDetails", "sownOn", "plantLocation", "specimenSex"];
  const plant = Object.fromEntries(keys.map((key) => [key, String(form.get(key) || "").trim()]));
  plant.plantGroup = groupForCategory(plant.category);
  if (plant.plantGroup !== "Piante da frutto") plant.fruitType = "";
  plant.published = form.has("published");
  plant.harvestMonths = [...new Set(form.getAll("harvestMonth").map(Number))].sort((a, b) => a - b);
  const coldRaw = String(form.get("minColdC") || "").trim();
  // null cancella anche un precedente valore: la scrittura privata usa update, non set.
  plant.minColdC = coldRaw ? Number(coldRaw.replace(",", ".")) : null;
  const validation = validatePlant(plant);
  if (validation) { showFormError(validation); return; }
  const expectedVersion = id && editBaseline?.id === id ? editBaseline.version : null;
  const editor = document.querySelector("#plant-form");
  const controls = Array.from(editor?.querySelectorAll("input, select, textarea, button") || [])
    .map((control) => ({ control, wasDisabled: control.disabled }));
  const button = editor?.querySelector('[type="submit"]');
  plantSaveInProgress = true;
  controls.forEach(({ control }) => { control.disabled = true; });
  if (button) button.textContent = "Salvataggio…";
  let completed = false;
  try {
    await savePlantRecord(firebase, { id, plant, expectedVersion });
    completed = true;
  } catch (err) {
    showFormError(err instanceof PlantConflictError ? err.message :
      "Salvataggio non riuscito. I dati inseriti sono ancora nel modulo. Controlla la connessione e riprova.",
      err instanceof PlantConflictError);
  } finally {
    plantSaveInProgress = false;
    controls.forEach(({ control, wasDisabled }) => { if (control.isConnected) control.disabled = wasDisabled; });
    if (button?.isConnected) button.textContent = "Salva pianta";
    if (completed) {
      state.error = "";
      state.flash = "Pianta salvata correttamente.";
      formDirty = false;
      go("/admin/piante");
    }
  }
}
async function deletePlant(id) {
  if (plantSaveInProgress || !firebase) return;
  if (!state.inventoryReady || state.inventoryError) {
    showFormError("Inventario non disponibile. Nessuna eliminazione eseguita: verifica la connessione e riprova.");
    return;
  }
  if (!window.confirm("Eliminare definitivamente questa pianta dall'inventario e dal catalogo pubblico?")) return;
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
    showFormError(err instanceof PlantConflictError ? err.message :
      "Eliminazione non riuscita. La scheda non è stata modificata da questa operazione.",
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
    formDirty = false; state.error = ""; state.flash = "";
    render();
    return;
  }
  if (action?.dataset.action === "delete-plant" && state.owner && firebase) {
    await deletePlant(action.dataset.id);
  }
  if (action?.dataset.action === "logout" && firebase && !plantSaveInProgress && confirmDiscard()) {
    formDirty = false;
    await firebase.signOut(firebase.auth);
    state.flash = "Hai effettuato la disconnessione.";
    go("/login");
  }
}
function handleSubmit(event) {
  const form = event.target;
  if (!["search-form", "climate-form", "traits-form", "inventory-search-form", "login-form", "plant-form", "username-form"].includes(form.id)) return;
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
    render();
    return;
  }
  if (form.id === "login-form") return login(data);
  if (!state.owner || !firebase) return;
  if (form.id === "plant-form") return savePlant(data, form.dataset.id);
  if (form.id === "username-form") return saveUsername(data);
}
function handlePlantSelection(event) {
  const form = event.target.closest?.("#plant-form");
  if (!form) return;
  if (event.target.name === "plantPreset") {
    const selected = plantPresets.find((preset) => preset.key === event.target.value);
    const previous = plantPresets.find((preset) => preset.key === event.target.dataset.previous);
    event.target.dataset.previous = selected?.key || "";
    if (selected) {
      for (const key of ["name", "scientificName", "category", "fruitType", "growthHabit"]) {
        const field = form.elements.namedItem(key);
        if (field && (!field.value || (previous && field.value === previous[key]))) {
          field.value = selected[key] || "";
        }
      }
    }
  }
  if (event.target.name === "plantPreset" || event.target.name === "category") {
    const typeField = form.querySelector("[data-fruit-type-field]");
    if (typeField) typeField.hidden =
      groupForCategory(form.elements.namedItem("category")?.value) !== "Piante da frutto";
  }
}
function markPlantDirty(event) {
  if (event.target.closest?.("#plant-form")) formDirty = true;
}
function handlePopState() {
  if (plantSaveInProgress || !confirmDiscard()) {
    window.history.pushState({}, "", currentPath);
    return;
  }
  formDirty = false;
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
document.addEventListener("change", markPlantDirty);
document.addEventListener("change", handlePlantSelection);
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute("data-photo")) {
    event.target.parentElement.innerHTML = leafArt;
  }
}, true);
window.addEventListener("popstate", handlePopState);
window.addEventListener("beforeunload", (event) => {
  if (!formDirty && !plantSaveInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});
render();
startFirebase();
