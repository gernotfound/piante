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
    throw new Error("server_unavailable");
  }
  return response.json();
}

function label(record, type) {
  if (type === "taxa") return record.name || record.scientific_name || record.id;
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
  $("admin-list-title").textContent = type === "taxa" ? "Specie e cultivar" : "Le mie piante";
  more.hidden = true;
  loadPage();
}

$("show-specimens").addEventListener("click", () => selectType("specimens"));
$("show-taxa").addEventListener("click", () => selectType("taxa"));
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
  } catch (error) {
    guest.hidden = false;
    status.textContent = error.message === "access_denied" ?
      "Accedi per gestire le tue piante." : "Servizio di accesso non disponibile.";
  }
})();
