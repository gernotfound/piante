import { categories, plantGroups, fruitTypes, growthHabits, pollinationTypes, potSuitabilityTypes, monthNames, propagationMethods, materialSources, specimenSexes, groupForEditedPlant, decodeRouteId, specimenCodeOf, varietyLabel, safeImageUrl, escapeHtml } from "../domain.js";
import { filterInventory } from "../catalog.js";
import { plantVersion } from "../plant-store.js";
import { lifeStages, journalKinds, profileForPlant, preparePlantDuplicate } from "../taxonomy.js";

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
            <span class="recent-name"><span class="plant-title-line"><strong>${h(plant.name)}</strong><span class="specimen-code">${h(specimenCodeOf(plant))}</span></span>
              ${varietyLabel(plant) ? `<small>${h(varietyLabel(plant))}</small>` : ""}
              <small>${h(plant.category || "")}</small></span>
            <span class="pill ${plant.published ? "" : "draft"}">${plant.published ? "Pubblica" : "Privata"}</span>
            <span class="recent-arrow" aria-hidden="true">↗</span>
          </a>`).join("")}</div>` : empty("Non hai ancora aggiunto piante. Inizia creando la tua prima scheda.") }
      </section>`,
      "Panoramica", `Benvenuto${state.username ? ", " + state.username : ""}. Qui trovi i dati essenziali della tua collezione.`);
  }
  function inventoryPage() {
    const plants = filterInventory(state.inventory, {
      query: state.inventoryQuery, visibility: state.inventoryVisibility, group: state.inventoryGroup
    }).filter(plant => state.inventoryStage === "Tutte" ||
      (plant.lifeStage || "") === state.inventoryStage);
    const rows = plants.map((plant) => `<tr>
      <td data-label="Pianta"><div class="inventory-name">
        ${imageMarkup(plant)}<div><div class="plant-title-line"><strong>${h(plant.name)}</strong><span class="specimen-code">${h(specimenCodeOf(plant))}</span></div>
        ${plant.scientificName ? `<small>${h(plant.scientificName)}</small>` : ""}
        ${varietyLabel(plant) ? `<small class="inventory-variety">${h(varietyLabel(plant))}</small>` : ""}
        ${plant.lifeStage ? `<small>Stato: ${h(plant.lifeStage)}</small>` : ""}
        ${plant.lotName ? `<small>Lotto: ${h(plant.lotName)}</small>` : ""}
        ${plant.sourceDetails ? `<small>${h(plant.sourceDetails)}</small>` : ""}</div>
      </div></td>
      <td data-label="Categoria">${h(plant.category || "—")}</td>
      <td data-label="Visibilità"><span class="pill ${plant.published ? "" : "draft"}">${plant.published ? "Pubblica" : "Privata"}</span></td>
      <td data-label="Azioni"><div class="inventory-actions">
          <a class="btn btn-outline btn-small" data-nav href="/admin/modifica/${encodeURIComponent(plant.id)}">Modifica</a>
          <a class="btn btn-outline btn-small" data-nav href="/admin/nuova?copy=${encodeURIComponent(plant.id)}">Duplica</a>
        </div></td>
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
        <label class="sr-only" for="inventory-stage">Filtra per stato</label>
        <select id="inventory-stage" class="select" name="stage">
          ${["Tutte", ...lifeStages].map(stage =>
            `<option value="${h(stage)}" ${state.inventoryStage === stage ? "selected" : ""}>${h(stage === "Tutte" ? "Tutti gli stati" : stage)}</option>`).join("")}
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
  function missingPlantPage() {
    return adminFrame(
      `<div class="panel">Pianta non trovata. <a href="/admin/piante" data-nav class="text-link">Torna all'inventario</a></div>`,
      "Scheda non trovata", "La pianta non è presente nell'inventario.");
  }
  function editPage(id) {
    const item = id ? state.inventory.find((plant) => plant.id === id) : null;
    if (id && !item) return missingPlantPage();
    const source = !id ? state.inventory.find(plant =>
      plant.id === new URLSearchParams(window.location.search).get("copy")) : null;
    const p = item || preparePlantDuplicate(source);
    const { species, cultivar } = profileForPlant(p, state.profiles);
    const shared = species || p;
    const cultivarData = cultivar || {};
    // La versione rimane quella mostrata quando l'editor è stato aperto.
    // Le notifiche Firestore non devono sostituirla mentre il modulo è modificato.
    if (item) {
      const { id: documentId, __snapshotVersion, ...data } = item;
      setEditBaseline({ id: documentId, version: __snapshotVersion || plantVersion(data),
        category: data.category, plantGroup: data.plantGroup,
        cultivarId: data.cultivarId || "" });
    } else {
      setEditBaseline(null);
    }
    const selectedHarvestMonths = new Set(Array.isArray(shared.harvestMonths) ? shared.harvestMonths : []);
    const cultivarHarvestMonths = new Set(Array.isArray(cultivarData.harvestMonths) ? cultivarData.harvestMonths : []);
    const pollinationSelect = `<label class="form-field"><span>Autofertilità</span><select class="select" name="pollination">
      ${["", ...pollinationTypes].map((value) => `<option value="${h(value)}" ${(shared.pollination || "") === value ? "selected" : ""}>${h(value || "Sconosciuta / da verificare")}</option>`).join("")}
    </select></label>`;
    const potSelect = `<label class="form-field"><span>Coltivazione in vaso</span><select class="select" name="potSuitability">
      ${["", ...potSuitabilityTypes].map((value) => `<option value="${h(value)}" ${(shared.potSuitability || "") === value ? "selected" : ""}>${h(value || "Sconosciuta / da verificare")}</option>`).join("")}
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
    const selectedFruitType = shared.fruitType || "";
    const fruitSelect = `<label class="form-field" data-fruit-type-field ${groupForEditedPlant(shared.category, item) === "Piante da frutto" ? "" : "hidden"}>
      <span>Tipo di fruttifera (facoltativo)</span><select class="select" name="fruitType">
      ${["", ...fruitTypes].map((type) => `<option value="${h(type)}" ${selectedFruitType === type ? "selected" : ""}>${h(type || "Non specificato")}</option>`).join("")}
    </select></label>`;
    const habitSelect = `<label class="form-field"><span>Forma della pianta</span><select class="select" name="growthHabit">
      ${["", ...growthHabits].map((type) => `<option value="${h(type)}" ${shared.growthHabit === type ? "selected" : ""}>${h(type || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const select = `<label class="form-field"><span>Categoria *</span><select class="select" name="category" required>
      <option value="" ${!shared.category ? "selected" : ""}>Seleziona la categoria</option>
      ${categories.map((category) => `<option value="${h(category)}" ${shared.category === category ? "selected" : ""}>${h(category)}</option>`).join("")}
    </select><small>Il gruppo principale viene ricavato automaticamente dalla categoria.</small></label>`;
    const speciesChoices = state.profiles.filter(profile => profile.kind === "species")
      .map(profile => `<option value="${h(profile.name)}"></option>`).join("");
    const cultivarChoices = state.profiles.filter(profile =>
      profile.kind === "cultivar" && profile.parentId === species?.id)
      .map(profile => `<option value="${h(profile.name)}"></option>`).join("");
    const cultivarPollination = `<label class="form-field"><span>Impollinazione cultivar</span>
      <select class="select" name="cultivarPollination">
        ${["", ...pollinationTypes].map(value => `<option value="${h(value)}" ${(cultivarData.pollination || "") === value ? "selected" : ""}>${h(value || "Come specie")}</option>`).join("")}
      </select></label>`;
    const cultivarHarvest = `<fieldset class="harvest-fieldset full-width">
      <legend>Raccolta della cultivar verificata</legend>
      <div class="harvest-months">${monthNames.map((label, i) => `<label>
        <input type="checkbox" name="cultivarHarvestMonth" value="${i + 1}" ${cultivarHarvestMonths.has(i + 1) ? "checked" : ""}>
        <span>${h(label)}</span></label>`).join("")}</div>
      </fieldset>`;
    const propagationSelect = `<label class="form-field"><span>Come è nata la pianta?</span><select class="select" name="propagationMethod">
      ${["", ...propagationMethods].map((value) => `<option value="${h(value)}" ${(p.propagationMethod || "") === value ? "selected" : ""}>${h(value || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const sourceSelect = `<label class="form-field"><span>Provenienza del materiale</span><select class="select" name="materialSource">
      ${["", ...materialSources].map((value) => `<option value="${h(value)}" ${(p.materialSource || "") === value ? "selected" : ""}>${h(value || "Da indicare")}</option>`).join("")}
    </select></label>`;
    const sexSelect = `<label class="form-field"><span>Sesso botanico (solo se accertato)</span><select class="select" name="specimenSex">
      ${["", ...specimenSexes].map((value) => `<option value="${h(value)}" ${(p.specimenSex || "") === value ? "selected" : ""}>${h(value || "Non determinato / non pertinente")}</option>`).join("")}
    </select></label>`;
    return adminFrame(`<form id="plant-form" class="panel editor-panel" data-id="${h(id || "")}"
      data-species-id="${h(species?.id || "")}" data-species-version="${h(species?.__snapshotVersion || "")}"
      data-accepted-name="${h(p.name || "")}"
      data-cultivar-id="${h(cultivar?.id || "")}" data-cultivar-version="${h(cultivar?.__snapshotVersion || "")}"
      data-accepted-cultivar="${h(cultivar?.name || "")}">
      <div class="editor-heading"><div><h2>${id ? "Dettagli della pianta" : "Nuova scheda"}</h2>
        <p>Compila le informazioni e scegli se renderle visibili nel catalogo pubblico.</p></div>
        ${id && p.published ? `<a class="text-link" data-nav href="/piante/${encodeURIComponent(id)}">Vedi scheda pubblica ↗</a>` : ""}
      </div>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">01</span><div>
          <h3>Identificazione</h3><p>Specie, categoria e cultivar, se accertata.</p></div></div>
        <div class="form-grid">
          <label class="form-field full-width"><span>Specie (nome comune) *</span>
            <input class="input" name="name" value="${h(p.name || "")}" required maxlength="100"
              list="known-species" autocomplete="off" placeholder="Scrivi Avocado, Papaya...">
            <datalist id="known-species">${speciesChoices}</datalist>
            <small>Scrivi liberamente o scegli una specie già registrata.</small>
          </label>
          ${select}
          <label class="form-field full-width"><span>Cultivar accertata</span>
            <input class="input" name="cultivarName" list="known-cultivars" maxlength="100"
              autocomplete="off" value="${h(cultivar?.name || "")}" placeholder="Es. Hass, Bacon, Fuerte">
            <datalist id="known-cultivars">${cultivarChoices}</datalist>
            <small>La cultivar del frutto da cui hai estratto un seme non identifica automaticamente la nuova pianta.</small>
          </label>
          <p class="specimen-hint full-width" data-species-status role="status">${species ? "Specie registrata: informazioni botaniche recuperate." : ""}</p>
          <p class="profile-edit-warning full-width" data-shared-warning="species" role="status" hidden>Le modifiche alle caratteristiche della specie aggiorneranno anche gli altri esemplari collegati quando salvi.</p>
          <p class="profile-edit-warning full-width" data-shared-warning="cultivar" role="status" hidden>Le modifiche alle caratteristiche della cultivar aggiorneranno anche gli esemplari collegati quando salvi.</p>
        </div>
      </section>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">02</span><div>
          <h3>Questo esemplare</h3><p>Informazioni proprie della pianta, sempre private.</p></div></div>
        <div class="form-grid">
          <div class="full-width">${id ? `<label class="form-field"><span>Codice identificativo</span>
            <input class="input specimen-code" type="text" readonly value="${h(specimenCodeOf({ id }))}" aria-label="Codice breve della pianta">
            <small>È stabile, inizia con # e puoi copiarlo per riconoscere questo esemplare.</small></label>` :
            `<p class="specimen-hint">Un codice breve di 6 caratteri (A–Z e 0–9), preceduto da #, sarà assegnato al salvataggio.</p>`}</div>
          <label class="form-field"><span>Stato attuale</span><select class="select" name="lifeStage">
            ${["", ...lifeStages].map(value => `<option value="${h(value)}" ${(p.lifeStage || "") === value ? "selected" : ""}>${h(value || "Non specificato")}</option>`).join("")}
          </select></label>
          ${propagationSelect}
          ${inputField("Data di semina (se nota)", "sownOn", p.sownOn, "type='date'")}
          ${inputField("Posizione attuale (privata)", "plantLocation", p.plantLocation,
            "maxlength='120' placeholder='Es. balcone, vaso grande'")}
          <div class="full-width">${textareaField("Note private (mai pubblicate)", "internalNotes", p.internalNotes, "maxlength='5000'")}</div>
        </div>
      </section>
      <details class="editor-section editor-fold" id="editor-origin">
        <summary class="editor-fold-summary"><span>Provenienza e lotto di semina</span><small>Origine del materiale, frutto genitore e altri dati privati</small></summary>
        <div class="form-grid">
          ${inputField("Lotto di semina (facoltativo)", "lotName", p.lotName, "list='known-lots' maxlength='100' placeholder='Es. Papaya Formosa 2026-01'")}
          <p class="specimen-hint full-width">Usa lo stesso lotto soltanto per piante con data di semina e provenienza compatibili. In caso contrario crea un lotto distinto.</p>
          <datalist id="known-lots">${state.lots.filter(lot => lot.speciesId === (p.speciesId || species?.id))
             .map(lot => `<option value="${h(lot.name)}"></option>`).join("")}</datalist>
          ${inputField("Cultivar del frutto genitore (privata)", "seedSourceCultivar", p.seedSourceCultivar, "maxlength='100' placeholder='Es. Hass, senza attribuirla alla pianta'")}
          ${sourceSelect}
          <div class="full-width">${inputField("Dettagli della provenienza (privati)", "sourceDetails", p.sourceDetails,
            "maxlength='300' placeholder='Es. frutto del supermercato etichettato Formosa'")}</div>
          ${sexSelect}
        </div>
      </details>
      <details class="editor-section editor-fold" id="editor-botany">
        <summary class="editor-fold-summary"><span>Dati botanici della specie</span><small>Caratteristiche condivise, coltivazione, raccolta e clima</small></summary>
        <div class="form-grid">
          ${inputField("Nome scientifico", "scientificName", shared.scientificName, "maxlength='150'")}
          ${fruitSelect}
          ${habitSelect}
          <div class="full-width">${inputField("Altri nomi e sinonimi (separati da virgola)", "searchAliases", shared.searchAliases, "maxlength='250' placeholder='Es. maracujà, frutto della passione'")}</div>
          ${inputField("Origine geografica (pubblica)", "origin", shared.origin, "maxlength='150'")}
          ${pollinationSelect}
          ${potSelect}
          ${harvestSelector}
          ${inputField("Esposizione", "light", shared.light, "placeholder='Es. pieno sole' maxlength='120'")}
          ${inputField("Irrigazione", "water", shared.water, "placeholder='Es. moderata' maxlength='120'")}
          <div class="full-width">${textareaField("Descrizione pubblica della specie", "description", shared.description, "maxlength='3000'")}</div>
          ${inputField("Temperatura minima indicativa (°C)", "minColdC", shared.minColdC,
            "type='number' step='0.5' min='-40' max='25' inputmode='decimal' placeholder='Es. -3'")}
          ${inputField("Fonte HTTPS (facoltativa)", "coldSource", shared.coldSource,
            "type='url' inputmode='url' maxlength='500' placeholder='https://...'")}
          <div class="full-width">${textareaField("Note climatiche pubbliche", "coldNotes", shared.coldNotes, "maxlength='250'")}</div>
        </div>
        <p class="climate-help">La soglia è orientativa per una pianta adulta acclimatata in piena terra e un episodio breve. Durata, vento, cultivar e coltivazione in vaso possono cambiare l'esito. Valori sconosciuti restano vuoti.</p>
      </details>
      <details class="editor-section editor-fold" id="editor-cultivar">
        <summary class="editor-fold-summary"><span>Caratteristiche della cultivar</span><small>Solo per cultivar verificate; facoltativo</small></summary>
        <div class="form-grid">
          ${p.variety && !cultivar ? inputField("Varietà storica (da verificare)", "variety", p.variety, "maxlength='150'") :
            `<input type="hidden" name="variety" value="${h(p.variety || "")}">`}
          <div class="full-width">${textareaField("Caratteristiche del frutto", "cultivarFruitNotes", cultivarData.fruitNotes, "maxlength='750'")}</div>
          ${inputField("Minima cultivar (°C)", "cultivarMinColdC", cultivarData.minColdC,
            "type='number' step='0.5' min='-40' max='25' inputmode='decimal'")}
          ${cultivarPollination}
          ${inputField("Fonte climatica cultivar", "cultivarColdSource", cultivarData.coldSource,
            "type='url' maxlength='500' placeholder='https://...'")}
          <div class="full-width">${textareaField("Note climatiche cultivar", "cultivarColdNotes", cultivarData.coldNotes, "maxlength='250'")}</div>
          ${cultivarHarvest}
        </div>
      </details>
      <details class="editor-section editor-fold" id="editor-catalog">
        <summary class="editor-fold-summary"><span>Altri dettagli del catalogo</span><small>Informazioni facoltative relative a questo esemplare</small></summary>
        <div class="form-grid">
          ${inputField("Disponibilità (facoltativa)", "availability", p.availability, "placeholder='Es. su richiesta' maxlength='120'")}
          ${inputField("Prezzo indicativo (facoltativo)", "price", p.price, "placeholder='Es. 15 €' maxlength='50'")}
        </div>
      </details>
      <details class="editor-section editor-fold" id="editor-photo">
        <summary class="editor-fold-summary"><span>Fotografia</span><small>Aggiungi l'indirizzo HTTPS di una foto autentica</small></summary>
        <div class="form-grid">
          <div class="full-width">${inputField("URL HTTPS della foto", "imageUrl", p.imageUrl, "type='url' inputmode='url' maxlength='4096' placeholder='https://...'")}</div>
        </div>
        ${p.imageUrl && safeImageUrl(p.imageUrl) ? `<div class="editor-photo">${imageMarkup(p)}</div>` : ""}
      </details>
      <section class="editor-section">
        <div class="editor-section-heading"><span class="editor-step">03</span><div>
          <h3>Visibilità</h3><p>Decidi se mostrare l'esemplare nel catalogo pubblico.</p></div></div>
        <label class="visibility-toggle"><input type="checkbox" name="published" ${p.published ? "checked" : ""}>
          <span><strong>Pubblica nel catalogo</strong><small>Se disattivato, la scheda resta privata. La prima pubblicazione rende consultabili anche le informazioni botaniche condivise, che restano pubbliche anche se riporti l’esemplare in privato.</small></span></label>
        <p class="profile-edit-warning" data-publication-status role="status" ${p.published && ["Morta", "Ceduta"].includes(p.lifeStage) ? "" : "hidden"}>Questa pianta è contrassegnata come morta o ceduta, ma rimane pubblicata: verifica se vuoi mantenerla nel catalogo.</p>
      </section>
      <div class="editor-actions" aria-label="Azioni scheda pianta">
        <a href="/admin/piante" data-nav class="btn btn-outline">Annulla</a>
        <button class="btn btn-primary" type="submit">Salva pianta</button>
      </div>
      ${id ? `<div class="editor-danger"><p>L'eliminazione è definitiva e rimuove anche gli eventi automatici. Se il diario contiene osservazioni personali, per conservarle imposta lo stato a «Morta» o «Ceduta» invece di eliminare la scheda.</p>
        <button class="btn btn-danger" type="button" data-action="delete-plant" data-id="${h(id)}">Elimina pianta</button></div>` : ""}
    </form>
    ${id ? `<section class="panel diary-panel">
      <h2>Diario e storico delle modifiche</h2>
      <p>Annota attività, eventi e osservazioni. Le modifiche della scheda vengono registrate automaticamente. Se hai una bozza del diario e salvi la scheda, ti verrà chiesto di registrarle insieme.</p>
      <form id="journal-form" data-id="${h(id)}">
        <div class="form-grid">
          <label class="form-field"><span>Attività</span><select name="eventKind" class="select" required>
            ${journalKinds.map(kind => `<option value="${h(kind)}">${h(kind)}</option>`).join("")}
          </select></label>
          ${inputField("Data attività", "eventDate", new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), "type='date' required")}
          <div class="full-width">${textareaField("Osservazione", "eventNotes", "", "required maxlength='1500' placeholder='Es. rinvasata in substrato drenante'")}</div>
        </div>
        <button class="btn btn-primary" type="submit">Registra attività</button>
        <p role="status"></p>
      </form>
      ${state.journalError ? `<p class="notice error" role="alert">${h(state.journalError)}</p>` : ""}
      <ol class="diary-list">${state.journalEntries.map(entry => `<li class="diary-item">
        <span class="diary-date">${h(entry.eventDate || "Data non disponibile")}</span>
        <strong>${h(entry.type || "Modifica")}</strong>
        ${entry.note ? `<p>${h(entry.note)}</p>` : ""}
        ${Array.isArray(entry.changedFields) && entry.changedFields.length ?
          `<small>Campi modificati: ${h(entry.changedFields.join(", "))}</small>` : ""}
      </li>`).join("")}</ol>
      ${state.journalEntries.length === 0 ? `<p>Nessuna attività registrata.</p>` : ""}
    </section>` : ""}`, id ? "Modifica pianta" : "Aggiungi pianta",
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
    if ((state.route === "/admin/nuova" || state.route.startsWith("/admin/modifica/")) &&
        state.profilesError) return adminFrame(`<div class="panel" role="alert">${h(state.profilesError)}</div>`,
          "Schede botaniche non disponibili", "Nessuna modifica è stata eseguita.");
    if ((state.route === "/admin/nuova" || state.route.startsWith("/admin/modifica/")) &&
        (!state.profilesReady || !state.lotsReady)) return adminFrame(
          `<div class="panel" role="status">Caricamento specie e lotti di semina…</div>`,
          "Caricamento", "Preparazione dei dati condivisi.");
    if (state.route === "/admin/nuova") return editPage("");
    if (state.route.startsWith("/admin/modifica/")) {
      const id = decodeRouteId(state.route.slice("/admin/modifica/".length));
      return id ? editPage(id) : missingPlantPage();
    }
    if (state.route === "/admin/piante") return inventoryPage();
    if (state.route === "/admin/impostazioni") return settingsPage();
    return overviewPage();
  }

  return { adminPage };
}
