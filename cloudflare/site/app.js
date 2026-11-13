"use strict";

const grid = document.getElementById("catalog-grid");
const status = document.getElementById("catalog-status");
const moreButton = document.getElementById("more-button");
const retryButton = document.getElementById("retry-button");
const dialog = document.getElementById("plant-dialog");
const dialogBody = document.getElementById("dialog-body");
const closeDialog = document.getElementById("close-dialog");
const filterForm = document.getElementById("catalog-filters");
const searchQuery = document.getElementById("search-query");
const categoryFilter = document.getElementById("category-filter");
const clearFilters = document.getElementById("clear-filters");
const categoryHint = document.getElementById("category-hint");

const state = {
  loading: false, items: [], nextCursor: null, hasLoaded: false,
  error: false, seenIds: new Set(), seenCursors: new Set(),
  applied: { q: "", category: "" }, revision: 0
};
let detailRequest = null;
let catalogRequest = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function httpsImageUrl(raw) {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function plantImage(record) {
  const wrapper = node("div", "plant-image");
  const imageUrl = httpsImageUrl(record.photo_url);
  if (!imageUrl) {
    wrapper.textContent = "Fotografia non disponibile";
    return wrapper;
  }
  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = "Fotografia di " + (text(record.taxon_name) || "pianta");
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    wrapper.replaceChildren(node("span", "", "Fotografia non disponibile"));
  }, { once: true });
  wrapper.append(image);
  return wrapper;
}

function botanicalName(record) {
  return [text(record.scientific_name), text(record.cultivar_name)].filter(Boolean).join(" · ");
}

function plantCard(record) {
  const article = node("article", "plant-card");
  const content = node("div", "plant-content");
  const title = node("h3", "", text(record.taxon_name) || "Nome non disponibile");
  content.append(title);
  const subtitle = botanicalName(record);
  if (subtitle) content.append(node("p", "plant-subtitle", subtitle));
  const category = text(record.category);
  if (category) content.append(node("p", "plant-subtitle", category));
  const description = text(record.summary) || text(record.taxon_description);
  if (description) content.append(node("p", "plant-description", description));
  if (text(record.code)) content.append(node("span", "plant-code", "#" + record.code));
  const details = node("button", "button button-secondary", "Dettagli");
  details.type = "button";
  details.setAttribute("aria-label", "Dettagli di " + (text(record.taxon_name) || "questa pianta"));
  details.addEventListener("click", () => showDetails(record.id));
  content.append(details);
  article.append(plantImage(record), content);
  return article;
}

function updateUi() {
  const showMore = state.hasLoaded && !state.error && Boolean(state.nextCursor);
  grid.setAttribute("aria-busy", String(state.loading));
  moreButton.hidden = !showMore;
  moreButton.disabled = state.loading;
  retryButton.hidden = !state.error;
  retryButton.disabled = state.loading;
  if (state.loading) status.textContent = state.items.length ? "Caricamento di altre piante…" : "Caricamento del catalogo…";
  else if (state.error) status.textContent = state.items.length
    ? "Non è stato possibile caricare altre piante. Puoi riprovare; quelle già caricate sono conservate."
    : "Il catalogo non è disponibile al momento. Riprova.";
  else if (!state.items.length && state.hasLoaded) status.textContent =
    state.applied.q || state.applied.category
      ? "Nessuna pianta corrisponde ai filtri applicati."
      : "Non ci sono ancora piante pubblicate.";
  else status.textContent = "";
}

async function loadPage() {
  if (state.loading || (state.hasLoaded && !state.error && !state.nextCursor)) return;
  const cursor = state.nextCursor;
  if (cursor && state.seenCursors.has(cursor)) {
    state.error = true;
    updateUi();
    return;
  }
  const revision = state.revision;
  const controller = new AbortController();
  catalogRequest = controller;
  state.loading = true;
  state.error = false;
  updateUi();
  try {
    const url = new URL("/api/v1/catalog", location.origin);
    url.searchParams.set("limit", "20");
    if (cursor) url.searchParams.set("cursor", cursor);
    if (state.applied.q) url.searchParams.set("q", state.applied.q);
    if (state.applied.category) url.searchParams.set("category", state.applied.category);
    const response = await fetch(url.href, {
      headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal
    });
    if (!response.ok) throw new Error("Catalog HTTP error");
    const body = await response.json();
    if (revision !== state.revision || controller.signal.aborted) return;
    if (!Array.isArray(body.items) ||
        !(body.nextCursor === null || typeof body.nextCursor === "string") ||
        body.items.some(item => !item || typeof item.id !== "string" || !item.id)) {
      throw new Error("Invalid catalog response");
    }
    if (body.nextCursor && (body.nextCursor === cursor || state.seenCursors.has(body.nextCursor))) {
      throw new Error("Repeated catalog cursor");
    }
    const added = [];
    for (const item of body.items) {
      if (!state.seenIds.has(item.id)) {
        state.seenIds.add(item.id);
        added.push(item);
      }
    }
    state.items.push(...added);
    for (const item of added) grid.append(plantCard(item));
    if (cursor) state.seenCursors.add(cursor);
    state.nextCursor = body.nextCursor;
    state.hasLoaded = true;
  } catch {
    if (revision === state.revision && !controller.signal.aborted) state.error = true;
  } finally {
    if (revision === state.revision) {
      state.loading = false;
      catalogRequest = null;
      updateUi();
    }
  }
}

