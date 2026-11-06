import { firebaseConfig, firebaseConfigured } from "./config.js";
import { categories, plantGroups, fruitTypes, growthHabits, plantGroupOf, fruitTypeOf, coldMinimumOf, normalizeUsername, validUsername, safeImageUrl, escapeHtml, catalogProjection, validatePlant } from "./domain.js";
import { filterCatalog, filterInventory } from "./catalog.js";

const appRoot = document.querySelector("#app");
const h = escapeHtml;
const state = {
  route: window.location.pathname,
  menuOpen: false,
  catalog: [],
  inventory: [],
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
let currentPath = window.location.pathname + window.location.search;

const leafArt = `<svg viewBox="0 0 140 140" fill="none" aria-hidden="true"><path d="M67 128C67 84 83 54 106 17" stroke="#2f6b4c" stroke-width="3" stroke-linecap="round"/><path d="M72 100C37 106 19 86 17 57c29 0 55 14 55 43ZM85 65C82 30 106 11 132 9c0 29-16 54-47 56ZM66 119C34 134 12 119 6 97c27-5 49 0 60 22Z" fill="#3e7c55" stroke="#296543" stroke-width="2"/><path d="M71 100 26 66M86 64l36-44M64 118 17 104" stroke="#a2c5a0" stroke-width="2"/></svg>`;
const heroArt = `<svg class="botanical-art" viewBox="0 0 450 495" role="img" aria-label="Illustrazione botanica di una pianta in vaso">
<defs><linearGradient id="pot" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e6bf92"/><stop offset="1" stop-color="#b77e5f"/></linearGradient><linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b4cc96"/><stop offset="1" stop-color="#447a58"/></linearGradient></defs>
<ellipse cx="225" cy="466" rx="116" ry="13" fill="#0c281c" opacity=".4"/>
<path d="M220 345c-6-101-42-163-72-229M221 354c12-122 64-201 97-245M221 350c0-159-13-251-8-316M225 351c-32-87-105-122-149-131M218 345c45-82 92-125 147-137" stroke="#a7c091" stroke-width="8" stroke-linecap="round"/>
<path d="M153 139C78 157 47 97 46 44c60 4 113 38 107 95Z" fill="url(#leaf)"/><path d="M156 137 59 59" stroke="#c8daaf" stroke-width="3"/>
<path d="M201 165C125 127 126 49 147 16c57 26 88 84 54 149Z" fill="#8db276"/><path d="M201 163 157 38" stroke="#bed4a5" stroke-width="3"/>
<path d="M216 135C167 62 211 3 250 1c29 53 20 103-34 134Z" fill="#b4cc91"/><path d="M219 131 241 23" stroke="#e5eecb" stroke-width="3"/>
<path d="M287 170c-17-89 45-132 107-137-3 75-47 126-107 137Z" fill="#719f6e"/><path d="M290 165 374 55" stroke="#b7d4a0" stroke-width="3"/>
<path d="M318 245c-2-77 59-101 117-92-20 59-65 96-117 92Z" fill="#aac587"/><path d="M323 240 409 166" stroke="#d0e1b6" stroke-width="3"/>
<path d="M135 239C70 241 20 190 19 149c68-2 114 30 116 90Z" fill="#629568"/><path d="M130 234 36 161" stroke="#bbd4aa" stroke-width="3"/>
<path d="M181 288c-52 0-103-29-125-81 67-3 116 24 125 81Z" fill="#a5c88b"/><path d="M179 284 75 221" stroke="#d9e6bf" stroke-width="3"/>
<path d="M250 292c20-82 88-112 141-97-29 63-77 101-141 97Z" fill="#48815e"/><path d="M258 287 366 204" stroke="#a5ca9a" stroke-width="3"/>
<path d="M154 346h143l-21 109c-4 15-13 20-28 20h-48c-17 0-26-7-29-22l-17-107Z" fill="url(#pot)"/>
<ellipse cx="225" cy="346" rx="72" ry="15" fill="#edcf9f"/><ellipse cx="225" cy="346" rx="65" ry="10" fill="#684b36"/>
<path d="M174 377c5 37 12 59 19 73" stroke="#edcfaf" stroke-width="7" opacity=".45" stroke-linecap="round"/>
</svg>`;

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
const coldOptions = ["", "5", "0", "-3", "-5", "-10", "-15", "-20"];
function getColdFromUrl() {
  const value = new URLSearchParams(window.location.search).get("freddo") || "";
  return coldOptions.includes(value) ? value : "";
}
function readCatalogUrl() {
  state.category = getCategoryFromUrl();
  state.group = getGroupFromUrl();
  state.fruitType = getFruitTypeFromUrl();
  state.minTempC = getColdFromUrl();
  state.filter = new URLSearchParams(window.location.search).get("q")?.slice(0, 120) || "";
}
function syncCatalogUrl() {
  const params = new URLSearchParams();
  if (state.category !== "Tutte") params.set("categoria", state.category);
  if (state.group !== "Tutte") params.set("gruppo", state.group);
  if (state.fruitType !== "Tutte") params.set("tipo", state.fruitType);
  if (state.minTempC !== "") params.set("freddo", state.minTempC);
  if (state.filter) params.set("q", state.filter);
  const path = "/piante" + (params.size ? "?" + params.toString() : "");
  window.history.replaceState({}, "", path);
  currentPath = path;
}
function confirmDiscard() {
  return !formDirty || window.confirm("Hai modifiche non salvate. Vuoi uscire senza salvarle?");
}
function renderUnlessEditing() {
  if (formDirty && document.querySelector("#plant-form")) return;
  render();
}
function showFormError(message) {
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
  notice.scrollIntoView({ block: "nearest" });
}
function go(path) {
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
function nav(path, label, extra = "") {
  const active = state.route === path || (path === "/piante" && state.route.startsWith("/piante/"));
  return `<a href="${path}" data-nav class="nav-link ${active ? "active" : ""} ${extra}" ${active ? 'aria-current="page"' : ""}>${h(label)}</a>`;
}
function header() {
  return `<header class="site-header">
    <div class="container navbar">
      <a class="brand" href="/" data-nav aria-label="Piante, torna alla home"><span class="brand-symbol" aria-hidden="true">✳</span>Piante<span class="brand-dot">.</span></a>
      <button type="button" class="mobile-menu" data-toggle-menu aria-controls="primary-navigation" aria-expanded="${state.menuOpen}" aria-label="${state.menuOpen ? "Chiudi il menu" : "Apri il menu"}">
        <span class="menu-lines" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>Menu</span>
      </button>
      <nav id="primary-navigation" class="nav-links ${state.menuOpen ? "open" : ""}" aria-label="Navigazione principale">
        ${nav("/", "Home")}${nav("/piante", "Catalogo")}${nav("/chi-siamo", "Il vivaio")}${nav("/contatti", "Contatti")}
        <a href="${state.owner ? "/admin" : "/login"}" data-nav class="nav-cta">${state.owner ? "Apri gestionale" : "Area riservata"}</a>
      </nav>
    </div>
  </header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="container">
    <div class="footer-main">
      <div class="footer-intro">
        <a class="brand footer-brand" href="/" data-nav><span class="brand-symbol" aria-hidden="true">✳</span>Piante<span class="brand-dot">.</span></a>
        <p>Una collezione in crescita. Scopri le piante, le varietà e le loro caratteristiche.</p>
      </div>
      <nav class="footer-links" aria-label="Collegamenti nel footer">
        <a href="/piante" data-nav>Catalogo</a><a href="/chi-siamo" data-nav>Il vivaio</a>
        <a href="/contatti" data-nav>Contatti</a><a href="/login" data-nav>Area riservata</a>
      </nav>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} Piante</span><span>Coltiviamo la curiosità per la natura.</span></div>
  </div></footer>`;
}
function alertBox(message, error = false) {
  return message ? `<div class="notice ${error ? "error" : ""} flash" role="status">${h(message)}</div>` : "";
}
function shell(page) {
  const privatePage = state.route.startsWith("/admin") && state.owner;
  appRoot.innerHTML = `<a class="skip-link" href="#main">Vai al contenuto principale</a>` +
    (privatePage ? "" : header()) + `<main id="main">${page}</main>` +
    (privatePage ? "" : footer());
}
function imageMarkup(item, detail = false) {
  const url = safeImageUrl(item.imageUrl);
  return `<div class="${detail ? "detail-img" : "plant-img"}">${url
    ? `<img src="${h(url)}" alt="${h(item.name ? `Foto della pianta ${item.name}` : "Foto della pianta")}" loading="${detail ? "eager" : "lazy"}" decoding="async" data-photo>`
    : leafArt}</div>`;
}
function card(item) {
  return `<a class="plant-card" href="/piante/${encodeURIComponent(item.id)}" data-nav>
    ${imageMarkup(item)}
    <div class="plant-info">
      <span class="plant-category">${h(plantGroupOf(item) === "Piante da frutto" ? fruitTypeOf(item) : item.category || "Pianta")}</span>
      <h3 class="plant-name">${h(item.name)}</h3>
      <p class="plant-latin">${h(item.scientificName || item.variety || "")}</p>
      ${item.availability ? `<p class="plant-availability">${h(item.availability)}</p>` : ""}
      ${coldMinimumOf(item) !== null ? `<p class="plant-climate">Freddo indicativo: ${h(coldMinimumOf(item))} °C</p>` : ""}
      <div class="plant-bottom"><strong>${item.price ? h(item.price) : "Scopri la pianta"}</strong><span aria-hidden="true">↗</span></div>
    </div>
  </a>`;
}
function empty(message) {
  return `<div class="empty"><div class="empty-symbol">✳</div><h3>La collezione prende forma</h3>
    <p>${h(message)}</p></div>`;
}
function homepage() {
  const featured = filterCatalog(state.catalog).slice(0, 3);
  const photo = featured.find((item) => safeImageUrl(item.imageUrl)) || state.catalog.find((item) => safeImageUrl(item.imageUrl));
  const categoriesToShow = ["Piante da frutto", "Tropicali da frutto", "Agrumi", "Orto e tuberi"];
  return `<section class="hero">
    <div class="container hero-inner">
      <div class="hero-copy">
        <span class="eyebrow">Benvenuto nel nostro vivaio</span>
        <h1>La natura, <em>da coltivare.</em></h1>
        <p class="hero-lead">Scopri piante tropicali, agrumi e varietà botaniche: esplora il catalogo e trova le informazioni che cerchi.</p>
        <div class="hero-actions">
          <a href="/piante" data-nav class="btn btn-light">Esplora il catalogo <span aria-hidden="true">↗</span></a>
          <a href="/chi-siamo" data-nav class="btn btn-hero-outline">Scopri il vivaio</a>
        </div>
        <span class="hero-note">Specie e varietà in continua evoluzione</span>
      </div>
      <div class="hero-art" aria-label="Piante della collezione">
        <div class="hero-orbit" aria-hidden="true"></div><div class="hero-orbit two" aria-hidden="true"></div>
        ${photo ? `<div class="hero-photo-frame">${imageMarkup(photo, true)}</div>` : heroArt}
        <span class="hero-label">Piante · Natura · Scoperta</span>
      </div>
    </div>
  </section>
  <section class="section categories-section"><div class="container">
    <div class="section-heading"><div><span class="eyebrow">Trova la tua pianta</span><h2 class="section-title">Esplora per categoria</h2>
      <p class="section-sub">Dalle specie da frutto alle piante ornamentali: ogni varietà ha qualcosa da raccontare.</p></div>
      <a class="text-link" href="/piante" data-nav>Vedi tutto il catalogo <span aria-hidden="true">↗</span></a>
    </div>
    <div class="category-grid">${categoriesToShow.map((category, index) => {
      const byGroup = category === "Piante da frutto" || category === "Orto e tuberi";
      const representative = state.catalog.find((item) =>
        (byGroup ? plantGroupOf(item) === category : item.category === category) && safeImageUrl(item.imageUrl));
      const queryKey = byGroup ? "gruppo" : "categoria";
      return `<a class="category-tile category-tile-${index + 1}" href="/piante?${queryKey}=${encodeURIComponent(category)}" data-nav>
        <span class="category-media">${representative ? `<img src="${h(safeImageUrl(representative.imageUrl))}" alt="" loading="lazy" decoding="async" data-photo>` : leafArt}</span>
        <span class="category-copy"><strong>${h(category)}</strong><span aria-hidden="true">↗</span></span>
      </a>`;
    }).join("")}</div>
  </div></section>
  <section class="section section-soft"><div class="container">
    <div class="section-heading"><div><span class="eyebrow">La selezione</span><h2 class="section-title">Dal nostro catalogo</h2>
      <p class="section-sub">Una selezione delle piante attualmente pubblicate.</p></div>
      <a class="text-link" href="/piante" data-nav>Scopri tutte le piante <span aria-hidden="true">↗</span></a>
    </div>
    <div class="grid">${featured.length ? featured.map(card).join("") : empty("Le prime piante pubblicate compariranno qui.")}</div>
  </div></section>
  <section class="section"><div class="container">
    <div class="service-strip">
      <div class="service-item"><span class="service-icon" aria-hidden="true">✳</span><div><h3>Varietà da scoprire</h3><p>Esplora specie e caratteristiche nel catalogo.</p></div></div>
      <div class="service-item"><span class="service-icon" aria-hidden="true">☼</span><div><h3>Informazioni utili</h3><p>Esposizione, irrigazione e dettagli botanici.</p></div></div>
      <div class="service-item"><span class="service-icon" aria-hidden="true">↗</span><div><h3>Una collezione in crescita</h3><p>Nuove piante vengono aggiunte nel tempo.</p></div></div>
    </div>
  </div></section>
  ${banner()}`;
}
function banner() {
  return `<section class="banner"><div class="container banner-inner"><div>
    <span class="eyebrow">Hai trovato una pianta interessante?</span>
    <h2>Scopri di più sul vivaio.</h2><p>Visita la sezione contatti per gli aggiornamenti sui recapiti disponibili.</p></div>
    <a href="/contatti" data-nav class="btn btn-light">Informazioni e contatti <span aria-hidden="true">↗</span></a></div></section>`;
}
function pageHero(tag, title, intro) {
  return `<section class="page-hero"><div class="container"><span class="eyebrow">${h(tag)}</span>
    <h1>${h(title)}</h1><p>${h(intro)}</p></div></section>`;
}
function catalogPage() {
  const plants = filterCatalog(state.catalog, {
    query: state.filter, category: state.category, group: state.group,
    fruitType: state.fruitType, minTempC: state.minTempC
  });
  const hasFilters = Boolean(state.filter.trim()) || state.category !== "Tutte" ||
    state.group !== "Tutte" || state.fruitType !== "Tutte" || state.minTempC !== "";
  const groupFilters = ["Tutte", ...plantGroups].map((group) => `<button type="button"
    class="filter-option ${state.group === group ? "active" : ""}" data-group-filter="${h(group)}"
    aria-pressed="${state.group === group}">${h(group === "Tutte" ? "Tutte le piante" : group)}</button>`).join("");
  const fruitFilters = ["Tutte", ...fruitTypes].map((type) => `<button type="button"
    class="filter-option ${state.fruitType === type ? "active" : ""}" data-fruit-filter="${h(type)}"
    aria-pressed="${state.fruitType === type}">${h(type === "Tutte" ? "Tutte le fruttifere" : type)}</button>`).join("");
  const coldSelect = coldOptions.map((value) => `<option value="${value}" ${state.minTempC === value ? "selected" : ""}>
    ${value === "" ? "Qualsiasi temperatura" : "Fino a " + (Number(value) > 0 ? "+" : "") + value + " °C"}</option>`).join("");
  const filters = ["Tutte", ...categories].map((category) => `<button type="button"
      class="filter-option ${state.category === category ? "active" : ""}"
      data-category-filter="${h(category)}" aria-pressed="${state.category === category}">
      <span>${category === "Tutte" ? "Tutte le categorie" : h(category)}</span>
      ${state.category === category ? `<span aria-hidden="true">✓</span>` : ""}
    </button>`).join("");
  return pageHero("La collezione", "Catalogo piante",
    "Esplora le specie, le varietà e le informazioni disponibili per ogni pianta.") +
    `<section class="section catalog-section"><div class="container">
      ${alertBox(state.dbError, true)}
      <form id="search-form" class="catalog-search" role="search">
        <label class="sr-only" for="catalog-search-input">Cerca nel catalogo</label>
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input id="catalog-search-input" class="input" type="search" name="q"
          placeholder="Es. maracujà, avocado, Opuntia" value="${h(state.filter)}" maxlength="120" autocomplete="off">
        <button class="btn btn-primary" type="submit">Cerca</button>
      </form>
      <div class="catalog-toolbar">
        <button type="button" class="btn btn-outline mobile-filter-button"
          data-toggle-filters aria-controls="catalog-filters" aria-expanded="${state.filtersOpen}">
          Filtri ${hasFilters ? "· Attivi" : ""} <span aria-hidden="true">☰</span>
        </button>
        <span class="results" role="status">${plants.length} ${plants.length === 1 ? "pianta trovata" : "piante trovate"}</span>
        ${hasFilters ? `<button class="text-link reset-filters" type="button" data-reset-filters>Rimuovi filtri</button>` : ""}
      </div>
      <div class="catalog-layout">
        <aside id="catalog-filters" class="catalog-filters ${state.filtersOpen ? "open" : ""}" aria-label="Filtri del catalogo">
          <h2>Tipologia</h2>
          <div class="filter-options">${groupFilters}</div>
          <h2>Piante da frutto</h2>
          <div class="filter-options">${fruitFilters}</div>
          <h2>Resistenza al freddo</h2>
          <form id="climate-form" class="climate-form">
            <label for="climate-minimum">La pianta resiste almeno a</label>
            <select id="climate-minimum" name="minimum" class="select">${coldSelect}</select>
            <button class="btn btn-outline btn-small" type="submit">Applica temperatura</button>
            <small>Si considerano solo schede con una temperatura indicativa inserita. Le piante giovani e in vaso possono essere meno resistenti.</small>
          </form>
          <h2>Categorie specifiche</h2>
          <div class="filter-options">${filters}</div>
        </aside>
        <div class="catalog-content">
          ${hasFilters ? `<p class="filter-summary">
            ${state.group !== "Tutte" ? `<span class="filter-chip">${h(state.group)}</span>` : ""}
            ${state.fruitType !== "Tutte" ? `<span class="filter-chip">${h(state.fruitType)}</span>` : ""}
            ${state.category !== "Tutte" ? `<span class="filter-chip">${h(state.category)}</span>` : ""}
            ${state.minTempC !== "" ? `<span class="filter-chip">Almeno ${h(state.minTempC)} °C</span>` : ""}
            ${state.filter ? `<span class="filter-chip">Ricerca: ${h(state.filter)}</span>` : ""}
          </p>` : ""}
          <div class="grid catalog-grid">${plants.length ? plants.map(card).join("") :
            empty(state.catalog.length ? "Nessuna pianta corrisponde ai filtri. Prova a modificarli." :
              "Il catalogo si riempirà quando pubblicherai le prime piante dal gestionale.")}</div>
        </div>
      </div>
    </div></section>`;
}
function detailPage(id) {
  const item = state.catalog.find((plant) => plant.id === id);
  if (!item) return pageHero("Catalogo", "Pianta non trovata", "Questa pianta non è presente nel catalogo pubblico.") +
    `<section class="section"><div class="container"><a class="btn btn-primary" href="/piante" data-nav>Torna al catalogo</a></div></section>`;
  const properties = [
    ["Nome scientifico", item.scientificName], ["Varietà", item.variety],
    ["Categoria", item.category], ["Origine", item.origin],
    ["Esposizione", item.light], ["Irrigazione", item.water]
  ].filter(([,value]) => Boolean(value));
  return `<section class="section detail-section"><div class="container">
    <nav class="breadcrumbs" aria-label="Percorso"><a href="/piante" data-nav>Catalogo</a><span aria-hidden="true">/</span><span>${h(item.name)}</span></nav>
    <div class="detail">
      ${imageMarkup(item, true)}
      <div class="detail-info">
        <span class="eyebrow">${h(item.category || "Collezione")}</span>
        <h1>${h(item.name)}</h1>
        ${item.scientificName ? `<p class="plant-latin">${h(item.scientificName)}</p>` : ""}
        ${item.variety ? `<p class="detail-variety">Varietà: ${h(item.variety)}</p>` : ""}
        ${item.price || item.availability ? `<div class="product-availability">
          ${item.price ? `<div><span class="detail-label">Prezzo indicativo</span><strong class="detail-price">${h(item.price)}</strong></div>` : ""}
          ${item.availability ? `<div><span class="detail-label">Disponibilità</span><strong>${h(item.availability)}</strong></div>` : ""}
        </div>` : ""}
        <p class="detail-description">${h(item.description || "La scheda di questa pianta verrà arricchita con altre informazioni.")}</p>
        ${coldMinimumOf(item) !== null ? `<div class="climate-detail">
          <strong>Temperatura minima indicativa: ${h(coldMinimumOf(item))} °C</strong>
          <p>Dato orientativo per piante adulte acclimatate in piena terra. La resistenza dipende da durata del freddo, cultivar, esposizione e protezione.</p>
          ${item.coldNotes ? `<p>${h(item.coldNotes)}</p>` : ""}
          ${safeImageUrl(item.coldSource) ? `<a href="${h(safeImageUrl(item.coldSource))}" target="_blank" rel="noopener noreferrer">Consulta la fonte</a>` : ""}
        </div>` : ""}
        <a href="/contatti" data-nav class="btn btn-primary detail-contact">Informazioni e contatti <span aria-hidden="true">↗</span></a>
        ${properties.length ? `<section class="detail-properties"><h2>Caratteristiche della pianta</h2><dl class="specs">
          ${properties.map(([label,value]) => `<div class="spec-row"><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join("")}
        </dl></section>` : ""}
      </div>
    </div>
  </div></section>`;
}
function aboutPage() {
  return pageHero("Il progetto", "Chi siamo", "Una collezione in evoluzione, nata dalla passione per le piante.") +
    `<section class="section"><div class="container info-layout">
    <div><span class="eyebrow">La nostra storia</span><h2>Un progetto che cresce</h2>
    <p>Piante è uno spazio dedicato alla coltivazione e alla scoperta del mondo botanico. Qui raccogliamo le specie della nostra collezione e le loro caratteristiche.</p>
    <p>Il progetto è pensato per crescere insieme al vivaio, diventando un punto di riferimento per chi desidera conoscerne le piante.</p></div>
    <div class="info-panel"><span class="eyebrow">Piante · Vivaio</span>
    <h3>Radici, crescita, scoperta.</h3><p>Una vetrina che si arricchirà con ogni nuovo esemplare.</p></div>
    </div></section>`;
}
function contactPage() {
  return pageHero("Parliamone", "Contatti", "Per informazioni su piante, disponibilità e coltivazione.") +
    `<section class="section"><div class="container info-layout">
    <div><h2>Restiamo in contatto</h2>
    <p>Questa sezione sarà dedicata ai recapiti ufficiali del vivaio. Saranno aggiunti quando saranno disponibili e confermati.</p>
    <p>Nel frattempo puoi esplorare le schede delle piante nel nostro catalogo.</p>
    <a class="btn btn-primary" href="/piante" data-nav>Esplora il catalogo →</a></div>
    <div class="info-panel"><span class="eyebrow">Informazioni</span><h3>Contatti in preparazione</h3>
    <p>Nessun recapito è stato pubblicato senza autorizzazione.</p></div></div></section>`;
}
function loginPage() {
  if (state.owner) return `<section class="login-wrap"><div class="login-panel"><h1>Accesso effettuato</h1>
    <a href="/admin" data-nav class="btn btn-primary">Apri il gestionale →</a></div></section>`;
  return `<section class="login-wrap"><div class="login-panel"><span class="eyebrow">Accesso privato</span>
    <h1>Area riservata</h1><p class="section-sub" style="margin-bottom:26px">Accedi per gestire la tua collezione.</p>
    ${!firebaseConfigured ? alertBox("Firebase non è ancora configurato: completa src/config.js prima dell'accesso.", true) : ""}
    ${alertBox(state.error, true)}${alertBox(state.flash)}
    <form id="login-form"><label class="form-field"><span>Nome utente o email</span>
      <input class="input" type="text" name="identity" autocomplete="username" required></label>
      <label class="form-field"><span>Password</span>
      <input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary" style="width:100%" ${firebaseConfigured ? "" : "disabled"} type="submit">Accedi →</button>
    </form><p class="status" style="margin-top:17px">Solo gli account autorizzati possono accedere al gestionale.</p>
  </div></section>`;
}
function adminTabs() {
  const current = (path) => state.route === path ||
    (path === "/admin/piante" && state.route.startsWith("/admin/modifica/"));
  const adminLink = (path, label, symbol, className = "") =>
    `<a href="${path}" data-nav class="admin-link ${current(path) ? "active" : ""} ${className}"
      ${current(path) ? `aria-current="page"` : ""}>
      <span class="admin-link-icon" aria-hidden="true">${symbol}</span><span>${label}</span></a>`;
  return `<aside class="admin-sidebar">
    <a class="brand admin-brand" href="/admin" data-nav><span class="brand-symbol" aria-hidden="true">✳</span>Piante<span class="brand-dot">.</span></a>
    <span class="sidebar-label">GESTIONALE PRIVATO</span>
    <nav class="admin-side-links" aria-label="Navigazione gestionale">
      ${adminLink("/admin", "Panoramica", "⌂")}
      ${adminLink("/admin/piante", "Inventario", "❀")}
      ${adminLink("/admin/nuova", "Nuova pianta", "+")}
      ${adminLink("/admin/impostazioni", "Impostazioni", "⚙")}
    </nav>
    <div class="sidebar-bottom">
      <a href="/piante" data-nav class="admin-side-extra">↗ Visita il catalogo</a>
      <button type="button" data-action="logout" class="admin-side-extra">Esci dall'account</button>
    </div>
  </aside>
  <nav class="admin-bottom-nav" aria-label="Navigazione gestionale mobile">
    ${adminLink("/admin", "Home", "⌂")}
    ${adminLink("/admin/piante", "Piante", "❀")}
    ${adminLink("/admin/nuova", "Aggiungi", "+")}
    ${adminLink("/admin/impostazioni", "Altro", "⚙")}
  </nav>`;
}
function adminFrame(content, title, intro) {
  return `<div class="admin-shell">
    ${adminTabs()}
    <div class="admin-workspace">
      <div class="admin-topbar"><span>Gestione del vivaio</span><a href="/" data-nav>Apri il sito <span aria-hidden="true">↗</span></a></div>
      <header class="admin-header"><span class="eyebrow">IL TUO SPAZIO DI LAVORO</span>
        <h1>${h(title)}</h1><p>${h(intro)}</p></header>
      <div class="admin-body">${alertBox(state.error, true)}${alertBox(state.flash)}${content}</div>
    </div>
  </div>`;
}
function overviewPage() {
  const published = state.inventory.filter((plant) => plant.published).length;
  const recent = [...state.inventory].sort((a, b) =>
    (Number(b.updatedAt?.seconds) || 0) - (Number(a.updatedAt?.seconds) || 0)).slice(0, 5);
  return adminFrame(`
    <div class="dashboard-head">
      <div><h2>La tua collezione</h2><p>Gestisci le piante e scegli cosa mostrare nel catalogo pubblico.</p></div>
      <a href="/admin/nuova" data-nav class="btn btn-primary">+ Nuova pianta</a>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Totale piante</div><div class="stat-value">${state.inventory.length}</div></div>
      <div class="stat"><div class="stat-label">Pubblicate</div><div class="stat-value">${published}</div></div>
      <div class="stat"><div class="stat-label">Private</div><div class="stat-value">${state.inventory.length - published}</div></div>
    </div>
    <section class="panel recent-panel">
      <div class="panel-heading"><h2>Modificate di recente</h2><a href="/admin/piante" data-nav class="text-link">Apri inventario <span aria-hidden="true">↗</span></a></div>
      ${recent.length ? `<div class="recent-list">${recent.map((plant) => `
        <a href="/admin/modifica/${encodeURIComponent(plant.id)}" data-nav class="recent-row">
          ${imageMarkup(plant)}
          <span class="recent-name"><strong>${h(plant.name)}</strong><small>${h(plant.category || "")}</small></span>
          <span class="pill ${plant.published ? "" : "draft"}">${plant.published ? "Pubblica" : "Privata"}</span>
          <span class="recent-arrow" aria-hidden="true">↗</span>
        </a>`).join("")}</div>` : empty("Non hai ancora aggiunto piante. Inizia creando la tua prima scheda.") }
    </section>`,
    "Panoramica", `Benvenuto${state.username ? ", " + state.username : ""}. Qui trovi i dati essenziali della tua collezione.`);
}
function inventoryPage() {
  const plants = filterInventory(state.inventory, {
    query: state.inventoryQuery, visibility: state.inventoryVisibility, group: state.inventoryGroup
  });
  const rows = plants.map((plant) => `<tr>
    <td data-label="Pianta"><div class="inventory-name">
      ${imageMarkup(plant)}<div><strong>${h(plant.name)}</strong><small>${h(plant.scientificName || plant.variety || "")}</small></div>
    </div></td>
    <td data-label="Categoria">${h(plant.category || "—")}</td>
    <td data-label="Visibilità"><span class="pill ${plant.published ? "" : "draft"}">${plant.published ? "Pubblica" : "Privata"}</span></td>
    <td data-label="Azioni"><a class="btn btn-outline btn-small" data-nav href="/admin/modifica/${encodeURIComponent(plant.id)}">Modifica</a></td>
  </tr>`).join("");
  return adminFrame(`<section class="panel inventory-panel">
    <div class="panel-heading"><h2>Le tue piante</h2><a href="/admin/nuova" data-nav class="btn btn-primary btn-small">+ Nuova pianta</a></div>
    <form id="inventory-search-form" class="inventory-filters" role="search">
      <label class="sr-only" for="inventory-search-input">Cerca nel tuo inventario</label>
      <input id="inventory-search-input" class="input" type="search" name="q" value="${h(state.inventoryQuery)}" placeholder="Cerca una pianta" autocomplete="off">
      <label class="sr-only" for="inventory-group">Filtra per tipologia</label>
      <select id="inventory-group" class="select" name="group">
        ${["Tutte", ...plantGroups].map((value) => `<option value="${h(value)}" ${state.inventoryGroup === value ? "selected" : ""}>${h(value === "Tutte" ? "Tutte le tipologie" : value)}</option>`).join("")}
      </select>
      <label class="sr-only" for="inventory-visibility">Filtra per visibilità</label>
      <select id="inventory-visibility" class="select" name="visibility">
        ${["Tutte", "Pubblicate", "Private"].map((value) =>
          `<option value="${value}" ${state.inventoryVisibility === value ? "selected" : ""}>${value === "Tutte" ? "Tutte le piante" : value}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn-primary">Filtra</button>
    </form>
    <p class="results inventory-results" role="status">${plants.length} ${plants.length === 1 ? "risultato" : "risultati"}</p>
    ${state.inventory.length ? plants.length ?
      `<div class="table-scroll"><table class="inventory"><thead><tr>
        <th>Pianta</th><th>Categoria</th><th>Visibilità</th><th>Azioni</th>
      </tr></thead><tbody>${rows}</tbody></table></div>` :
      empty("Nessuna pianta corrisponde ai filtri selezionati.") :
      empty("Non hai ancora piante. Aggiungine una per iniziare.") }
    </section>`, "Inventario", "Tutte le tue piante, pubbliche e private, in un unico spazio.");
}
function inputField(label, name, value, opts = "") {
  return `<label class="form-field"><span>${h(label)}</span><input class="input" name="${name}" value="${h(value ?? "")}" ${opts}></label>`;
}
function textareaField(label, name, value, opts = "") {
  return `<label class="form-field"><span>${h(label)}</span><textarea class="textarea" name="${name}" ${opts}>${h(value || "")}</textarea></label>`;
}
function editPage(id) {
  const item = id ? state.inventory.find((plant) => plant.id === id) : null;
  if (id && !item) return adminFrame(
    `<div class="panel">Pianta non trovata. <a href="/admin/piante" data-nav class="text-link">Torna all'inventario</a></div>`,
    "Scheda non trovata", "La pianta non è presente nell'inventario.");
  const p = item || {};
  const selectedGroup = p.plantGroup || (id ? plantGroupOf(p) : "Piante da frutto");
  const selectedFruitType = p.fruitType || (id ? fruitTypeOf(p) : "Altre fruttifere");
  const groupSelect = `<label class="form-field"><span>Gruppo principale</span><select class="select" name="plantGroup">
    ${plantGroups.map((group) => `<option value="${h(group)}" ${selectedGroup === group ? "selected" : ""}>${h(group)}</option>`).join("")}
  </select></label>`;
  const fruitSelect = `<label class="form-field"><span>Tipo di fruttifera (se applicabile)</span><select class="select" name="fruitType">
    ${["", ...fruitTypes].map((type) => `<option value="${h(type)}" ${selectedFruitType === type ? "selected" : ""}>${h(type || "Non applicabile")}</option>`).join("")}
  </select></label>`;
  const habitSelect = `<label class="form-field"><span>Forma della pianta</span><select class="select" name="growthHabit">
    ${["", ...growthHabits].map((type) => `<option value="${h(type)}" ${p.growthHabit === type ? "selected" : ""}>${h(type || "Da indicare")}</option>`).join("")}
  </select></label>`;
  const select = `<label class="form-field"><span>Categoria</span><select class="select" name="category">
    ${categories.map((category) => `<option value="${h(category)}" ${(p.category || "Piante da frutto") === category ? "selected" : ""}>${h(category)}</option>`).join("")}
  </select></label>`;
  return adminFrame(`<form id="plant-form" class="panel editor-panel" data-id="${h(id || "")}">
    <div class="editor-heading"><div><h2>${id ? "Dettagli della pianta" : "Nuova scheda"}</h2>
      <p>Compila le informazioni e scegli se renderle visibili nel catalogo pubblico.</p></div>
      ${id && p.published ? `<a class="text-link" data-nav href="/piante/${encodeURIComponent(id)}">Vedi scheda pubblica ↗</a>` : ""}
    </div>
    <section class="editor-section">
      <div class="editor-section-heading"><span class="editor-step">01</span><div>
        <h3>Informazioni principali</h3><p>Identifica la pianta e la sua varietà.</p></div></div>
      <div class="form-grid">
        ${inputField("Nome comune *", "name", p.name, "required maxlength='100'")}
        ${inputField("Nome scientifico", "scientificName", p.scientificName, "maxlength='150'")}
        ${select}
        ${groupSelect}
        ${fruitSelect}
        ${habitSelect}
        ${inputField("Varietà", "variety", p.variety, "maxlength='150'")}
        <div class="full-width">${inputField("Altri nomi e sinonimi (separati da virgola)", "searchAliases", p.searchAliases, "maxlength='250' placeholder='Es. maracujà, frutto della passione'")}</div>
        ${inputField("Origine", "origin", p.origin, "maxlength='150'")}
      </div>
    </section>
    <section class="editor-section">
      <div class="editor-section-heading"><span class="editor-step">02</span><div>
        <h3>Informazioni per i visitatori</h3><p>Descrizione e caratteristiche che possono apparire online.</p></div></div>
      <div class="form-grid">
        ${inputField("Esposizione", "light", p.light, "placeholder='Es. pieno sole' maxlength='120'")}
        ${inputField("Irrigazione", "water", p.water, "placeholder='Es. moderata' maxlength='120'")}
        ${inputField("Disponibilità (facoltativa)", "availability", p.availability, "placeholder='Es. su richiesta' maxlength='120'")}
        ${inputField("Prezzo indicativo (facoltativo)", "price", p.price, "placeholder='Es. 15 €' maxlength='50'")}
        <div class="full-width">${textareaField("Descrizione pubblica", "description", p.description, "maxlength='3000'")}</div>
      </div>
    </section>
    <section class="editor-section">
      <div class="editor-section-heading"><span class="editor-step">03</span><div>
        <h3>Clima e resistenza al freddo</h3>
        <p>Facoltativo. Non assegnare valori presunti: il filtro pubblico utilizza solo soglie registrate.</p></div></div>
      <div class="form-grid">
        ${inputField("Temperatura minima indicativa (°C)", "minColdC", p.minColdC,
          "type='number' step='0.5' min='-40' max='25' inputmode='decimal' placeholder='Es. -3'")}
        ${inputField("Fonte HTTPS (facoltativa)", "coldSource", p.coldSource,
          "type='url' inputmode='url' placeholder='https://...'")}
        <div class="full-width">${textareaField("Note climatiche pubbliche", "coldNotes", p.coldNotes, "maxlength='250'")}</div>
      </div>
      <p class="climate-help">La soglia è orientativa per una pianta adulta acclimatata in piena terra e un episodio breve. Durata, vento, cultivar e coltivazione in vaso possono cambiare l'esito. Valori sconosciuti restano vuoti.</p>
    </section>
    <section class="editor-section">
      <div class="editor-section-heading"><span class="editor-step">04</span><div>
        <h3>Fotografia</h3><p>Inserisci l'indirizzo HTTPS diretto di un'immagine.</p></div></div>
      <div class="form-grid">
        <div class="full-width">${inputField("URL HTTPS della foto", "imageUrl", p.imageUrl, "type='url' inputmode='url' placeholder='https://...'")}</div>
      </div>
      ${p.imageUrl && safeImageUrl(p.imageUrl) ? `<div class="editor-photo">${imageMarkup(p)}</div>` : ""}
    </section>
    <section class="editor-section">
      <div class="editor-section-heading"><span class="editor-step">05</span><div>
        <h3>Visibilità e note riservate</h3><p>Le note private non vengono mai copiate nel catalogo pubblico.</p></div></div>
      <label class="visibility-toggle"><input type="checkbox" name="published" ${p.published ? "checked" : ""}>
        <span><strong>Pubblica nel catalogo</strong><small>Se disattivato, la scheda resta visibile solo nel gestionale.</small></span></label>
      ${textareaField("Note private (mai pubblicate)", "internalNotes", p.internalNotes, "maxlength='5000'")}
    </section>
    <div class="editor-actions">
      <button class="btn btn-primary" type="submit">Salva pianta</button>
      <a href="/admin/piante" data-nav class="btn btn-outline">Annulla</a>
    </div>
    ${id ? `<div class="editor-danger"><p>Per rimuovere definitivamente questa pianta dall'inventario e dal catalogo:</p>
      <button class="btn btn-danger" type="button" data-action="delete-plant" data-id="${h(id)}">Elimina pianta</button></div>` : ""}
  </form>`, id ? "Modifica pianta" : "Aggiungi pianta",
  "Aggiorna il catalogo e conserva i dettagli utili alla gestione del vivaio.");
}
function settingsPage() {
  return adminFrame(`<div class="panel" style="max-width:660px">
    <h2>Nome utente per l'accesso</h2><p class="section-sub" style="margin-bottom:25px">
      Imposta un nome utente da usare al posto dell'email nel modulo di accesso. La password continua a essere gestita da Firebase Authentication.</p>
    <p class="status">Email dell'account: <strong>${h(state.user?.email || "")}</strong></p>
    <form id="username-form" style="margin-top:22px"><label class="form-field"><span>Nome utente</span>
      <input class="input" name="username" value="${h(state.username)}" pattern="[a-zA-Z0-9._-]{3,32}" minlength="3" maxlength="32"
      autocomplete="off" required><small>Da 3 a 32 caratteri: lettere, numeri, punto, trattino e underscore.</small></label>
    <button type="submit" class="btn btn-primary">Salva nome utente</button></form>
    <div class="notice" style="margin-top:25px;margin-bottom:0">Chi conosce il nome utente può ricavare l'email dell'account usato per accedere. Se preferisci riservatezza, puoi continuare ad accedere soltanto con la tua email.</div>
    <div class="settings-logout"><button type="button" class="btn btn-outline" data-action="logout">Esci dall\u0027account</button></div>
    </div>`, "Impostazioni accesso", "Personalizza le credenziali di accesso al tuo gestionale.");
}
function adminPage() {
  if (!state.authReady) return `<div class="boot">Verifica autorizzazioni…</div>`;
  if (!state.owner) return loginPage();
  if (state.route === "/admin/nuova") return editPage("");
  if (state.route.startsWith("/admin/modifica/")) return editPage(decodeURIComponent(state.route.slice("/admin/modifica/".length)));
  if (state.route === "/admin/piante") return inventoryPage();
  if (state.route === "/admin/impostazioni") return settingsPage();
  return overviewPage();
}
function render() {
  const path = state.route;
  let page;
  if (path === "/") page = homepage();
  else if (path === "/piante") page = catalogPage();
  else if (path.startsWith("/piante/")) page = detailPage(decodeURIComponent(path.slice(8)));
  else if (path === "/chi-siamo") page = aboutPage();
  else if (path === "/contatti") page = contactPage();
  else if (path === "/login") page = loginPage();
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
      state.authReady = false; render();
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
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it")); renderUnlessEditing();
            }, () => { state.error = "Impossibile leggere l'inventario privato."; renderUnlessEditing(); });
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
      if (serial === authCheckSerial) { state.authReady = true; render(); }
    });
    render();
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
  if (plantSaveInProgress) return;
  const keys = ["name", "scientificName", "category", "variety", "origin", "availability", "light", "water", "price", "imageUrl", "description", "internalNotes", "plantGroup", "fruitType", "growthHabit", "searchAliases", "coldSource", "coldNotes"];
  const plant = Object.fromEntries(keys.map((key) => [key, String(form.get(key) || "").trim()]));
  plant.published = form.has("published");
  const coldRaw = String(form.get("minColdC") || "").trim();
  if (coldRaw) plant.minColdC = Number(coldRaw.replace(",", "."));
  const validation = validatePlant(plant);
  if (validation) { showFormError(validation); return; }
  const docId = id || firebase.doc(firebase.collection(firebase.db, "privatePlants")).id;
  const previous = state.inventory.find((p) => p.id === docId);
  const privateDoc = firebase.doc(firebase.db, "privatePlants", docId);
  const publicDoc = firebase.doc(firebase.db, "catalog", docId);
  const batch = firebase.writeBatch(firebase.db);
  batch.set(privateDoc, {
    ...plant, createdAt: previous?.createdAt || firebase.serverTimestamp(),
    updatedAt: firebase.serverTimestamp()
  });
  if (plant.published) batch.set(publicDoc, catalogProjection(plant));
  else batch.delete(publicDoc);
  const editor = document.querySelector("#plant-form");
  const controls = Array.from(editor?.querySelectorAll("input, select, textarea, button") || [])
    .map((control) => ({ control, wasDisabled: control.disabled }));
  const button = editor?.querySelector('[type="submit"]');
  plantSaveInProgress = true;
  controls.forEach(({ control }) => { control.disabled = true; });
  if (button) button.textContent = "Salvataggio…";
  try {
    await batch.commit();
    state.error = "";
    state.flash = "Pianta salvata correttamente.";
    formDirty = false;
    go("/admin/piante");
  } catch {
    showFormError("Salvataggio non riuscito. Controlla le autorizzazioni o la connessione.");
  } finally {
    plantSaveInProgress = false;
    controls.forEach(({ control, wasDisabled }) => { if (control.isConnected) control.disabled = wasDisabled; });
    if (button?.isConnected) button.textContent = "Salva pianta";
  }
}
async function deletePlant(id) {
  if (!window.confirm("Eliminare definitivamente questa pianta dall'inventario e dal catalogo pubblico?")) return;
  try {
    const batch = firebase.writeBatch(firebase.db);
    batch.delete(firebase.doc(firebase.db, "privatePlants", id));
    batch.delete(firebase.doc(firebase.db, "catalog", id));
    await batch.commit();
    state.error = ""; state.flash = "Pianta eliminata.";
    formDirty = false;
    go("/admin/piante");
  } catch {
    showFormError("Impossibile eliminare la pianta.");
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
    state.filter = "";
    state.filtersOpen = false;
    syncCatalogUrl();
    render();
    document.querySelector("#catalog-search-input")?.focus();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action?.dataset.action === "delete-plant" && state.owner && firebase) {
    await deletePlant(action.dataset.id);
  }
  if (action?.dataset.action === "logout" && firebase && confirmDiscard()) {
    formDirty = false;
    await firebase.signOut(firebase.auth);
    state.flash = "Hai effettuato la disconnessione.";
    go("/login");
  }
}
function handleSubmit(event) {
  const form = event.target;
  if (!["search-form", "climate-form", "inventory-search-form", "login-form", "plant-form", "username-form"].includes(form.id)) return;
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
function markPlantDirty(event) {
  if (event.target.closest?.("#plant-form")) formDirty = true;
}
function handlePopState() {
  if (!confirmDiscard()) {
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
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute("data-photo")) {
    event.target.parentElement.innerHTML = leafArt;
  }
}, true);
window.addEventListener("popstate", handlePopState);
window.addEventListener("beforeunload", (event) => {
  if (!formDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
render();
startFirebase();
