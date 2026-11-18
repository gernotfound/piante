"use strict";

const $ = id => document.getElementById(id);
const status = $("auth-status"), guest = $("admin-guest"), owner = $("admin-owner");
const list = $("admin-list"), listStatus = $("admin-list-status");
const details = $("admin-detail"), detailFields = $("admin-detail-fields");
const more = $("load-more");
let selected = "specimens", cursor = null, busy = false, generation = 0;

function message(text) { listStatus.textContent = text; }
function clearDetails() { details.hidden = true; detailFields.replaceChildren(); }

async function api(path, options) {
  const response = await fetch(path, { ...options, credentials: "same-origin",
    cache: "no-store", headers: { Accept: "application/json", ...(options?.headers || {}) } });
  if (!response.ok) {
    if (response.status === 403) throw new Error("access_denied");
    if (response.status === 409) throw new Error("conflict");
    if (response.status === 400) throw new Error("invalid_request");
    throw new Error("server_unavailable");
  }
  return response.json();
}

function label(record, type) {
  if (type === "taxa") return record.name || record.scientific_name || record.id;
  if (type === "seed-lots") return record.label || record.id;
  return record.display_label || record.taxon_name || record.code || record.id;
}

async function showDetail(id, type) {
  const stamp = generation;
  clearDetails();
  try {
    const data = await api("/api/v1/admin/" + type + "/" + encodeURIComponent(id));
    if (stamp !== generation) return;
    $("admin-detail-title").textContent = label(data, type);
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === "" || key === "id") continue;
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = key.replaceAll("_", " ");
      dd.textContent = String(value);
      detailFields.append(dt, dd);
    }
    renderEditForms(data, type);
    if (type === "specimens") renderJournal(data);
    details.hidden = false;
    details.scrollIntoView({ block: "nearest", behavior: "auto" });
  } catch {
    if (stamp === generation) message("Impossibile caricare il dettaglio. Riprova.");
  }
}

async function loadPage() {
  if (busy) return;
  busy = true;
  more.disabled = true;
  const stamp = generation;
  message("Caricamento…");
  try {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const data = await api("/api/v1/admin/" + selected + "?" + params);
    if (stamp !== generation) return;
    if (!Array.isArray(data.items)) throw new Error("invalid_response");
    for (const item of data.items) {
      const li = document.createElement("li"), button = document.createElement("button");
      button.type = "button";
      button.className = "admin-row";
      button.textContent = label(item, selected);
      button.addEventListener("click", () => showDetail(item.id, selected));
      li.append(button);
      list.append(li);
    }
    cursor = data.nextCursor;
    more.hidden = !cursor;
    message(list.children.length ? "Risultati: " + list.children.length : "Nessun elemento registrato.");
  } catch (error) {
    if (stamp === generation) {
      message(error.message === "access_denied" ? "Sessione scaduta. Ricarica per accedere." :
        "Il database non è disponibile. Riprova.");
    }
  } finally {
    busy = false;
    more.disabled = false;
  }
}

function selectType(type) {
  if (busy) return;
  generation++;
  selected = type;
  cursor = null;
  list.replaceChildren();
  clearDetails();
  $("admin-list-title").textContent = type === "taxa" ? "Specie e cultivar" :
    type === "seed-lots" ? "Lotti di semina" : "Le mie piante";
  more.hidden = true;
  loadPage();
}

$("show-specimens").addEventListener("click", () => selectType("specimens"));
$("show-taxa").addEventListener("click", () => selectType("taxa"));
$("show-lots").addEventListener("click", () => selectType("seed-lots"));
$("close-detail").addEventListener("click", clearDetails);
more.addEventListener("click", loadPage);
$("logout").addEventListener("click", async () => {
  $("logout").disabled = true;
  try {
    const data = await api("/api/auth/logout", { method: "POST" });
    if (!data.logoutUrl || !data.logoutUrl.startsWith("https://")) throw new Error("invalid_logout");
    window.location.assign(data.logoutUrl);
  } catch {
    $("logout").disabled = false;
    message("Non è stato possibile disconnettersi. Riprova.");
  }
});

(async () => {
  try {
    await api("/api/v1/admin/session");
    owner.hidden = false;
    status.textContent = "Accesso verificato.";
    selectType("specimens");
    refreshTaxa();
  } catch (error) {
    guest.hidden = false;
    status.textContent = error.message === "access_denied" ?
      "Accedi per gestire le tue piante." : "Servizio di accesso non disponibile.";
  }
})();


