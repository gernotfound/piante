import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = ["base", "public", "admin", "responsive"].map((name) => source(`../../styles/${name}.css`)).join("\n");
const ui = ["../../src/main.js", "../../src/ui/public.js", "../../src/ui/admin.js"].map(source).join("\n");
const html = source("../../index.html");

test("Mobile First: viewport responsive e breakpoint di progressivo ampliamento", () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(css, /@media \(min-width:380px\)/);
  assert.match(css, /@media \(min-width:600px\)/);
  assert.match(css, /@media \(min-width:760px\)/);
  assert.match(css, /@media \(min-width:1000px\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*min-width:\s*320px/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Navbar e gestionale: comandi accessibili al tocco anche senza hover", () => {
  assert.match(ui, /aria-controls="primary-navigation"/);
  assert.match(ui, /aria-expanded="\$\{state\.menuOpen\}"/);
  assert.match(ui, /aria-label="Navigazione gestionale mobile"/);
  assert.match(ui, /class="admin-bottom-nav"/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.inventory thead\{display:none\}/);
});

test("Ricerca e filtri fruttifere: moduli e URL condivisibili", () => {
  assert.match(ui, /id="traits-form"/);
  assert.match(ui, /id="climate-form"/);
  assert.match(ui, /data-fruit-filter/);
  assert.match(ui, /getHarvestFromUrl/);
  assert.match(ui, /params\.set\("raccolta", state\.harvestMonth\)/);
  assert.match(ui, /name="harvestMonth"/);
  assert.match(ui, /name="potSuitability"/);
  assert.match(ui, /name="pollination"/);
  assert.match(css, /\.harvest-months\{display:grid/);
});

test("Scheda privata: campi e controllo delle modifiche non salvate preservati", () => {
  assert.match(ui, /textareaField\("Note private \(mai pubblicate\)", "internalNotes"/, "Le note private devono essere parte del modulo");
  assert.match(ui, /function confirmDiscard\(/);
  assert.match(ui, /function renderUnlessEditing\(/);
  assert.match(ui, /beforeunload/);
  assert.match(ui, /journalSaveInProgress/, "Le navigazioni devono attendere il salvataggio del diario");
  assert.match(ui, /id="plant-form"/);
  assert.doesNotMatch(ui, /name="specimenLabel"/);
  assert.match(ui, /class="plant-title-line"/);
  assert.match(ui, /specimenCodeOf\(plant\)/);
  assert.doesNotMatch(ui, /name="plantPreset"/);
  assert.match(ui, /id="known-species"/);
  assert.match(ui, /name="cultivarName"/);
  assert.match(ui, /id="journal-form"/);
  assert.match(ui, /"lotName", p\.lotName/);
  assert.match(ui, /name="lifeStage"/);
  assert.match(ui, /"sourceDetails", p\.sourceDetails/);
  assert.doesNotMatch(ui, /name="plantGroup"/);
  assert.match(css, /\.form-field\[hidden\]\{display:none\}/);
});

test("Editor mobile: il recupero dei conflitti resta utilizzabile su schermi stretti", () => {
  assert.match(ui, /reload\.dataset\.action = "reload-editor"/);
  assert.match(ui, /reload\.textContent = "Ricarica la scheda"/);
  assert.match(ui, /plantSaveInProgress \|\| journalSaveInProgress \|\| !confirmDiscard\(\)/);
  assert.match(ui, /if \(plantSaveInProgress \|\| journalSaveInProgress\) return false/);
  assert.match(ui, /state\.inventoryReady = true/);
  assert.match(ui, /Caricamento dell'inventario/);
  assert.match(css, /\.notice\.error \.btn\{[^}]*max-width:100%/);
  assert.match(css, /\.notice\.error \.btn\{[^}]*white-space:normal/);
});
