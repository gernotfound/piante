import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = source("../styles.css");
const ui = source("../src/main.js");
const html = source("../index.html");

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

test("Scheda privata: campi e controllo delle modifiche non salvate preservati", () => {
  assert.match(ui, /name="internalNotes"/, "Le note private devono essere parte del modulo");
  assert.match(ui, /function confirmDiscard\(/);
  assert.match(ui, /function renderUnlessEditing\(/);
  assert.match(ui, /beforeunload/);
  assert.match(ui, /id="plant-form"/);
});
