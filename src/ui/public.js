import { categories, plantGroups, fruitTypes, pollinationTypes, potSuitabilityTypes, monthNames, plantGroupOf, fruitTypeOf, coldMinimumOf, varietyLabel, specimenCodeOf, safeImageUrl, escapeHtml } from "../domain.js";
import { filterCatalog } from "../catalog.js";
import { firebaseConfigured } from "../config.js";
import { leafArt, heroArt } from "./artwork.js";

export function createPublicViews({ state, appRoot, coldOptions }) {
  const h = escapeHtml;

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
        <span class="plant-category">${h(item.category || "Pianta")}</span>
        <h3 class="plant-name plant-title-line"><span>${h(item.name)}</span><span class="specimen-code public-specimen-code">${h(specimenCodeOf(item))}</span></h3>
        ${item.scientificName ? `<p class="plant-latin">${h(item.scientificName)}</p>` : ""}
        ${varietyLabel(item) ? `<p class="plant-variety">${h(varietyLabel(item))}</p>` : ""}
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
      ${alertBox(state.dbError, true)}
      <div class="grid">${featured.length ? featured.map(card).join("") : empty(state.dbError
        ? "Il catalogo non è momentaneamente disponibile."
        : "Le prime piante pubblicate compariranno qui.")}</div>
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
      fruitType: state.fruitType, minTempC: state.minTempC,
      pollination: state.pollination, potSuitability: state.potSuitability,
      harvestMonth: state.harvestMonth
    });
    const hasFilters = Boolean(state.filter.trim()) || state.category !== "Tutte" ||
      state.group !== "Tutte" || state.fruitType !== "Tutte" || state.minTempC !== "" ||
      state.pollination !== "Tutte" || state.potSuitability !== "Tutte" || state.harvestMonth !== "";
    const groupFilters = ["Tutte", ...plantGroups].map((group) => `<button type="button"
      class="filter-option ${state.group === group ? "active" : ""}" data-group-filter="${h(group)}"
      aria-pressed="${state.group === group}">${h(group === "Tutte" ? "Tutte le piante" : group)}</button>`).join("");
    const fruitFilters = ["Tutte", ...fruitTypes].map((type) => `<button type="button"
      class="filter-option ${state.fruitType === type ? "active" : ""}" data-fruit-filter="${h(type)}"
      aria-pressed="${state.fruitType === type}">${h(type === "Tutte" ? "Tutte le fruttifere" : type)}</button>`).join("");
    const coldSelect = coldOptions.map((value) => `<option value="${value}" ${state.minTempC === value ? "selected" : ""}>
      ${value === "" ? "Qualsiasi temperatura" : "Fino a " + (Number(value) > 0 ? "+" : "") + value + " °C"}</option>`).join("");
    const pollinationOptions = ["Tutte", ...pollinationTypes].map((value) =>
      `<option value="${h(value)}" ${state.pollination === value ? "selected" : ""}>${h(value === "Tutte" ? "Qualsiasi / non specificata" : value)}</option>`).join("");
    const potOptions = ["Tutte", ...potSuitabilityTypes].map((value) =>
      `<option value="${h(value)}" ${state.potSuitability === value ? "selected" : ""}>${h(value === "Tutte" ? "Qualsiasi / non specificata" : value)}</option>`).join("");
    const harvestOptions = ["", ...monthNames.map((_, i) => String(i + 1))].map((value) =>
      `<option value="${value}" ${state.harvestMonth === value ? "selected" : ""}>${h(value === "" ? "Qualsiasi mese" : monthNames[Number(value) - 1])}</option>`).join("");
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
            <h2>Raccolta e impollinazione</h2>
            <form id="traits-form" class="climate-form">
              <label for="pollination-filter">Autofertilità</label>
              <select id="pollination-filter" name="pollination" class="select">${pollinationOptions}</select>
              <label for="harvest-filter">Mese di raccolta</label>
              <select id="harvest-filter" name="harvestMonth" class="select">${harvestOptions}</select>
              <label for="pot-filter">Coltivazione in vaso</label>
              <select id="pot-filter" name="potSuitability" class="select">${potOptions}</select>
              <button class="btn btn-outline btn-small" type="submit">Applica caratteristiche</button>
              <small>Mostriamo solo caratteristiche documentate. L'impollinazione, il raccolto e l'idoneità al vaso variano anche secondo la cultivar e il luogo.</small>
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
              ${state.pollination !== "Tutte" ? `<span class="filter-chip">${h(state.pollination)}</span>` : ""}
              ${state.harvestMonth !== "" ? `<span class="filter-chip">Raccolta: ${h(monthNames[Number(state.harvestMonth) - 1])}</span>` : ""}
              ${state.potSuitability !== "Tutte" ? `<span class="filter-chip">Vaso: ${h(state.potSuitability)}</span>` : ""}
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
      ["Nome scientifico", item.scientificName],
      ["Categoria", item.category],
      ["Tipologia fruttifera", plantGroupOf(item) === "Piante da frutto" ? item.fruitType : ""],
      ["Forma di crescita", item.growthHabit],
      ["Origine", item.origin],
      ["Esposizione", item.light], ["Irrigazione", item.water],
      ["Impollinazione", item.pollination], ["Coltivazione in vaso", item.potSuitability],
      ["Raccolta indicativa", Array.isArray(item.harvestMonths)
        ? item.harvestMonths.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
          .map((m) => monthNames[m - 1]).join(", ") : ""]
    ].filter(([,value]) => Boolean(value));
    return `<section class="section detail-section"><div class="container">
      <nav class="breadcrumbs" aria-label="Percorso"><a href="/piante" data-nav>Catalogo</a><span aria-hidden="true">/</span><span>${h(item.name)}</span></nav>
      <div class="detail">
        ${imageMarkup(item, true)}
        <div class="detail-info">
          <span class="eyebrow">${h(item.category || "Collezione")}</span>
          <h1 class="plant-title-line detail-title"><span>${h(item.name)}</span><span class="specimen-code public-specimen-code">${h(specimenCodeOf(item))}</span></h1>
          ${item.scientificName ? `<p class="plant-latin">${h(item.scientificName)}</p>` : ""}
          ${varietyLabel(item) ? `<p class="detail-variety">${h(varietyLabel(item))}</p>` : ""}
          ${item.fruitNotes ? `<p class="detail-description"><strong>Frutto della cultivar:</strong> ${h(item.fruitNotes)}</p>` : ""}
          ${item.price || item.availability ? `<div class="product-availability">
            ${item.price ? `<div><span class="detail-label">Prezzo indicativo</span><strong class="detail-price">${h(item.price)}</strong></div>` : ""}
            ${item.availability ? `<div><span class="detail-label">Disponibilità</span><strong>${h(item.availability)}</strong></div>` : ""}
          </div>` : ""}
          <p class="detail-description">${h(item.description || "La scheda di questa pianta verrà arricchita con altre informazioni.")}</p>
          ${coldMinimumOf(item) !== null || item.coldNotes || safeImageUrl(item.coldSource) ? `<div class="climate-detail">
            <strong>${coldMinimumOf(item) !== null
              ? `Temperatura minima indicativa: ${h(coldMinimumOf(item))} °C`
              : "Informazioni sulla resistenza al freddo"}</strong>
            ${coldMinimumOf(item) !== null ? `<p>Dato orientativo per piante adulte acclimatate in piena terra. La resistenza dipende da durata del freddo, cultivar, esposizione e protezione.</p>` : ""}
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

  return { shell, homepage, catalogPage, detailPage, aboutPage, contactPage, loginPage, pageHero, empty, alertBox, imageMarkup };
}
