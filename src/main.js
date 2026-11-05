import { firebaseConfig, firebaseConfigured } from "./config.js";
import { categories, normalizeUsername, validUsername, safeImageUrl, escapeHtml, displayText, catalogProjection, validatePlant } from "./domain.js";

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
  filter: "",
  category: "Tutte",
  dbError: ""
};
let firebase = null;
let privateListener = null;
let authCheckSerial = 0;

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

function go(path) {
  window.history.pushState({}, "", path);
  state.route = path;
  state.menuOpen = false;
  state.error = "";
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}
function nav(path, label, extra = "") {
  const active = state.route === path || (path === "/piante" && state.route.startsWith("/piante/"));
  return `<a href="${path}" data-nav class="nav-link ${active ? "active" : ""} ${extra}">${h(label)}</a>`;
}
function header() {
  return `<header class="site-header"><div class="container navbar">
    <a class="brand" href="/" data-nav><span class="brand-symbol">✳</span>Piante<span style="color:#89a18a">.</span></a>
    <button type="button" class="btn btn-outline btn-small mobile-menu" data-toggle-menu aria-expanded="${state.menuOpen}" aria-label="Apri menu">Menu ☰</button>
    <nav class="nav-links ${state.menuOpen ? "open" : ""}" aria-label="Navigazione principale">
      ${nav("/", "Home")}${nav("/piante", "Piante")}${nav("/chi-siamo", "Chi siamo")}${nav("/contatti", "Contatti")}
      <a href="${state.owner ? "/admin" : "/login"}" data-nav class="btn btn-primary btn-small nav-cta">${state.owner ? "Gestionale" : "Area riservata"}</a>
    </nav></div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="container"><div class="footer-main">
    <div><a class="brand footer-brand" href="/" data-nav><span class="brand-symbol">✳</span>Piante.</a>
      <p style="font-size:12px;margin:18px 0 0">La tua collezione botanica, una pianta alla volta.</p></div>
    <div class="footer-links"><a href="/piante" data-nav>Catalogo</a><a href="/chi-siamo" data-nav>Chi siamo</a>
      <a href="/contatti" data-nav>Contatti</a><a href="/login" data-nav>Accesso</a></div>
    </div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Piante. Tutti i diritti riservati.</span><span>Coltivato con cura</span></div></div></footer>`;
}
function alertBox(message, error = false) {
  return message ? `<div class="notice ${error ? "error" : ""} flash" role="status">${h(message)}</div>` : "";
}
function shell(page) {
  appRoot.innerHTML = header() + `<main id="main">${page}</main>` + footer();
}
function imageMarkup(item, detail = false) {
  const url = safeImageUrl(item.imageUrl);
  return `<div class="${detail ? "detail-img" : "plant-img"}">${url
    ? `<img src="${h(url)}" alt="Foto di ${h(item.name)}" loading="lazy" data-photo>`
    : leafArt}</div>`;
}
function card(item) {
  return `<a class="plant-card" href="/piante/${encodeURIComponent(item.id)}" data-nav>
    ${imageMarkup(item)}<div class="plant-info"><div class="plant-category">${h(item.category || "Pianta")}</div>
      <h3 class="plant-name">${h(item.name)}</h3><div class="plant-latin">${h(item.scientificName || " ")}</div>
      <div class="plant-bottom"><span>${h(item.variety || "Scopri la pianta")}</span><strong>Dettagli →</strong></div>
    </div></a>`;
}
function empty(message) {
  return `<div class="empty"><div class="empty-symbol">✳</div><h3>La collezione prende forma</h3>
    <p>${h(message)}</p></div>`;
}
function homepage() {
  const featured = state.catalog.slice(0, 3);
  return `<section class="hero"><div class="container hero-inner">
    <div class="hero-copy"><div class="eyebrow">Una passione che cresce</div>
      <h1>La natura,<br><em>una pianta</em><br>alla volta.</h1>
      <p class="hero-lead">Un luogo per conoscere, osservare e scoprire piante speciali. Esplora il catalogo e segui la crescita della nostra collezione botanica.</p>
      <div class="hero-actions"><a href="/piante" data-nav class="btn btn-light">Esplora le piante <span>→</span></a>
      <a href="/chi-siamo" data-nav class="btn btn-outline" style="color:#fff;border-color:#7e9b84">La nostra storia</a></div>
    </div><div class="hero-art"><div class="hero-orbit"></div><div class="hero-orbit two"></div>
      <span class="hero-number">01 / Natura</span>${heroArt}<span class="hero-label">Growing collection</span>
    </div></div></section>
    <section class="section"><div class="container">
      <div class="section-heading"><div><span class="eyebrow">Dal nostro catalogo</span>
        <h2 class="section-title">Piante da scoprire</h2><p class="section-sub">Ogni pianta ha una storia e caratteristiche uniche.</p></div>
        <a class="text-link" href="/piante" data-nav>Vedi tutto il catalogo →</a></div>
      <div class="grid">${featured.length ? featured.map(card).join("") : empty("Quando verranno pubblicate le prime piante, compariranno qui.")}</div>
    </div></section>
    <section class="section section-soft"><div class="container"><span class="eyebrow">Il nostro approccio</span>
      <h2 class="section-title">Passione per il verde</h2>
      <div class="features">
        <div class="feature"><div class="feature-icon">✳</div><h3>Collezione botanica</h3><p>Uno spazio dedicato alle specie, alle varietà e alle loro caratteristiche.</p></div>
        <div class="feature"><div class="feature-icon">☼</div><h3>Informazioni utili</h3><p>Schede con descrizioni e indicazioni per conoscere meglio ogni esemplare.</p></div>
        <div class="feature"><div class="feature-icon">↗</div><h3>In continua crescita</h3><p>Il catalogo si arricchisce nel tempo, seguendo l'evoluzione del vivaio.</p></div>
      </div></div></section>
    ${banner()}`;
}
function banner() {
  return `<section class="banner"><div class="container banner-inner"><div>
    <span class="eyebrow" style="color:#bdd0a8">Resta in contatto</span>
    <h2>Hai una domanda sulle piante?</h2><p>Contattaci per informazioni sulla collezione.</p></div>
    <a href="/contatti" data-nav class="btn btn-light">Vai ai contatti →</a></div></section>`;
}
function pageHero(tag, title, intro) {
  return `<section class="page-hero"><div class="container"><span class="eyebrow">${h(tag)}</span>
    <h1>${h(title)}</h1><p>${h(intro)}</p></div></section>`;
}
function catalogPage() {
  const q = state.filter.toLocaleLowerCase("it").trim();
  const plants = state.catalog.filter((item) => {
    const matches = [item.name, item.scientificName, item.variety, item.category]
      .some((s) => String(s || "").toLocaleLowerCase("it").includes(q));
    return matches && (state.category === "Tutte" || item.category === state.category);
  });
  const options = ["Tutte", ...categories].map((c) => `<option value="${h(c)}" ${state.category === c ? "selected" : ""}>${h(c)}</option>`).join("");
  return pageHero("La collezione", "Le nostre piante", "Esplora le specie presenti nel catalogo e scopri le caratteristiche di ogni pianta.") +
    `<section class="section"><div class="container">${alertBox(state.dbError, true)}
      <form id="search-form" class="toolbar" role="search">
        <input class="input search-field" type="search" name="q" placeholder="Cerca nome, specie, varietà…" value="${h(state.filter)}" aria-label="Cerca piante">
        <select class="select" name="category" aria-label="Categoria" style="max-width:215px">${options}</select>
        <button class="btn btn-primary" type="submit">Cerca</button>
        <span class="results">${plants.length} ${plants.length === 1 ? "pianta" : "piante"}</span>
      </form><div class="grid">${plants.length ? plants.map(card).join("") : empty(state.catalog.length ? "Nessuna pianta corrisponde ai filtri selezionati." : "Le piante pubblicate saranno visibili in questa pagina.")}</div>
    </div></section>`;
}
function detailPage(id) {
  const item = state.catalog.find((p) => p.id === id);
  if (!item) return pageHero("Catalogo", "Pianta non trovata", "Questa pianta non è presente nel catalogo pubblico.") +
    `<section class="section"><div class="container"><a class="btn btn-primary" href="/piante" data-nav>Torna al catalogo</a></div></section>`;
  const properties = [
    ["Nome scientifico", item.scientificName], ["Varietà", item.variety],
    ["Categoria", item.category], ["Origine", item.origin],
    ["Esposizione", item.light], ["Irrigazione", item.water],
    ["Disponibilità", item.availability], ["Prezzo indicativo", item.price]
  ].filter(([, val]) => Boolean(val));
  return `<section class="section"><div class="container">
    <a class="text-link" href="/piante" data-nav>← Torna alle piante</a>
    <div class="detail" style="margin-top:31px">${imageMarkup(item, true)}
    <div><span class="eyebrow">${h(item.category || "Collezione")}</span>
      <h1>${h(item.name)}</h1><p class="plant-latin">${h(item.scientificName || "")}</p>
      <p class="detail-description">${h(item.description || "La scheda di questa pianta verrà arricchita con ulteriori informazioni.")}</p>
      <div class="specs">${properties.map(([k, v]) => `<div class="spec-row"><span>${h(k)}</span><strong>${h(v)}</strong></div>`).join("")}</div>
      <a href="/contatti" data-nav class="btn btn-primary">Richiedi informazioni →</a>
    </div></div></div></section>`;
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
  return `<div class="container"><nav class="admin-nav" aria-label="Gestionale">
    <a class="admin-tab ${state.route === "/admin" ? "active" : ""}" href="/admin" data-nav>Panoramica</a>
    <a class="admin-tab ${state.route.startsWith("/admin/piante") ? "active" : ""}" href="/admin/piante" data-nav>Inventario</a>
    <a class="admin-tab ${state.route.includes("/impostazioni") ? "active" : ""}" href="/admin/impostazioni" data-nav>Impostazioni accesso</a>
  </nav></div>`;
}
function adminFrame(content, title, intro) {
  return `<div class="admin-shell"><div class="admin-header"><div class="container"><span class="eyebrow">Gestionale privato</span>
    <h1>${h(title)}</h1><p>${h(intro)}</p></div></div>${adminTabs()}
    <div class="container admin-body">${alertBox(state.error, true)}${alertBox(state.flash)}${content}</div></div>`;
}
function overviewPage() {
  const published = state.inventory.filter((p) => p.published).length;
  return adminFrame(`<div class="stat-grid">
    <div class="stat"><div class="stat-label">Totale piante</div><div class="stat-value">${state.inventory.length}</div></div>
    <div class="stat"><div class="stat-label">Pubblicate</div><div class="stat-value">${published}</div></div>
    <div class="stat"><div class="stat-label">Private</div><div class="stat-value">${state.inventory.length - published}</div></div>
  </div><div class="panel"><h2>La tua collezione</h2>
  <p class="section-sub">Gestisci gli esemplari, conserva le note riservate e scegli quali piante pubblicare nella vetrina.</p>
  <div class="admin-actions"><a href="/admin/nuova" data-nav class="btn btn-primary">+ Aggiungi pianta</a>
    <a href="/admin/piante" data-nav class="btn btn-outline">Apri inventario →</a>
    <a href="/piante" data-nav class="btn btn-outline">Visita il catalogo</a></div></div>`,
    "Panoramica", `Benvenuto${state.username ? ", " + state.username : ""}. Ecco lo stato della tua collezione.`);
}
function inventoryPage() {
  const rows = state.inventory.map((p) => `<tr>
    <td><strong>${h(p.name)}</strong><br><span class="status">${h(p.scientificName || "")}</span></td>
    <td>${h(p.category || "—")}</td>
    <td><span class="pill ${p.published ? "" : "draft"}">${p.published ? "Pubblica" : "Privata"}</span></td>
    <td><a class="btn btn-outline btn-small" data-nav href="/admin/modifica/${encodeURIComponent(p.id)}">Modifica</a></td>
  </tr>`).join("");
  return adminFrame(`<div class="panel"><div class="section-heading"><h2 style="margin:0">Tutte le piante</h2>
    <a href="/admin/nuova" data-nav class="btn btn-primary btn-small">+ Nuova pianta</a></div>
    ${state.inventory.length ? `<div class="table-scroll"><table class="inventory"><thead><tr><th>Pianta</th><th>Categoria</th><th>Visibilità</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : empty("Non hai ancora aggiunto piante al gestionale.")}</div>`,
    "Inventario", "Tutti i tuoi esemplari, pubblici e privati, in un unico posto.");
}
function inputField(label, name, value, opts = "") {
  return `<label class="form-field"><span>${h(label)}</span><input class="input" name="${name}" value="${h(value || "")}" ${opts}></label>`;
}
function textareaField(label, name, value, opts = "") {
  return `<label class="form-field"><span>${h(label)}</span><textarea class="textarea" name="${name}" ${opts}>${h(value || "")}</textarea></label>`;
}
function editPage(id) {
  const item = id ? state.inventory.find((p) => p.id === id) : null;
  if (id && !item) return adminFrame(`<div class="panel">Pianta non trovata. <a href="/admin/piante" data-nav class="text-link">Torna all'inventario</a></div>`, "Scheda non trovata", "La pianta non è presente nell'inventario.");
  const p = item || {};
  const select = `<label class="form-field"><span>Categoria</span><select class="select" name="category">
    ${categories.map((c) => `<option ${(p.category || "Tropicali da frutto") === c ? "selected" : ""} value="${h(c)}">${h(c)}</option>`).join("")}
    </select></label>`;
  return adminFrame(`<form class="panel" id="plant-form" data-id="${h(id || "")}">
    <h2>${id ? "Modifica la pianta" : "Nuova pianta"}</h2><div class="form-grid">
    ${inputField("Nome comune *", "name", p.name, "required maxlength='100'")}
    ${inputField("Nome scientifico", "scientificName", p.scientificName, "maxlength='150'")}
    ${select}${inputField("Varietà", "variety", p.variety, "maxlength='150'")}
    ${inputField("Origine", "origin", p.origin, "maxlength='150'")}
    ${inputField("Disponibilità (facoltativa)", "availability", p.availability, "placeholder='Es. disponibile su richiesta' maxlength='120'")}
    ${inputField("Esposizione", "light", p.light, "placeholder='Es. pieno sole' maxlength='120'")}
    ${inputField("Irrigazione", "water", p.water, "placeholder='Es. moderata' maxlength='120'")}
    ${inputField("Prezzo indicativo (facoltativo)", "price", p.price, "placeholder='Es. 15 €' maxlength='50'")}
    ${inputField("URL HTTPS della foto", "imageUrl", p.imageUrl, "type='url' placeholder='https://...'")}
    <div class="full-width">${textareaField("Descrizione pubblica", "description", p.description, "maxlength='3000'")}</div>
    <div class="full-width">${textareaField("Note private (mai pubblicate)", "internalNotes", p.internalNotes, "maxlength='5000'")}</div>
    <label class="form-field full-width"><input type="checkbox" name="published" ${p.published ? "checked" : ""}>
      <span style="display:inline;margin-left:8px">Mostra nel catalogo pubblico</span>
      <small>Quando disattivato, la pianta resta nell'inventario ma non è visibile ai visitatori.</small></label>
    </div><div class="admin-actions"><button class="btn btn-primary" type="submit">Salva pianta</button>
      <a class="btn btn-outline" href="/admin/piante" data-nav>Annulla</a>
      ${id ? `<button type="button" data-action="delete-plant" data-id="${h(id)}" class="btn btn-danger">Elimina definitivamente</button>` : ""}
    </div></form>`, id ? "Modifica pianta" : "Aggiungi pianta", "Tieni aggiornati i dettagli pubblici e le tue note riservate.");
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
        .sort((a, b) => a.name.localeCompare(b.name, "it"));
      state.dbError = ""; render();
    }, () => { state.dbError = "Impossibile leggere il catalogo. Controlla le regole Firestore."; render(); });
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
                .sort((a, b) => a.name.localeCompare(b.name, "it")); render();
            }, () => { state.error = "Impossibile leggere l'inventario privato."; render(); });
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
  const keys = ["name", "scientificName", "category", "variety", "origin", "availability", "light", "water", "price", "imageUrl", "description", "internalNotes"];
  const plant = Object.fromEntries(keys.map((key) => [key, String(form.get(key) || "").trim()]));
  plant.published = form.has("published");
  const validation = validatePlant(plant);
  if (validation) { state.error = validation; render(); return; }
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
  try {
    await batch.commit();
    state.error = ""; state.flash = "Pianta salvata correttamente.";
    go("/admin/piante");
  } catch {
    state.error = "Salvataggio non riuscito. Controlla le autorizzazioni o la connessione.";
    render();
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
    go("/admin/piante");
  } catch {
    state.error = "Impossibile eliminare la pianta.";
    render();
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
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-nav]");
  if (link) { event.preventDefault(); go(link.getAttribute("href")); return; }
  if (event.target.closest("[data-toggle-menu]")) {
    state.menuOpen = !state.menuOpen; render(); return;
  }
  const action = event.target.closest("[data-action]");
  if (action?.dataset.action === "delete-plant" && state.owner && firebase) {
    await deletePlant(action.dataset.id);
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!["search-form", "login-form", "plant-form", "username-form"].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "search-form") {
    state.filter = String(data.get("q") || "");
    state.category = String(data.get("category") || "Tutte");
    render(); return;
  }
  if (form.id === "login-form") return login(data);
  if (!state.owner || !firebase) return;
  if (form.id === "plant-form") return savePlant(data, form.dataset.id);
  if (form.id === "username-form") return saveUsername(data);
});
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute("data-photo")) {
    event.target.parentElement.innerHTML = leafArt;
  }
}, true);
window.addEventListener("popstate", () => { state.route = location.pathname; state.error = ""; render(); });
render();
startFirebase();