const formTaxon = $("taxon-create"), formCultivar = $("cultivar-create");
const formSpecimen = $("specimen-create"), writeStatus = $("admin-write-status");
let taxaLoaded = [];
let cultivarRevision = 0;

function writeMessage(value) { writeStatus.textContent = value; }
function writeError(error) {
  if (error.message === "conflict") return "Conflitto: il record è stato modificato o è già presente. Ricarica e verifica prima di riprovare.";
  if (error.message === "invalid_request") return "Controlla i campi e le associazioni inserite.";
  if (error.message === "access_denied") return "Sessione scaduta. Ricarica e accedi nuovamente.";
  return "Salvataggio non riuscito. I campi compilati sono stati conservati.";
}
function choices(select, items, empty) {
  const prior = select.value;
  select.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = empty;
  select.append(first);
  for (const data of items) {
    const option = document.createElement("option");
    option.value = data.id;
    option.textContent = data.name;
    select.append(option);
  }
  if (items.some(item => item.id === prior)) select.value = prior;
}
async function refreshTaxa() {
  const records = [];
  let next = null;
  const seen = new Set();
  try {
    do {
      const params = new URLSearchParams({ limit: "40" });
      if (next) params.set("cursor", next);
      const data = await api("/api/v1/admin/taxa?" + params);
      if (!Array.isArray(data.items)) throw new Error("invalid_response");
      records.push(...data.items);
      next = data.nextCursor;
      if (next && seen.has(next)) throw new Error("invalid_cursor");
      if (next) seen.add(next);
    } while (next && records.length < 800);
    taxaLoaded = records;
    const values = records.map(item => ({ id: item.id, name: item.name }));
    choices($("new-cultivar-taxon"), values, "Seleziona specie");
    choices($("new-specimen-taxon"), values, "Seleziona specie");
    choices($("new-lot-taxon"), values, "Seleziona specie");
    refreshCultivars();
    refreshLots();
  } catch {
    writeMessage("Impossibile caricare le specie. Le informazioni già inserite sono state conservate.");
  }
}
async function refreshCultivars() {
  const taxonId = $("new-specimen-taxon").value;
  const stamp = ++cultivarRevision;
  const select = $("new-specimen-cultivar");
  if (!taxonId) {
    choices(select, [], "Non specificata / pianta da seme");
    return;
  }
  try {
    const data = await api("/api/v1/admin/cultivars?taxon_id=" + encodeURIComponent(taxonId));
    if (stamp !== cultivarRevision || taxonId !== $("new-specimen-taxon").value) return;
    choices(select, data.items, "Non specificata / pianta da seme");
  } catch {
    if (stamp === cultivarRevision) writeMessage("Cultivar non disponibili. Controlla la connessione.");
  }
}
$("new-specimen-taxon").addEventListener("change", () => {
  refreshCultivars();
  refreshLots();
});

async function sendWrite(form, path, body, method = "POST") {
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  writeMessage("Salvataggio…");
  try {
    const saved = await api(path, { method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) });
    writeMessage("Salvato correttamente.");
    return saved;
  } catch (error) {
    writeMessage(writeError(error));
    return null;
  } finally { submit.disabled = false; }
}
formTaxon.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(formTaxon);
  const saved = await sendWrite(formTaxon, "/api/v1/admin/taxa", {
    name: String(data.get("name")).trim(),
    scientific_name: String(data.get("scientific_name")).trim() || null,
    category: String(data.get("category")).trim() || null
  });
  if (!saved) return;
  formTaxon.reset();
  await refreshTaxa();
  if (selected === "taxa") selectType("taxa");
});
formCultivar.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(formCultivar);
  const saved = await sendWrite(formCultivar, "/api/v1/admin/cultivars", {
    taxon_id: String(data.get("taxon_id")), name: String(data.get("name")).trim()
  });
  if (!saved) return;
  formCultivar.elements.namedItem("name").value = "";
  await refreshCultivars();
});
formSpecimen.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(formSpecimen);
  const saved = await sendWrite(formSpecimen, "/api/v1/admin/specimens", {
    taxon_id: String(data.get("taxon_id")),
    cultivar_id: String(data.get("cultivar_id")) || null,
    seed_lot_id: String(data.get("seed_lot_id")) || null,
    display_label: String(data.get("display_label")).trim() || null,
    private_location: String(data.get("private_location")).trim() || null,
    internal_notes: String(data.get("internal_notes")).trim() || null
  });
  if (!saved) return;
  formSpecimen.elements.namedItem("display_label").value = "";
  formSpecimen.elements.namedItem("private_location").value = "";
  formSpecimen.elements.namedItem("internal_notes").value = "";
  selectType("specimens");
});

