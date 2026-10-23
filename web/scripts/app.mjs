import {
  escapeHtml as e, usernameValue, validUsername, cleanProfile,
  cleanText, makePrivatePlant, filterPlants, allTags
} from "./domain.mjs";
import { firebaseConfigured, loadFirebase } from "./firebase.mjs";
import { makeDataClient } from "./data.mjs";

const root = document.querySelector("#app");
const state = {
  user: null, firebase: null, store: null, profile: null,
  plants: [], tags: [], publicData: null, publicHandle: "",
  search: "", tag: "", pending: false, notice: "", routeCount: 0,
  authReady: false
};
const h = value => e(value ?? "");
const href = path => 'href="' + h(path) + '" data-nav';
const withTags = tags => (tags || []).map(tag => '<span class="tag">' + h(tag) + '</span>').join("");
const icon = '<span aria-hidden="true" class="leaf-symbol">✳</span>';
const currentPath = () => location.pathname.replace(/\/+$/,"") || "/";
const protectedPath = path => path === "/app" || path.startsWith("/app/");

function status(message, type = "info") {
  state.notice = message;
  const target = document.querySelector("#notice");
  if (target) { target.textContent = message; target.className = "notice " + type; target.hidden = !message; }
}
function header() {
  const authLink = state.user ? '<a ' + href("/app") + ' class="header-login">Il mio archivio <span aria-hidden="true">↗</span></a>' :
    '<a ' + href("/login") + ' class="header-login">Area privata <span aria-hidden="true">↗</span></a>';
  return '<header class="site-header"><div class="wrap header-inner">' +
    '<a ' + href("/") + ' class="brand" aria-label="Piante, homepage"><img src="/assets/icon.svg" width="38" height="38" alt=""><span>piante<span class="brand-period">.</span></span></a>' +
    '<nav class="header-nav" aria-label="Navigazione principale"><a ' + href("/") + ' class="nav-link">Il progetto</a>' +
    (state.profile ? '<a ' + href("/" + state.profile.username) + ' class="nav-link">La mia vetrina</a>' : '') +
    authLink + '</nav></div></header>';
}
function footer() {
  return '<footer class="footer"><div class="wrap footer-inner"><span class="footer-brand">piante.</span><span>Un giardino fatto di storie, foglie e tempo.</span><span>Coltivato con cura.</span></div></footer>';
}
function shell(body, extraClass = "") {
  root.innerHTML = '<div class="site ' + extraClass + '">' + header() + '<div id="notice" class="notice" hidden role="status" aria-live="polite"></div>' + body + footer() + '</div>';
  if (state.notice) status(state.notice);
}
function loading(title = "Sto aprendo il giardino…") {
  shell('<main class="wrap loading-page"><div class="loading-leaf" aria-hidden="true">✳</div><h1>' + h(title) + '</h1></main>');
}
function showError(title, message) {
  shell('<main class="wrap empty-page"><div class="overline">UN PICCOLO IMPREVISTO</div><h1>' + h(title) + '</h1><p>' + h(message) +
    '</p><a class="button button-dark" ' + href("/") + '>Torna alla homepage <span aria-hidden="true">↗</span></a></main>');
}
function home() {
  shell('<main><section class="hero wrap"><div class="hero-copy"><div class="overline"><span class="mini-line"></span> IL GIARDINO DIGITALE</div>' +
    '<h1>Ogni pianta ha <em>una storia.</em></h1><p>Un luogo tutto tuo per custodire le piante che coltivi, seguirne la crescita e condividere soltanto ciò che desideri.</p>' +
    '<div class="hero-actions"><a class="button button-dark" ' + href("/login") + '>Entra nel tuo giardino <span aria-hidden="true">↗</span></a><span class="hero-note">Il tuo spazio botanico, a modo tuo.</span></div>' +
    '<div class="hero-signature"><span>01 / COLTIVA</span><span>02 / RACCONTA</span><span>03 / CONDIVIDI</span></div></div>' +
    '<div class="hero-art"><div class="art-orbit"></div><img src="/assets/botanical-plate.svg" width="590" height="660" alt="Illustrazione botanica decorativa con rami e foglie"><span class="art-caption">HERBARIUM · ANNOTAZIONI DAL GIARDINO</span></div></section>' +
    '<section class="intro-band"><div class="wrap band-inner"><span>LA TUA COLLEZIONE, IL TUO RITMO</span><span class="band-star">✳</span><span>UN GIARDINO DA ESPLORARE</span></div></section>' +
    '<section class="wrap feature-section"><div class="section-heading"><div><div class="overline">UNO SPAZIO CHE CRESCE CON TE</div><h2>Due modi di <em>vivere il verde.</em></h2></div><p>Un archivio personale per te. Una piccola esposizione botanica per chi vuoi invitare.</p></div>' +
    '<div class="feature-grid"><article class="feature-card private-feature"><div class="feature-number">01 / PRIVATO</div><div class="feature-art">✳</div><div class="feature-bottom"><h3>Il tuo archivio</h3><p>Schede, nomi botanici, appunti e tag. Un posto ordinato dove raccogliere ogni esemplare.</p><span>Solo tuo, protetto dal login Google →</span></div></article>' +
    '<article class="feature-card public-feature"><div class="feature-number">02 / PUBBLICO</div><div class="feature-art feature-flower">❋</div><div class="feature-bottom"><h3>La tua vetrina</h3><p>Una pagina con il tuo nome utente, fotografie e filtri. Decidi tu quali piante e informazioni mostrare.</p><span>Un link da condividere →</span></div></article></div></section>' +
    '<section class="wrap closing-section"><span class="overline">UN PICCOLO MONDO PERSONALE</span><h2>La bellezza è <em>nelle cose che crescono.</em></h2><a ' + href("/login") + ' class="text-link">Apri il tuo spazio <span aria-hidden="true">↗</span></a></section></main>',"home-site");
}
function login() {
  const available = firebaseConfigured();
  shell('<main class="wrap auth-layout"><div class="auth-aside"><div class="overline">IL TUO ANGOLO VERDE</div><h1>Un posto per <em>le tue piante.</em></h1><p>Accedi per aggiornare il tuo archivio botanico e scegliere che cosa condividere.</p><div class="auth-art">✳</div></div>' +
    '<section class="auth-panel"><span class="form-eyebrow">AREA RISERVATA</span><h2>Bentornato nel<br>tuo giardino.</h2><p>Per ora puoi entrare esclusivamente con il tuo account Google.</p>' +
    (state.user ? '<a class="button button-dark full" ' + href("/app") + '>Continua nel tuo archivio →</a>' :
      '<button type="button" id="google-login" class="button button-dark full" ' + (available ? "" : "disabled") + '>Accedi con Google <span aria-hidden="true">↗</span></button>') +
    (!available ? '<p class="setup-warning">Accesso non ancora attivato: manca la configurazione Firebase Web. Nessun account o dato è stato modificato.</p>' : '') +
    '<p class="privacy-line">Le tue schede restano private finché non decidi di pubblicarle.</p></section></main>',"auth-site");
}
function sideNav(active) {
  const items = [["/app","Le mie piante","plants"],["/app/tags","Tag e categorie","tags"],["/app/settings","Profilo e visibilità","settings"]];
  return '<aside class="app-sidebar"><div class="sidebar-intro"><span class="overline">IL TUO GIARDINO</span><h2>' + h(state.profile?.displayName || "Archivio botanico") + '</h2><span class="sidebar-user">@' + h(state.profile?.username || "") + '</span></div>' +
    '<nav class="sidebar-links" aria-label="Menu archivio">' + items.map(([path,label,key]) => '<a ' + href(path) + ' class="' + (active===key?"active":"") + '">' + h(label) + '<span aria-hidden="true">↗</span></a>').join("") + '</nav>' +
    '<div class="sidebar-bottom">' + (state.profile ? '<a ' + href("/" + state.profile.username) + '>Visualizza vetrina ↗</a>' : "") + '<button type="button" data-action="signout">Esci</button></div></aside>';
}
function appShell(active, content) {
  shell('<main class="wrap app-layout">' + sideNav(active) + '<div class="app-main">' + content + '</div></main>',"private-site");
}
function plantArt(plant, first = false) {
  const src = plant.imageUrl || "";
  return '<div class="plant-visual">' + (src ? '<img src="' + h(src) + '" alt="' + h(plant.name) + '" loading="' + (first?"eager":"lazy") + '" decoding="async" width="560" height="680">' :
    '<div class="plant-placeholder"><img src="/assets/botanical-plate.svg" width="320" height="400" alt="" loading="lazy"></div>') + '</div>';
}
function plantCard(plant, username, first = false) {
  return '<a class="plant-card" ' + href("/" + username + "/" + plant.id) + '>' + plantArt(plant,first) +
    '<div class="plant-card-content"><div class="card-topline"><span>COLLEZIONE BOTANICA</span><span aria-hidden="true">↗</span></div><h3>' + h(plant.name) + '</h3>' +
    (plant.scientificName ? '<p class="latin">' + h(plant.scientificName) + '</p>' : '') +
    (plant.tags?.length ? '<div class="tag-row">' + withTags(plant.tags) + '</div>' : '') + '</div></a>';
}
function privateIndex() {
  const plants=filterPlants(state.plants,state.search,state.tag);
  appShell("plants",'<div class="private-heading"><div><div class="overline">ARCHIVIO PERSONALE</div><h1>Le mie <em>piante.</em></h1><p>Ogni esemplare ha il suo posto. Solo tu puoi consultare gli appunti privati.</p></div><a class="button button-dark" ' + href("/app/plants/new") + '>+ Nuova pianta</a></div>' +
    '<div class="stats-strip"><div><strong>' + state.plants.length + '</strong><span>Esemplari</span></div><div><strong>' + state.plants.filter(p=>p.published).length + '</strong><span>Schede selezionate</span></div><div><strong>' + state.tags.length + '</strong><span>Tag creati</span></div></div>' +
    '<div class="toolbar"><label class="search-field"><span class="visually-hidden">Cerca una pianta</span><input id="plant-search" type="search" placeholder="Cerca tra le tue piante…" value="' + h(state.search) + '"></label>' +
    '<select id="plant-tag" aria-label="Filtra per tag"><option value="">Tutti i tag</option>' + state.tags.map(t=>'<option value="' + h(t.name) + '"' + (state.tag===t.name?" selected":"") + '>' + h(t.name) + '</option>').join("") + '</select></div>' +
    (plants.length?'<div class="private-plants">' + plants.map(p=>'<a class="private-plant" ' + href("/app/plants/"+p.id) + '>' +
      '<div class="private-thumb">' + (p.imageUrl ? '<img alt="" src="' + h(p.imageUrl) + '" loading="lazy">' : '✳') + '</div><div><h3>' + h(p.name) + '</h3><p>' + h(p.scientificName || "Scheda botanica") + '</p></div><span class="visibility-pill ' + (p.published?"is-public":"") + '">' + (p.published?"Selezionata":"Privata") + '</span><span aria-hidden="true">↗</span></a>').join("") + '</div>' :
      '<div class="empty-collection"><span class="empty-asterisk">✳</span><h3>' + (state.plants.length?"Nessun risultato":"Il tuo giardino comincia qui.") + '</h3><p>' + (state.plants.length?"Prova un altro filtro.":"Aggiungi la prima pianta per iniziare la collezione.") + '</p></div>') +
    '<p class="helper-note">Una scheda selezionata diventa visibile ai visitatori solo se hai attivato anche la vetrina nelle impostazioni.</p>');
}
function tagsPage() {
  appShell("tags",'<div class="private-heading"><div><div class="overline">ORGANIZZA LA COLLEZIONE</div><h1>I tuoi <em>tag.</em></h1><p>Crea categorie personali come Esotica, Fruttifera o da seme.</p></div></div>' +
    '<form id="tag-form" class="small-form"><label for="new-tag">Nuovo tag</label><div class="input-action"><input id="new-tag" name="name" maxlength="32" required placeholder="Es. Esotica"><button class="button button-dark" type="submit">Crea tag</button></div></form>' +
    '<div class="tag-board">' + (state.tags.length ? state.tags.map(t=>'<span class="large-tag">' + h(t.name) + '</span>').join("") : '<p>Non hai ancora creato tag.</p>') + '</div>' +
    '<p class="helper-note">I tag associati a una pianta si vedranno pubblicamente solo se abiliti la condivisione dei tag per quella scheda.</p>');
}
function settingsPage() {
  const p=state.profile;
  appShell("settings",'<div class="private-heading"><div><div class="overline">IL TUO PROFILO</div><h1>La tua <em>vetrina.</em></h1><p>Controlla il nome e la descrizione che i visitatori possono leggere.</p></div></div>' +
    '<form id="settings-form" class="editor-form"><div class="form-grid"><label>Nome pubblico<input name="displayName" required maxlength="80" value="' + h(p.displayName) + '"></label>' +
    '<label>Indirizzo pubblico<input value="piante.web.app/' + h(p.username) + '" readonly></label></div>' +
    '<label>Descrizione del tuo giardino<textarea name="about" rows="5" maxlength="600" placeholder="Racconta in poche parole il tuo giardino…">' + h(p.about) + '</textarea></label>' +
    '<label class="check-row check-highlight"><input type="checkbox" name="visible" ' + (p.visible?"checked":"") + '><span><strong>Rendi visibile la vetrina</strong><small>Se la disattivi, il profilo e tutte le schede pubbliche smettono di essere consultabili tramite il sito.</small></span></label>' +
    '<div class="form-actions"><button class="button button-dark" type="submit">Salva impostazioni</button><a ' + href("/" + p.username) + ' class="text-link">Anteprima del profilo ↗</a></div></form>' +
    '<section class="settings-extra"><div class="overline">CONDIVISIONE CONSAPEVOLE</div><h3>Sei tu a decidere.</h3><p>La vetrina mostra solo le informazioni esplicitamente selezionate nelle singole schede. Appunti e fotografie non vengono pubblicati automaticamente.</p></section>');
}
function plantEditor(id) {
  const original=state.plants.find(p=>p.id===id);
  if(id!=="new"&&!original){showError("Pianta non trovata","Questa scheda non esiste nel tuo archivio.");return;}
  const p=original || {name:"",scientificName:"",description:"",imageUrl:"",tags:[],published:false,shareScientificName:false,shareDescription:false,shareTags:false,shareImage:false};
  const check=(key,label,description)=>'<label class="check-row"><input type="checkbox" name="' + key + '" ' + (p[key]?"checked":"") + '><span><strong>' + label + '</strong><small>' + description + '</small></span></label>';
  appShell("plants",'<div class="editor-top"><a ' + href("/app") + ' class="back-link">← Torna alle mie piante</a><div class="overline">SCHEDA BOTANICA</div><h1>' + (original?"Modifica":"Nuova") + ' <em>pianta.</em></h1><p>Prima registra i dati per te, poi scegli cosa rendere pubblico.</p></div>' +
    '<form id="plant-form" data-id="' + h(id) + '" class="editor-form"><div class="form-grid"><label>Nome della pianta *<input name="name" required maxlength="90" value="' + h(p.name) + '" placeholder="Es. Avocado"></label>' +
    '<label>Nome scientifico<input name="scientificName" maxlength="120" value="' + h(p.scientificName) + '" placeholder="Es. Persea americana"></label></div>' +
    '<label>Appunti / descrizione<textarea name="description" rows="5" maxlength="2000" placeholder="Annotazioni sulla tua pianta…">' + h(p.description) + '</textarea></label>' +
    '<label>Foto — URL HTTPS o percorso /images/<input name="imageUrl" maxlength="500" value="' + h(p.imageUrl) + '" placeholder="/images/avocado.webp"></label>' +
    '<div class="image-helper"><div><strong>Hai una foto da ottimizzare?</strong><p>Selezionala e scarica una versione WebP leggera. Poi aggiungila alla cartella web/images su GitHub e inserisci il relativo percorso qui sopra.</p></div><label class="upload-label">Scegli una foto<input type="file" id="photo-file" accept="image/*"></label><button type="button" data-action="optimize" class="text-link">Scarica WebP ↗</button></div>' +
    '<fieldset class="tags-field"><legend>Tag della pianta</legend><div class="selectable-tags">' + (state.tags.length?state.tags.map(t=>'<label class="tag-checkbox"><input type="checkbox" name="tag" value="' + h(t.name) + '" ' + (p.tags.includes(t.name)?"checked":"") + '><span>' + h(t.name) + '</span></label>').join(""):'<p>Non ci sono tag. <a ' + href("/app/tags") + '>Creane uno qui.</a></p>') + '</div></fieldset>' +
    '<section class="publish-section"><div class="overline">CONTROLLO PUBBLICAZIONE</div><h2>Cosa vuoi <em>mostrare?</em></h2>' +
    check("published","Seleziona per la vetrina","La scheda verrà pubblicata soltanto quando anche il profilo è visibile.") +
    '<div class="sharing-fields">' +
    check("shareScientificName","Nome scientifico","Mostra il nome botanico.") +
    check("shareDescription","Descrizione","Mostra il testo degli appunti sopra: verifica prima che non contenga informazioni private.") +
    check("shareTags","Tag","Rendi selezionabili i tag nei filtri pubblici.") +
    check("shareImage","Fotografia","Mostra la foto inserita sopra, soltanto se hai diritto a pubblicarla.") +
    '</div></section><div class="form-actions"><button class="button button-dark" type="submit">Salva la pianta →</button>' +
    (original?'<button type="button" class="button button-danger" data-action="delete-plant" data-id="' + h(id) + '">Elimina scheda</button>':'') +
    '</div></form>');
}
function onboarding() {
  appShell("plants",'<div class="editor-top"><div class="overline">BENVENUTO</div><h1>Dai un nome <em>al giardino.</em></h1><p>Questo nome utente diventerà il link della tua vetrina. Una volta scelto, non potrai cambiarlo in questa prima versione.</p></div>' +
    '<form id="onboarding-form" class="editor-form"><div class="form-grid"><label>Nome del giardino *<input name="displayName" maxlength="80" required placeholder="Il mio giardino"></label>' +
    '<label>Nome utente *<input name="username" required minlength="3" maxlength="30" pattern="[a-z0-9-]+" placeholder="esempio-giardino" autocomplete="off"><small>Solo lettere minuscole, numeri e trattini.</small></label></div>' +
    '<label>Descrizione (facoltativa)<textarea name="about" maxlength="600" rows="4" placeholder="Una piccola presentazione…"></textarea></label>' +
    '<div class="onboarding-note">Il profilo nasce privato. Sarai tu ad attivare la vetrina dalle impostazioni.</div><button type="submit" class="button button-dark">Crea il mio spazio →</button></form>');
}
function publicHeader(garden) {
  return '<section class="public-cover"><div class="wrap public-hero"><div><div class="overline"><span class="mini-line"></span> COLLEZIONE PERSONALE</div><h1>' + h(garden.displayName) + '<span class="title-period">.</span></h1>' +
    '<p>' + h(garden.about || "Benvenuto nel mio piccolo mondo botanico.") + '</p><div class="hero-handle">@' + h(garden.username) + '</div></div><div class="cover-ornament" aria-hidden="true">✳</div></div></section>';
}
function gallery(garden) {
  const plants=filterPlants(garden.plants,state.search,state.tag);
  const tags=allTags(garden.plants);
  return '<section class="wrap gallery-section"><div class="gallery-heading"><div><div class="overline">ESPLORA IL GIARDINO</div><h2>Le piante <em>in mostra.</em></h2></div><span>' + garden.plants.length + ' ESEMPLARI</span></div>' +
    '<div class="gallery-controls"><label class="search-field"><span class="visually-hidden">Cerca nella collezione</span><input id="public-search" type="search" placeholder="Cerca una pianta…" value="' + h(state.search) + '"></label>' +
    '<div class="filter-chips" role="group" aria-label="Filtra per tag"><button type="button" data-filter="" class="' + (!state.tag?"selected":"") + '">Tutte</button>' +
    tags.map(t=>'<button type="button" data-filter="' + h(t) + '" class="' + (state.tag===t?"selected":"") + '">' + h(t) + '</button>').join("") + '</div></div>' +
    (plants.length?'<div class="gallery-grid">' + plants.map((p,i)=>plantCard(p,garden.username,i===0)).join("") + '</div>' :
      '<div class="empty-collection"><span class="empty-asterisk">✳</span><h3>' + (garden.plants.length?"Nessuna pianta con questi filtri.":"Questo giardino sta ancora crescendo.") + '</h3><p>' + (garden.plants.length?"Prova un altro termine o tag.":"Le prime schede compariranno qui quando saranno pubblicate.") + '</p></div>') + '</section>';
}
function publicPage(garden) {
  shell('<main>' + publicHeader(garden) + gallery(garden) + '<section class="wrap public-outro"><span class="overline">FINE DELLA PASSEGGIATA</span><p>Ogni foglia racconta qualcosa.</p></section></main>',"public-site");
}
function plantDetail(garden, plant) {
  shell('<main class="wrap detail-page"><a class="back-link" ' + href("/" + garden.username) + '>← Tutte le piante di ' + h(garden.displayName) + '</a>' +
    '<div class="detail-grid">' + plantArt(plant,true) + '<section class="detail-content"><div class="overline">SCHEDA DEL GIARDINO · ' + h(garden.username.toUpperCase()) + '</div><h1>' + h(plant.name) + '</h1>' +
    (plant.scientificName?'<p class="detail-latin">' + h(plant.scientificName) + '</p>':'') +
    (plant.tags?.length?'<div class="tag-row">' + withTags(plant.tags) + '</div>':'') +
    (plant.description?'<div class="detail-description"><h2>La sua storia</h2><p>' + h(plant.description) + '</p></div>':'<p class="detail-description">Una delle piante di questa collezione.</p>') +
    '<a class="text-link" ' + href("/" + garden.username) + '>Esplora il resto del giardino ↗</a></section></div></main>',"public-site");
}
async function hydratePrivate() {
  if (!state.user || !state.store) return;
  const uid = state.user.uid;
  const profile = await state.store.privateProfile(uid);
  if (state.user?.uid !== uid) return;
  state.profile = profile;
  if (profile) {
    const [plants,tags] = await Promise.all([state.store.privatePlants(uid),state.store.privateTags(uid)]);
    if (state.user?.uid !== uid) return;
    state.plants = plants;
    state.tags = tags;
  } else { state.plants=[]; state.tags=[]; }
}
async function render() {
  const token=++state.routeCount;
  const path=currentPath();
  window.scrollTo({top:0,behavior:"instant"});
  state.search=""; state.tag="";
  if (path==="/") { home(); return; }
  if (path==="/login") { login(); return; }
  if (!state.authReady && firebaseConfigured()) { loading(); return; }
  if (protectedPath(path)) {
    if (!firebaseConfigured()) { showError("Configurazione mancante","Configura Firebase prima di accedere all'archivio."); return; }
    if (!state.user) { login(); return; }
    if (!state.profile) { onboarding(); return; }
    if (path==="/app") { privateIndex(); return; }
    if (path==="/app/tags") { tagsPage(); return; }
    if (path==="/app/settings") { settingsPage(); return; }
    const match=path.match(/^\/app\/plants\/([a-zA-Z0-9-]+)$/);
    if (match) { plantEditor(match[1]); return; }
    showError("Pagina non trovata","Questa sezione non esiste.");return;
  }
  const sections=path.split("/").filter(Boolean);
  const handle=sections[0];
  if (!validUsername(handle) || sections.length>2 || !firebaseConfigured()) {
    showError("Giardino non disponibile","La pagina non esiste oppure la connessione Firebase non è ancora configurata."); return;
  }
  loading("Sto sfogliando la collezione…");
  try {
    let garden = state.publicHandle===handle ? state.publicData : null;
    if (!garden) {
      garden=await state.store.publicGarden(handle);
      if(token!==state.routeCount)return;
      state.publicHandle=handle;state.publicData=garden;
    }
    if (!garden) { showError("Giardino non disponibile","Questo profilo è privato oppure non esiste.");return; }
    if (sections.length===1) publicPage(garden);
    else {
      const plant=garden.plants.find(p=>p.id===sections[1]);
      if (plant) plantDetail(garden,plant);
      else showError("Pianta non trovata","Questa scheda non è pubblica oppure non esiste.");
    }
  } catch (error) { if(token===state.routeCount) showError("Impossibile caricare il giardino",error.message); }
}
function navigate(path) { if(location.pathname!==path) history.pushState({},"",path); render(); }
async function safely(action) {
  if (state.pending) return;
  state.pending=true;
  try { await action(); }
  catch(error) { status(error.message || "Operazione non riuscita.","error"); }
  finally { state.pending=false; }
}
document.addEventListener("click",event=>{
  const link=event.target.closest("a[data-nav]");
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button===0) {
    event.preventDefault(); navigate(new URL(link.href).pathname);return;
  }
  const tagButton=event.target.closest("[data-filter]");
  if(tagButton){state.tag=tagButton.dataset.filter || "";if(state.publicData) {
    const current=document.querySelector(".gallery-section");
    if(current){const replacement=document.createElement("div");replacement.innerHTML=gallery(state.publicData);current.replaceWith(replacement.firstElementChild);}
  }return;}
  const action=event.target.closest("[data-action]")?.dataset.action;
  if(action==="signout") safely(async()=>{await state.firebase.api.signOut(state.firebase.auth);state.profile=null;state.plants=[];navigate("/");});
  if(action==="optimize") safely(optimizePhoto);
  if(action==="delete-plant") safely(async()=>{
    const id=event.target.closest("[data-id]")?.dataset.id;
    if(!id || !confirm("Eliminare definitivamente questa scheda dall'archivio e dalla vetrina?"))return;
    await state.store.removePlant(state.user.uid,state.profile.username,id);
    await hydratePrivate();state.publicData=null;navigate("/app");
  });
});
document.addEventListener("input",event=>{
  if (event.target.id!=="plant-search" && event.target.id!=="public-search") return;
  state.search=event.target.value;
  if(event.target.id==="public-search" && state.publicData){
    const cards=document.querySelector(".gallery-section");
    if(cards){const view=document.createElement("div");view.innerHTML=gallery(state.publicData);
      const next=view.firstElementChild;
      const newSearch=next.querySelector("#public-search");
      cards.replaceWith(next);newSearch?.focus();newSearch?.setSelectionRange(state.search.length,state.search.length);
    }
  }
  if(event.target.id==="plant-search") {
    privateIndex();
    const search=document.querySelector("#plant-search");
    search?.focus();search?.setSelectionRange(state.search.length,state.search.length);
  }
});
document.addEventListener("change",event=>{
  if(event.target.id==="plant-tag"){state.tag=event.target.value;privateIndex();}
});
document.addEventListener("submit",event=>{
  const form=event.target;
  if(!["tag-form","onboarding-form","settings-form","plant-form"].includes(form.id))return;
  event.preventDefault();
  const fd=new FormData(form);
  safely(async()=>{
    if(form.id==="tag-form"){
      const name=cleanText(fd.get("name"),32);
      if(state.tags.some(tag=>tag.name.toLocaleLowerCase("it")===name.toLocaleLowerCase("it")))throw new Error("Hai già un tag con questo nome.");
      await state.store.addTag(state.user.uid,name);await hydratePrivate();tagsPage();status("Tag creato.","success");return;
    }
    if(form.id==="onboarding-form"){
      const username=usernameValue(fd.get("username"));
      if(!validUsername(username))throw new Error("Il nome utente non è valido o è riservato.");
      await state.store.register(state.user.uid,{username,displayName:fd.get("displayName"),about:fd.get("about"),visible:false});
      await hydratePrivate();navigate("/app");status("Il tuo spazio è pronto. La vetrina è privata.","success");return;
    }
    if(form.id==="settings-form"){
      state.profile=await state.store.saveProfile(state.user.uid,state.profile,{
        displayName:fd.get("displayName"),about:fd.get("about"),visible:fd.has("visible")
      });state.publicData=null;settingsPage();status("Impostazioni salvate.","success");return;
    }
    if(form.id==="plant-form"){
      const id=form.dataset.id;
      const original=state.plants.find(p=>p.id===id) || null;
      const plant=makePrivatePlant({
        name:fd.get("name"),scientificName:fd.get("scientificName"),description:fd.get("description"),
        imageUrl:fd.get("imageUrl"),tags:fd.getAll("tag"),
        published:fd.has("published"),shareScientificName:fd.has("shareScientificName"),
        shareDescription:fd.has("shareDescription"),shareTags:fd.has("shareTags"),shareImage:fd.has("shareImage")
      },original);
      const newId=id==="new" ? (cleanText(plant.name.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),48).replace(/-$/,"") || "pianta") + "-" + crypto.randomUUID().slice(0,8) : id;
      await state.store.savePlant(state.user.uid,state.profile.username,newId,plant);
      await hydratePrivate();state.publicData=null;navigate("/app");status("Scheda salvata.","success");
    }
  });
});
async function optimizePhoto() {
  const file=document.querySelector("#photo-file")?.files?.[0];
  if(!file)throw new Error("Seleziona prima una fotografia.");
  if(!file.type.startsWith("image/"))throw new Error("Il file selezionato non è un'immagine.");
  if(file.size>30*1024*1024)throw new Error("La fotografia supera il limite locale di 30 MB.");
  const source=await createImageBitmap(file);
  try {
    const maxSide=1400;
    const ratio=Math.min(1,maxSide/Math.max(source.width,source.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(source.width*ratio);canvas.height=Math.round(source.height*ratio);
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Questo browser non può convertire l'immagine.");
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.78));
    if(!blob || blob.type!=="image/webp")throw new Error("WebP non è disponibile su questo browser.");
    const link=document.createElement("a");
    const name=file.name.replace(/\.[^.]+$/,"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,50) || "pianta";
    link.href=URL.createObjectURL(blob);link.download=name+".webp";
    link.click();setTimeout(()=>URL.revokeObjectURL(link.href),600);
    status("WebP generato ("+Math.round(blob.size/1024)+" KB). Caricalo in web/images/ su GitHub.","success");
  } finally {source.close();}
}
window.addEventListener("popstate",render);
async function start() {
  home();
  if(!firebaseConfigured()) {state.authReady=true;render();return;}
  try {
    state.firebase=await loadFirebase();
    state.store=makeDataClient(state.firebase);
    state.firebase.api.onAuthStateChanged(state.firebase.auth,async user=>{
      state.user=user;state.authReady=true;
      if(user) {
        try {await hydratePrivate();} catch(error){state.profile=null;state.notice="Non riesco a leggere il tuo archivio: "+error.message;}
      } else {state.profile=null;state.plants=[];state.tags=[];}
      render();
    },error=>{state.authReady=true;status(error.message,"error");render();});
  }catch(error){state.authReady=true;showError("Collegamento non disponibile",error.message);}
}
document.addEventListener("click",event=>{
  if(event.target.closest("#google-login")){
    safely(async()=>{
      if(!state.firebase)throw new Error("Autenticazione non disponibile.");
      const provider=new state.firebase.api.GoogleAuthProvider();
      await state.firebase.api.signInWithPopup(state.firebase.auth,provider);
      navigate("/app");
    });
  }
});
start();