// SQLite NOCASE only folds ASCII, so the selector must not merge Unicode categories.
function categoryKey(value) {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

function selectedCategory(value) {
  const match = Array.from(categoryFilter.options)
    .find(option => categoryKey(option.value) === categoryKey(value));
  if (value && !match) categoryFilter.add(new Option(value, value));
  categoryFilter.value = match ? match.value : value;
}

function filtersFromUrl() {
  const params = new URL(location.href).searchParams;
  return {
    q: (params.get("q") || "").trim().slice(0, 80),
    category: (params.get("category") || "").trim().slice(0, 120)
  };
}

function applyFilters(filters, { writeHistory = false, syncControls = false } = {}) {
  if (catalogRequest) catalogRequest.abort();
  state.revision++;
  state.loading = false;
  state.error = false;
  state.items = [];
  state.nextCursor = null;
  state.hasLoaded = false;
  state.seenIds.clear();
  state.seenCursors.clear();
  state.applied = { q: filters.q, category: filters.category };
  grid.replaceChildren();
  if (syncControls) {
    searchQuery.value = filters.q;
    selectedCategory(filters.category);
  }
  if (writeHistory) {
    const next = new URL(location.href);
    for (const key of ["q", "category"]) {
      if (filters[key]) next.searchParams.set(key, filters[key]);
      else next.searchParams.delete(key);
    }
    if (next.href !== location.href) history.pushState(null, "", next);
  }
  updateUi();
  loadPage();
}

async function loadCategories() {
  try {
    const response = await fetch("/api/v1/catalog/categories", {
      headers: { Accept: "application/json" }, cache: "no-store"
    });
    if (!response.ok) throw new Error("Categories HTTP error");
    const body = await response.json();
    if (!Array.isArray(body.categories) || body.categories.length > 200 ||
        body.categories.some(value => typeof value !== "string" || !value || value.length > 120)) {
      throw new Error("Invalid categories response");
    }
    // Preserve a category the user selected while the request was in flight.
    const selected = categoryFilter.value;
    const match = body.categories.find(category => categoryKey(category) === categoryKey(selected));
    const options = [new Option("Tutte le categorie", "")];
    for (const category of body.categories) options.push(new Option(category, category));
    if (selected && !match) options.push(new Option(selected, selected));
    categoryFilter.replaceChildren(...options);
    categoryFilter.value = match || selected;
    categoryHint.textContent = "";
  } catch {
    categoryHint.textContent = "Categorie non disponibili: la ricerca per nome rimane utilizzabile.";
  }
}

function detailField(label, value) {
  const valueText = text(value);
  if (!valueText) return null;
  const fragment = document.createDocumentFragment();
  fragment.append(node("p", "detail-label", label), node("p", "", valueText));
  return fragment;
}

async function showDetails(id) {
  if (detailRequest) detailRequest.abort();
  const controller = new AbortController();
  detailRequest = controller;
  dialogBody.replaceChildren(node("p", "", "Caricamento dettagli…"));
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch("/api/v1/catalog/" + encodeURIComponent(id), {
      signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Detail HTTP error");
    const item = await response.json();
    if (!item || item.id !== id) throw new Error("Invalid detail response");
    if (!dialog.open || controller.signal.aborted || detailRequest !== controller) return;
    const contents = document.createDocumentFragment();
    contents.append(plantImage(item), node("h3", "", text(item.taxon_name) || "Nome non disponibile"));
    for (const [label, value] of [
      ["Nome scientifico", item.scientific_name],
      ["Cultivar", item.cultivar_name],
      ["Categoria", item.category],
      ["Descrizione", item.summary || item.taxon_description],
      ["Caratteristiche del frutto", item.cultivar_fruit_notes],
      ["Crescita", item.growth_habit],
      ["Luce", item.light], ["Acqua", item.water],
      ["Codice identificativo", text(item.code) ? "#" + item.code : ""]
    ]) {
      const section = detailField(label, value);
      if (section) contents.append(section);
    }
    dialogBody.replaceChildren(contents);
  } catch {
    if (controller.signal.aborted || detailRequest !== controller) return;
    dialogBody.replaceChildren(node("p", "", "Impossibile caricare i dettagli. Chiudi e riprova."));
  }
}

moreButton.addEventListener("click", loadPage);
retryButton.addEventListener("click", loadPage);
filterForm.addEventListener("submit", event => {
  event.preventDefault();
  applyFilters({
    q: searchQuery.value.trim(),
    category: categoryFilter.value.trim()
  }, { writeHistory: true });
});
clearFilters.addEventListener("click", () => {
  applyFilters({ q: "", category: "" }, { writeHistory: true, syncControls: true });
});
window.addEventListener("popstate", () => {
  applyFilters(filtersFromUrl(), { syncControls: true });
});
closeDialog.addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (detailRequest) detailRequest.abort();
  detailRequest = null;
  dialogBody.replaceChildren();
});

applyFilters(filtersFromUrl(), { syncControls: true });
loadCategories();