function field(form, key, value, labelText, multiline = false) {
  const lbl = document.createElement("label");
  lbl.textContent = labelText;
  const control = document.createElement(multiline ? "textarea" : "input");
  control.name = key;
  control.id = "edit-" + key;
  lbl.htmlFor = control.id;
  if (multiline) control.rows = 3;
  if (key === "sown_on") control.type = "date";
  if (key === "cold_min_c") { control.type = "number"; control.step = "any"; }
  if (key === "image_url") control.type = "url";
  control.value = value === null || value === undefined ? "" : String(value);
  form.append(lbl, control);
}
function formAction(form, text) {
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "button button-primary";
  btn.textContent = text;
  form.append(btn);
}
function renderEditForms(data, type) {
  if (!Number.isSafeInteger(data.version)) return;
  const root = $("admin-detail");
  for (const old of root.querySelectorAll(".admin-edit-form")) old.remove();
  const form = document.createElement("form");
  form.className = "admin-form admin-edit-form";
  form.noValidate = false;
  const title = document.createElement("h3");
  title.textContent = "Modifica scheda";
  form.append(title);
  const config = type === "seed-lots" ? [
    ["label","Nome lotto"],["source_details","Provenienza privata",true],
    ["source_cultivar_label","Cultivar del frutto sorgente"],["private_notes","Note private",true],
    ["sown_on","Data semina"]
  ] : type === "taxa" ? [
    ["name","Nome comune"], ["scientific_name","Nome scientifico"],
    ["category","Categoria"], ["description","Descrizione",true],
    ["light","Esposizione"], ["water","Acqua"],
    ["pollination","Impollinazione",true], ["cold_min_c","Minima documentata (°C)"]
  ] : [
    ["display_label","Etichetta"],["life_stage","Stato della pianta"],
    ["private_location","Posizione privata"],["internal_notes","Note interne",true],
    ["sown_on","Data semina"],["image_url","Foto HTTPS"]
  ];
  for (const [key,labelText,multi] of config) field(form,key,data[key],labelText,multi);
  formAction(form,"Salva modifiche");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    for (const [key,value] of Object.entries(fields)) {
      if (key === "cold_min_c") fields[key] = value === "" ? null : Number(value);
      else fields[key] = String(value).trim() || null;
    }
    const saved = await sendWrite(form, "/api/v1/admin/" + type + "/" + data.id,
      { version:data.version, ...fields }, "PATCH");
    if (!saved) return;
    await showDetail(data.id,type);
    selectType(type);
  });
  root.append(form);

  if (type !== "specimens") return;
  const publicationForm = document.createElement("form");
  publicationForm.className = "admin-form admin-edit-form";
  const pubTitle = document.createElement("h3");
  pubTitle.textContent = "Catalogo pubblico";
  publicationForm.append(pubTitle);
  field(publicationForm,"summary",data.publication_summary,"Descrizione pubblica",true);
  field(publicationForm,"photo_url",data.publication_photo_url,"Foto pubblica HTTPS");
  formAction(publicationForm,data.published_at ? "Aggiorna pubblicazione" : "Pubblica pianta");
  publicationForm.addEventListener("submit", async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(publicationForm));
    const saved = await sendWrite(publicationForm,
      "/api/v1/admin/specimens/" + data.id + "/publication",
      {version:data.version,summary:String(fields.summary).trim() || null,
        photo_url:String(fields.photo_url).trim() || null},"PUT");
    if (!saved) return;
    await showDetail(data.id,"specimens");
    selectType("specimens");
  });
  if (data.published_at) {
    const remove = document.createElement("button");
    remove.className = "button button-secondary";
    remove.type = "button";
    remove.textContent = "Ritira dal catalogo";
    remove.addEventListener("click", async () => {
      if (!window.confirm("Ritirare la pianta dal catalogo pubblico?")) return;
      remove.disabled = true;
      try {
        const response = await api("/api/v1/admin/specimens/" + data.id + "/publication",
          {method:"DELETE",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({version:data.version})});
        if (response.published !== false) throw new Error("unexpected_response");
        writeMessage("Pianta ritirata dal catalogo.");
        await showDetail(data.id,"specimens");
        selectType("specimens");
      } catch(error) {
        writeMessage(writeError(error));
        remove.disabled = false;
      }
    });
    publicationForm.append(remove);
  }
  root.append(publicationForm);
}


