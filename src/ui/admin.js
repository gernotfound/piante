import { categories, plantGroups, fruitTypes, growthHabits, pollinationTypes, potSuitabilityTypes, monthNames, plantPresets, propagationMethods, materialSources, specimenSexes, groupForEditedPlant, decodeRouteId, specimenCodeOf, safeImageUrl, escapeHtml } from "../domain.js";
import { filterInventory } from "../catalog.js";
import { plantVersion } from "../plant-store.js";

export function createAdminViews({ state, publicViews, setEditBaseline }) {
  const h = escapeHtml;
  const { alertBox, empty, imageMarkup, loginPage } = publicViews;

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
            <span class="recent-name"><span class="plant-title-line"><strong>${h(plant.name)}</strong><span class="specimen-code">${h(specimenCodeOf(plant))}</span></span><small>${h(plant.category || "")}</small></span>
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
        ${imageMarkup(plant)}<div><div class="plant-title-line"><strong>${h(plant.name)}</strong><span class="specimen-code">${h(specimenCodeOf(plant))}</span></div>
        <small>${h(plant.scientificName || plant.variety || "")}</small>
        ${plant.sourceDetails ? `<small>${h(plant.sourceDetails)}</small>` : ""}</div>
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
    // La versione rimane quella mostrata quando l'editor è stato aperto.
    // Le notifiche Firestore non devono sostituirla mentre il modulo è modificato.
    if (item) {
      const { id: documentId, __snapshotVersion, ...data } = item;
      setEditBaseline({ id: documentId, version: __snapshotVersion || plantVersion(data),
        category: data.category, plantGroup: data.plantGroup });
    } else {
      setEditBaseline(null);
    }
    const selectedHarvestMonths = new Set(Array.isArray(p.harvestMonths) ? p.harvestMonths : []);
    const pollinationSelect = `<label class="form-field"><span>Autofertilità</span><select class="select" name="pollination">
      ${["", ...pollinationTypes].map((value) => `<option value="${h(value)}" ${(p.pollination || "") === value ? "selected" : ""}>${h(value || "Sconosciuta / da verificare")}</option>`).join("")}
    </select></label>`;
    const potSelect = `<label class="form-field"><span>Coltivazione in vaso</span><select class="select" name="potSuitability">
      ${["", ...potSuitabilityTypes].map((value) => `<option value="${h(value)}" ${(p.potSuitability || "") === value ? "selected" : ""}>${h(value || "Sconosciuta / da verificare")}</option>`).join("")}
    </select></label>`;
    const harvestSelector = `<fieldset class="harvest-fieldset full-width">
      <legend>Mesi indicativi della raccolta (facoltativi)</legend>
      <div class="harvest-months">
        ${monthNames.map((name, i) => `<label>
          <input type="checkbox" name="harvestMonth" value="${i + 1}" ${selectedHarvestMonths.has(i + 1) ? "checked" : ""}>
          <span>${h(name)}</span></label>`).join("")}
      </div>
      <p>Il calendario è indicativo per il clima locale e non determina la data effettiva di maturazione.</p>
    </fieldset>`;
    const selectedFruitType = p.fruitType || "";
    const fruitSelect = `<label class="form-field" data-fruit-type-field ${groupForEditedPlant(p.category, item) === "Piante da frutto" ? "" : "hidden"}>
      <span>Tipo di fruttifera (facoltativo)</span><select class="select" name="fruitType">
      ${["", ...fruitTypes].map((type) => `<option value="${h(type)}" ${selectedFruitType === type ? "selected" : ""}>${h(type || "Non specificato")}</option>`).join("")}
    </select></label>`;
    const habitSelect = `<label class="form-field"><span>Forma della pianta</span><select class="select" name="growthHabit">
      ${["", ...growthHabits].map((type) => `<option value="${h(type)}" ${p.growthHabit === type ? "selected" : ""}>${h(type || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const select = `<label class="form-field"><span>Categoria *</span><select class="select" name="category" required>
      <option value="" ${!p.category ? "selected" : ""}>Seleziona la categoria</option>
      ${categories.map((category) => `<option value="${h(category)}" ${p.category === category ? "selected" : ""}>${h(category)}</option>`).join("")}
    </select><small>Il gruppo principale viene ricavato automaticamente dalla categoria.</small></label>`;
    const presetSelect = id ? "" : `<label class="form-field full-width"><span>Seleziona una specie suggerita (facoltativo)</span>
      <select class="select" name="plantPreset"><option value="">Compila manualmente</option>
        ${plantPresets.map((preset) => `<option value="${h(preset.key)}">${h(preset.label)}</option>`).join("")}
      </select><small>Compila solo i campi botanici vuoti, senza attribuire una cultivar o caratteristiche non verificate.</small></label>`;
    const propagationSelect = `<label class="form-field"><span>Come è nata la pianta?</span><select class="select" name="propagationMethod">
      ${["", ...propagationMethods].map((value) => `<option value="${h(value)}" ${(p.propagationMethod || "") === value ? "selected" : ""}>${h(value || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const sourceSelect = `<label class="form-field"><span>Provenienza del materiale</span><select class="select" name="materialSource">
      ${["", ...materialSources].map((value) => `<option value="${h(value)}" ${(p.materialSource || "") === value ? "selected" : ""}>${h(value || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const sexSelect = `<label class="form-field"><span>Sesso botanico (solo se accertato)</span><select class="select" name="specimenSex">
      ${["", ...specimenSexes].map((value) => `<option value="${h(value)}" ${(p.specimenSex || "") === value ? "selected" : ""}>${h(value || "Non determinato / non pertinente")}</option>`).join("")}
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
          ${presetSelect}
          ${inputField("Nome comune *", "name", p.name, "required maxlength='100' placeholder='Es. Papaya'")}
          ${inputField("Nome scientifico", "scientificName", p.scientificName, "maxlength='150'")}
          ${select}
          ${fruitSelect}
          ${habitSelect}
          ${inputField("Cultivar/varietà (solo se verificata)", "variety", p.variety, "maxlength='150'")}
          <div class="full-width"><p class="specimen-hint">Un seme di avocado Hass o di papaya Formosa non identifica automaticamente la cultivar della nuova pianta. Registra il nome sull'etichetta del frutto nella provenienza privata.</p></div>
          <div class="full-width">${inputField("Altri nomi e sinonimi (separati da virgola)", "searchAliases", p.searchAliases, "maxlength='250' placeholder='Es. maracujà, frutto della passione'")}</div>
          ${inputField("Origine geografica (pubblica)", "origin", p.origin, "maxlength='150'")}
          ${pollinationSelect}
          ${potSelect}
          ${harvestSelector}
        </div>
      </section>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">02</span><div>
          <h3>Identità e provenienza dell'esemplare</h3><p>Dati privati: distingui più piante della stessa specie.</p></div></div>
        <div class="form-grid">
          <div class="full-width">${id ? `<label class="form-field"><span>Codice identificativo</span>
            <input class="input specimen-code" type="text" readonly value="${h(specimenCodeOf({ id }))}" aria-label="Codice alfanumerico univoco della pianta">
            <small>È permanente, inizia con # e puoi copiarlo per identificare questo esemplare.</small></label>` :
            `<p class="specimen-hint">Un codice alfanumerico univoco che inizia con # sarà assegnato automaticamente al salvataggio.</p>`}</div>
          ${propagationSelect}
          ${sourceSelect}
          <div class="full-width">${inputField("Dettagli della provenienza (privati)", "sourceDetails", p.sourceDetails,
            "maxlength='300' placeholder='Es. frutto del supermercato etichettato Formosa'")}</div>
          ${inputField("Data di semina (se nota)", "sownOn", p.sownOn, "type='date'")}
          ${inputField("Posizione attuale (privata)", "plantLocation", p.plantLocation,
            "maxlength='120' placeholder='Es. balcone, vaso grande'")}
          ${sexSelect}
        </div>
      </section>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">03</span><div>
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
        <div class="editor-section-heading"><span class="editor-step">04</span><div>
          <h3>Clima e resistenza al freddo</h3>
          <p>Facoltativo. Non assegnare valori presunti: il filtro pubblico utilizza solo soglie registrate.</p></div></div>
        <div class="form-grid">
          ${inputField("Temperatura minima indicativa (°C)", "minColdC", p.minColdC,
            "type='number' step='0.5' min='-40' max='25' inputmode='decimal' placeholder='Es. -3'")}
          ${inputField("Fonte HTTPS (facoltativa)", "coldSource", p.coldSource,
            "type='url' inputmode='url' maxlength='500' placeholder='https://...'")}
          <div class="full-width">${textareaField("Note climatiche pubbliche", "coldNotes", p.coldNotes, "maxlength='250'")}</div>
        </div>
        <p class="climate-help">La soglia è orientativa per una pianta adulta acclimatata in piena terra e un episodio breve. Durata, vento, cultivar e coltivazione in vaso possono cambiare l'esito. Valori sconosciuti restano vuoti.</p>
      </section>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">05</span><div>
          <h3>Fotografia</h3><p>Inserisci l'indirizzo HTTPS diretto di un'immagine.</p></div></div>
        <div class="form-grid">
          <div class="full-width">${inputField("URL HTTPS della foto", "imageUrl", p.imageUrl, "type='url' inputmode='url' maxlength='4096' placeholder='https://...'")}</div>
        </div>
        ${p.imageUrl && safeImageUrl(p.imageUrl) ? `<div class="editor-photo">${imageMarkup(p)}</div>` : ""}
      </section>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">06</span><div>
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
    if (state.route !== "/admin/impostazioni" && state.inventoryError) {
      return adminFrame(`<div class="panel" role="alert">Impossibile caricare l'inventario privato. Ricarica la pagina e verifica la connessione.</div>`,
        "Inventario non disponibile", "Nessuna operazione sulle piante è stata eseguita.");
    }
    if (state.route !== "/admin/impostazioni" && !state.inventoryReady) {
      return adminFrame(`<div class="panel" role="status">Caricamento dell'inventario…</div>`,
        "Caricamento", "Verifica in corso dei dati privati.");
    }
    if (state.route === "/admin/nuova") return editPage("");
    if (state.route.startsWith("/admin/modifica/")) return editPage(decodeRouteId(state.route.slice("/admin/modifica/".length)));
    if (state.route === "/admin/piante") return inventoryPage();
    if (state.route === "/admin/impostazioni") return settingsPage();
    return overviewPage();
  }

  return { adminPage };
}
