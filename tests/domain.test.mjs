import test from "node:test";
import assert from "node:assert/strict";
import {
  validUsername, usernameValue, imageUrl, escapeHtml,
  makePrivatePlant, toPublicPlant, filterPlants, allTags, cleanProfile
} from "../web/scripts/domain.mjs";

test("username normalizzato, rotte riservate e collisioni visive", () => {
  assert.equal(usernameValue("  GiArDiNo-23 "), "giardino-23");
  assert.equal(validUsername("giardino-23"), true);
  for (const name of ["app","login","admin","ab","-start","end-","a--b","piante/altro"]) {
    assert.equal(validUsername(name), false, name);
  }
});
test("URL immagini: soltanto HTTPS oppure asset statici sicuri", () => {
  assert.equal(imageUrl("javascript:alert(1)"), "");
  assert.equal(imageUrl("http://example.com/x.jpg"), "");
  assert.equal(imageUrl("/images/../../private.webp"), "");
  assert.equal(imageUrl("https://user:pass@example.com/x.jpg"), "");
  assert.equal(imageUrl("/images/avocado.webp"), "/images/avocado.webp");
  assert.equal(imageUrl("https://images.example.com/uno.webp"), "https://images.example.com/uno.webp");
});
test("pubblicazione opt-in e allowlist separata dal documento privato", () => {
  const privatePlant = makePrivatePlant({
    name:"Avocado", scientificName:"Persea americana", description:"Nota privata",
    imageUrl:"https://images.example.com/p.webp", tags:["Esotica","Esotica"],
    published:false, shareScientificName:true, shareTags:true, shareImage:false
  });
  assert.equal(toPublicPlant(privatePlant), null);
  assert.deepEqual(privatePlant.tags, ["Esotica"]);
  const published = toPublicPlant({...privatePlant, published:true});
  assert.deepEqual(Object.keys(published).sort(), ["name","scientificName","tags","updatedAt"].sort());
  assert.equal("description" in published, false);
  assert.equal("imageUrl" in published, false);
});
test("filtri pubblici usano esclusivamente i tag pubblicati", () => {
  const plants=[{name:"Avocado",tags:["Esotica"]},{name:"Limone",tags:["Agrumi"]}];
  assert.deepEqual(allTags(plants),["Agrumi","Esotica"]);
  assert.deepEqual(filterPlants(plants,"avo","Esotica").map(x=>x.name),["Avocado"]);
  assert.deepEqual(filterPlants(plants,"","Esotica").map(x=>x.name),["Avocado"]);
});
test("escaping HTML e campi profilo", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
  assert.throws(() => cleanProfile({displayName:""}),/nome/);
  assert.equal(cleanProfile({displayName:"Giardino",about:"Ciao",visible:false}).visible,false);
});