let lotRevision = 0;
async function refreshLots() {
  const taxonId = $("new-specimen-taxon").value;
  const stamp = ++lotRevision;
  const select = $("new-specimen-lot");
  if (!taxonId) {
    choices(select, [], "Nessun lotto associato");
    return;
  }
  try {
    const data = await api("/api/v1/admin/seed-lots?limit=40&taxon_id=" + encodeURIComponent(taxonId));
    if (stamp !== lotRevision || taxonId !== $("new-specimen-taxon").value) return;
    if (!Array.isArray(data.items) || data.nextCursor)
      throw new Error("too_many_lots");
    choices(select,data.items.map(item=>({id:item.id,name:item.label})),"Nessun lotto associato");
  } catch {
    if (stamp === lotRevision) {
      choices(select, [], "Lotti non disponibili");
      writeMessage("Impossibile verificare i lotti. Non associare un lotto finché il caricamento non riesce.");
    }
  }
}
$("lot-create").addEventListener("submit", async event => {
  event.preventDefault();
  const form = $("lot-create"), data = new FormData(form);
  const saved = await sendWrite(form, "/api/v1/admin/seed-lots", {
    taxon_id: String(data.get("taxon_id")),
    label: String(data.get("label")).trim(),
    sown_on: String(data.get("sown_on")) || null,
    source_details: String(data.get("source_details")).trim() || null,
    source_cultivar_label: String(data.get("source_cultivar_label")).trim() || null,
    private_notes: String(data.get("private_notes")).trim() || null
  });
  if (!saved) return;
  for(const key of ["label","sown_on","source_details","source_cultivar_label","private_notes"])
    form.elements.namedItem(key).value="";
  await refreshLots();
  if(selected==="seed-lots")selectType("seed-lots");
});
function journalItem(record) {
  const li=document.createElement("li");
  const title=document.createElement("strong");
  title.textContent=(record.event_on || "")+" — "+(record.kind || "Osservazione");
  li.append(title);
  if(record.note){
    const note=document.createElement("p");
    note.textContent=record.note;
    li.append(note);
  }
  return li;
}
function renderJournal(specimen) {
  const previous=$("admin-detail").querySelector(".admin-journal");
  previous?.remove();
  const section=document.createElement("section");
  section.className="admin-journal";
  const title=document.createElement("h3");
  title.textContent="Diario di coltivazione";
  section.append(title);
  const list=document.createElement("ul");
  list.className="admin-journal-list";
  section.append(list);
  const message=document.createElement("p");
  message.setAttribute("role","status");
  section.append(message);
  const form=document.createElement("form");
  form.className="admin-form";
  field(form,"kind","","Intervento o osservazione");
  field(form,"event_on",new Date().toISOString().slice(0,10),"Data dell'evento");
  form.elements.namedItem("event_on").type="date";
  field(form,"note","","Note (facoltative)",true);
  formAction(form,"Registra nel diario");
  section.append(form);
  $("admin-detail").append(section);
  let cursor=null;
  const seen=new Set();
  async function loadJournal(){
    const params=new URLSearchParams({limit:"20"});
    if(cursor)params.set("cursor",cursor);
    try{
      const result=await api("/api/v1/admin/specimens/"+specimen.id+"/journal?"+params);
      if(!Array.isArray(result.items))throw new Error("invalid_response");
      for(const item of result.items)list.append(journalItem(item));
      cursor=result.nextCursor;
      if(cursor && seen.has(cursor))throw new Error("invalid_cursor");
      if(cursor)seen.add(cursor);
      message.textContent=list.children.length?list.children.length+" eventi": "Nessun evento registrato.";
      if(cursor){
        const btn=document.createElement("button");
        btn.type="button";
        btn.className="button button-secondary";
        btn.textContent="Altri eventi";
        btn.addEventListener("click",async()=>{btn.disabled=true;await loadJournal();btn.remove();});
        section.insertBefore(btn,form);
      }
    }catch{
      message.textContent="Diario non disponibile. Puoi riprovare aprendo nuovamente la scheda.";
    }
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const formData=new FormData(form);
    const saved=await sendWrite(form,"/api/v1/admin/specimens/"+specimen.id+"/journal",{
      kind:String(formData.get("kind")).trim(),event_on:String(formData.get("event_on")),
      note:String(formData.get("note")).trim()||null
    });
    if(!saved)return;
    form.elements.namedItem("kind").value="";
    form.elements.namedItem("note").value="";
    list.replaceChildren();
    cursor=null;
    seen.clear();
    for(const old of section.querySelectorAll("button"))if(old!==form.querySelector('button[type="submit"]'))old.remove();
    await loadJournal();
  });
  loadJournal();
}
