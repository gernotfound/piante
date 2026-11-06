import test from "node:test";
import assert from "node:assert/strict";
import { filterCatalog, filterInventory } from "../src/catalog.js";

const plants = [
  { id:"1", name:"Limone", scientificName:"Citrus limon", category:"Agrumi", published:true },
  { id:"2", name:"Mango", scientificName:"Mangifera indica", category:"Tropicali da frutto", published:false },
  { id:"3", name:"Avocado", scientificName:"Persea americana", category:"Tropicali da frutto", variety:"Hass", published:true }
];

test("catalogo: ricerca per nome, varietà o nome scientifico, senza distinzione maiuscole", () => {
  assert.deepEqual(filterCatalog(plants, { query:"  hass " }).map(p=>p.id), ["3"]);
  assert.deepEqual(filterCatalog(plants, { query:"CITRUS" }).map(p=>p.id), ["1"]);
  assert.deepEqual(filterCatalog(plants, { query:"mangifera" }).map(p=>p.id), ["2"]);
});

test("catalogo: filtra per categoria e ordina per nome senza cambiare la lista originale", () => {
  assert.deepEqual(filterCatalog(plants, { category:"Tropicali da frutto" }).map(p=>p.id), ["3","2"]);
  assert.deepEqual(filterCatalog(plants).map(p=>p.id), ["3","1","2"]);
  assert.equal(plants[0].id, "1");
  assert.deepEqual(filterCatalog([], { query:"avocado" }), []);
});

test("inventario: la visibilità privata distingue false, undefined e true", () => {
  const input = [...plants,{id:"4",name:"Annona",category:"Tropicali da frutto"}];
  assert.deepEqual(filterInventory(input,{visibility:"Pubblicate"}).map(p=>p.id), ["3","1"]);
  assert.deepEqual(filterInventory(input,{visibility:"Private"}).map(p=>p.id), ["4","2"]);
  assert.deepEqual(filterInventory(input,{query:"lim",visibility:"Private"}), []);
  assert.deepEqual(filterInventory(input,{query:"HASS",visibility:"Pubblicate"}).map(p=>p.id), ["3"]);
});

test("filtri: campi opzionali mancanti non provocano errori", () => {
  assert.deepEqual(filterCatalog([{id:"x",name:"Pianta"}],{query:"pianta"}).map(p=>p.id),["x"]);
  assert.deepEqual(filterInventory([{id:"x",name:"Pianta"}],{visibility:"Private"}).map(p=>p.id),["x"]);
});
