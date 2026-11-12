import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { catalogProjection, specimenCodeOf } from "../../src/domain.js";
import { taxonId } from "../../src/taxonomy.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PROJECT = "demo-piante-browser";
const EMAIL = "browser-owner@example.test";
const PASSWORD = "Only-For-Local-Emulator-123!";
const originalMain = readFileSync(join(ROOT, "src/main.js"), "utf8");
const hook = 'firebase = { ...authMod, ...dbMod, auth: authMod.getAuth(app), db: dbMod.getFirestore(app) };';
assert.equal(originalMain.split(hook).length, 2, "Il bootstrap Firebase è cambiato: aggiornare esplicitamente il test");
const sandboxMain = originalMain.replace(hook, hook + '\n' +
  'authMod.connectAuthEmulator(firebase.auth, "http://127.0.0.1:9099", { disableWarnings: true });\n' +
  'dbMod.connectFirestoreEmulator(firebase.db, "127.0.0.1", 8080);\n' +
  'window.__pianteTestReady = true;') +
  '\nwindow.__pianteDebug = () => ({route: state.route, owner: state.owner,' +
  ' authReady: state.authReady, user: state.user?.uid || null,' +
  ' authUser: firebase?.auth.currentUser?.uid || null,' +
  ' inventoryReady: state.inventoryReady, inventoryError: state.inventoryError,' +
  ' codeRegistryStatus: state.codeRegistryStatus,' +
  ' error: state.error, flash: state.flash});' +
  '\nwindow.__pianteTestSetInventoryError = (value) => {' +
  ' state.inventoryError = value; renderUnlessEditing(); };' +
  '\nwindow.__pianteTestSetJournalSaving = (value) => { journalSaveInProgress = value; };' +
  '\nwindow.__pianteTestSetPublicErrors = (profile, catalog) => {' +
  ' state.publicProfilesError = profile; state.catalogError = catalog;' +
  ' updatePublicErrors(); render(); };' +
  '\nwindow.__pianteTestSnapshotRerender = () => renderUnlessEditing();' +
  '\nwindow.__pianteTestAuthRerender = () => renderAfterAuthChange();';
const sandboxConfig = [
  "export const firebaseConfig = {",
  '  apiKey: "demo-key",',
  '  authDomain: "demo-piante-browser.firebaseapp.com",',
  '  projectId: "demo-piante-browser",',
  '  appId: "1:123456789:web:local-emulator"',
  "};",
  "export const firebaseConfigured = true;"
].join("\n");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
function routeFile(req, res) {
  if (req.method !== "GET") { res.writeHead(405).end(); return; }
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const spaRoute = pathname === "/" || !pathname.includes(".");
  const name = spaRoute ? "/index.html" : pathname;
  const allowed = name === "/index.html" || /^\/styles\/[a-z-]+\.css$/.test(name) ||
    /^\/src\/(?:ui\/)?[a-z-]+\.js$/.test(name) ||
    /^\/(?:favicon(?:-\d+x\d+)?\.(?:svg|ico|png)|social-preview-v1\.png)$/.test(name);
  if (!allowed) { res.writeHead(404).end(); return; }
  const extension = name.slice(name.lastIndexOf("."));
  try {
    const contents = name === "/src/main.js" ? sandboxMain :
      name === "/src/config.js" ? sandboxConfig : readFileSync(join(ROOT, name.slice(1)));
    res.writeHead(200, {
      "Content-Type": mime[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(contents);
  } catch {
    res.writeHead(500).end();
  }
}

let httpServer;
let browser;
let environment;
let baseUrl;
let owner;
let guest;

test.before(async () => {
  // L'unico account di test viene creato nell'emulatore Auth locale.
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true })
    }
  );
  const user = await response.json();
  assert.ok(response.ok && user.localId, "Account Auth Emulator non creato: " + JSON.stringify(user));

  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: "127.0.0.1", port: 8080,
      rules: readFileSync(join(ROOT, "firestore.rules"), "utf8")
    }
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "siteOwner", "primary"), { uid: user.localId });
  });
  owner = environment.authenticatedContext(user.localId, { email: EMAIL }).firestore();
  guest = environment.unauthenticatedContext().firestore();

  httpServer = createServer(routeFile);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = "http://127.0.0.1:" + httpServer.address().port;
  browser = await chromium.launch({ headless: true,
    ...(process.env.PIANTE_CHROME_CHANNEL === "chrome" ? { channel: "chrome" } : {}),
    args: ["--no-sandbox"] });
});

test.after(async () => {
  await browser?.close();
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await environment?.cleanup();
});

async function openPage(context, route) {
  const page = await context.newPage();
  const diagnostic = [];
  page.on("pageerror", (err) => diagnostic.push("JavaScript: " + err.message));
  page.on("response", (response) => {
    if (new URL(response.url()).origin === "http://127.0.0.1:9099") {
      diagnostic.push("Auth emulator: " + response.status() + " " +
        new URL(response.url()).pathname);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostic.push("Console: " + message.text());
  });
  page.diagnostic = diagnostic;
  const forbidden = [];
  await page.route("**/*", async (intercept) => {
    const url = new URL(intercept.request().url());
    if (url.protocol === "https:" && [
      "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com"
    ].includes(url.hostname)) {
      forbidden.push(url.href);
      await intercept.abort();
    } else {
      await intercept.continue();
    }
  });
  page.sandboxRequests = forbidden;
  await page.goto(baseUrl + route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__pianteTestReady === true, null, { timeout: 45000 });
  return page;
}

async function login(page) {
  // Il primo onAuthStateChanged può ridisegnare il form: non compilare i campi prima della sua conclusione.
  await page.waitForFunction(() => window.__pianteDebug?.().authReady === true,
    null, { timeout: 30000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.evaluate(() => window.__pianteTestSnapshotRerender());
  assert.equal(await page.locator('input[name="email"]').inputValue(), EMAIL);
  assert.equal(await page.locator('input[name="password"]').inputValue(), PASSWORD);
  await page.locator('#login-form button[type="submit"]').click();
  try {
    await page.locator(".stat-grid").waitFor({ state: "visible", timeout: 25000 });
  } catch (err) {
    const ui = (await page.locator("#app").innerText()).slice(0, 1300);
    const state = await page.evaluate(() => window.__pianteDebug?.());
    throw new Error("Dashboard non visibile. Stato: " + JSON.stringify(state) +
      "; URL: " + page.url() +
      "; UI: " + ui +
      "; diagnostica: " + JSON.stringify(page.diagnostic.slice(-12)) +
      "; richieste cloud proibite: " + JSON.stringify(page.sandboxRequests) +
      "; causa: " + err.message);
  }
  await page.waitForFunction(() => window.__pianteDebug?.().codeRegistryStatus !== "loading");
  if (["uninitialized", "migrating"].includes(
    (await page.evaluate(() => window.__pianteDebug())).codeRegistryStatus)) {
    const button = page.locator('[data-action="activate-codes"]');
    await button.click();
    await button.waitFor({ state: "hidden", timeout: 45000 });
  }
}

async function expandEditor(page) {
  await page.locator("#plant-form details.editor-fold").evaluateAll(sections => {
    for (const section of sections) section.open = true;
  });
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.content <= dimensions.viewport + 1,
    label + ": overflow orizzontale " + JSON.stringify(dimensions));
}

test("vetrina Mobile First: tutti i viewport previsti senza overflow", { timeout: 90000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true });
  try {
    const page = await openPage(context, "/");
    await page.locator(".hero").waitFor();
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      await noOverflow(page, "Home " + width + "px");
      await page.goto(baseUrl + "/piante", { waitUntil: "domcontentloaded" });
      await page.locator("#search-form").waitFor();
      await noOverflow(page, "Catalogo " + width + "px");
    }
    await page.evaluate(() => window.__pianteTestSetPublicErrors("Profilo non disponibile", "Catalogo non disponibile"));
    await page.locator(".notice.error").filter({ hasText: "Profilo non disponibile" }).waitFor();
    await page.evaluate(() => window.__pianteTestSetPublicErrors("Profilo non disponibile", ""));
    assert.match(await page.locator(".notice.error").first().innerText(), /Profilo non disponibile/);
    await page.evaluate(() => window.__pianteTestSetPublicErrors("", ""));
    await page.locator("#catalog-search-input").fill("ricerca in corso");
    await page.locator("#catalog-search-input").evaluate((input) => input.blur());
    await page.evaluate(() => window.__pianteTestSnapshotRerender());
    await page.evaluate(() => window.__pianteTestAuthRerender());
    assert.equal(await page.locator("#catalog-search-input").inputValue(), "ricerca in corso");
    await page.locator("#catalog-search-input").fill("");
    await page.locator("#climate-minimum").selectOption("-5");
    await page.locator("#pollination-filter").selectOption("Autofertile");
    await page.locator("#harvest-filter").selectOption("9");
    await page.locator("#pot-filter").selectOption("Adatta");
    await page.evaluate(() => window.__pianteTestSnapshotRerender());
    assert.equal(await page.locator("#climate-minimum").inputValue(), "-5");
    assert.equal(await page.locator("#pollination-filter").inputValue(), "Autofertile");
    assert.equal(await page.locator("#harvest-filter").inputValue(), "9");
    assert.equal(await page.locator("#pot-filter").inputValue(), "Adatta");
    assert.deepEqual(page.sandboxRequests, [], "Richieste fuori dagli emulatori");
    await page.goto(baseUrl + "/piante/%", { waitUntil: "domcontentloaded" });
    await page.locator("h1").filter({ hasText: "Pianta non trovata" }).waitFor();
    assert.equal(page.diagnostic.filter((entry) => entry.startsWith("JavaScript:")).length, 0);
  } finally {
    await context.close();
  }
});

test("vetrina: piante omonime mostrano codici brevi distinti in scheda e dettaglio",
  { timeout: 90000 }, async () => {
    const ids = ["public-avocado-a", "public-avocado-b"];
    const codes = ids.map(id => specimenCodeOf({ id }));
    assert.notEqual(codes[0], codes[1], "I fixture devono produrre codici distinti");
    const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true });
    try {
      for (const id of ids) {
        await setDoc(doc(owner, "catalog", id), {
          name: "Avocado", description: "", category: "Tropicali da frutto"
        });
      }
      const page = await openPage(context, "/piante");
      await page.locator(".plant-card").filter({ hasText: "Avocado" }).first().waitFor();
      await page.waitForFunction(() =>
        document.querySelectorAll(".plant-card .public-specimen-code").length >= 2);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 700 });
        await noOverflow(page, "Codici omonimi " + width + "px");
        const shown = await page.locator(".plant-card .public-specimen-code").allInnerTexts();
        assert.deepEqual(new Set(shown), new Set(codes));
        for (const id of ids) {
          const card = page.locator('a.plant-card[href="/piante/' + id + '"]');
          assert.equal(await card.locator(".plant-name > span").first().innerText(), "Avocado");
          assert.equal(await card.locator(".public-specimen-code").innerText(), specimenCodeOf({ id }));
        }
      }
      await page.locator("#catalog-search-input").fill(codes[1]);
      await page.locator('#search-form button[type="submit"]').click();
      await page.locator(".plant-card").first().waitFor();
      assert.equal(await page.locator(".plant-card").count(), 1,
        "La ricerca pubblica deve distinguere le piante omonime tramite codice");
      assert.equal(await page.locator(".plant-card .public-specimen-code").innerText(), codes[1]);
      await page.goto(baseUrl + "/piante/" + ids[1], { waitUntil: "domcontentloaded" });
      await page.locator(".detail-title .public-specimen-code").waitFor();
      assert.equal(await page.locator(".detail-title .public-specimen-code").innerText(), codes[1]);
      assert.deepEqual(page.sandboxRequests, []);
    } finally {
      await context.close();
      for (const id of ids) await deleteDoc(doc(owner, "catalog", id));
    }
  });

test("browser: login, creazione, pubblicazione, conflitto tra schede, recupero, eliminazione e logout",
  { timeout: 180000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, hasTouch: true });
    try {
      const page = await openPage(context, "/login");
      await login(page);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 740 });
        await noOverflow(page, "Dashboard " + width + "px");
        assert.equal(await page.locator(".admin-bottom-nav").isVisible(), width < 1000,
          "Navigazione inferiore errata a " + width + "px");
        assert.equal(await page.locator(".admin-sidebar").isVisible(), width >= 1000,
          "Sidebar errata a " + width + "px");
      }
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto(baseUrl + "/admin/nuova", { waitUntil: "domcontentloaded" });
      try {
        await page.locator("#plant-form").waitFor({ timeout: 45000 });
         assert.equal(await page.locator("#plant-form details.editor-fold[open]").count(), 0,
           "Le sezioni avanzate sono chiuse inizialmente");
         await page.locator("#editor-botany summary").click();
         assert.equal(await page.locator('input[name="scientificName"]').isVisible(), true);
         await page.evaluate(() => window.__pianteTestSnapshotRerender());
         assert.equal(await page.locator("#editor-botany").evaluate(el => el.open), true,
           "Una notifica asincrona non deve richiudere il pannello aperto");
       await expandEditor(page);
      } catch (error) {
        const state = await page.evaluate(() => window.__pianteDebug?.());
        const body = (await page.locator("#app").innerText()).slice(0, 1000);
        throw new Error("Editor nuova pianta non pronto: " + JSON.stringify({
          url: page.url(), state, body, diagnostic: page.diagnostic.slice(-15)
        }) + "; " + error.message);
      }
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 740 });
        await noOverflow(page, "Editor " + width + "px");
        const actions = await page.locator("#plant-form .editor-actions").evaluate(element => {
          const cancel = element.querySelector('a[data-nav]').getBoundingClientRect();
          const save = element.querySelector('button[type="submit"]').getBoundingClientRect();
          return { position: getComputedStyle(element).position,
            cancelLeft: cancel.left, saveLeft: save.left, cancelTop: cancel.top, saveTop: save.top };
        });
        assert.equal(actions.position, "static", "I comandi non devono coprire il modulo a " + width + "px");
        assert.ok(actions.cancelLeft < actions.saveLeft && Math.abs(actions.cancelTop - actions.saveTop) < 2,
          "Annulla e Salva devono restare affiancati a " + width + "px");
        if (width < 1000) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const clearance = await page.evaluate(() => ({
            actionsBottom: document.querySelector("#plant-form .editor-actions").getBoundingClientRect().bottom,
            navigationTop: document.querySelector(".admin-bottom-nav").getBoundingClientRect().top
          }));
          assert.ok(clearance.actionsBottom <= clearance.navigationTop,
            "La navigazione mobile non deve coprire i comandi a " + width + "px");
        }
      }
      await page.setViewportSize({ width: 320, height: 740 });
      await page.locator('input[name="name"]').fill("Avocado da browser");
      await page.locator('input[name="scientificName"]').fill("Persea americana");
      assert.equal(await page.locator('input[name="scientificName"]').inputValue(), "Persea americana");
      assert.equal(await page.locator('input[name="cultivarName"]').inputValue(), "");
      await page.locator('select[name="propagationMethod"]').selectOption("Da seme");
      await page.locator('select[name="materialSource"]').selectOption("Frutto acquistato");
      await page.locator('input[name="sourceDetails"]').fill("Seme di avocado etichettato Hass");
      await page.locator('input[name="seedSourceCultivar"]').fill("Hass");
      await page.locator('select[name="lifeStage"]').selectOption("Piantina");
      await page.locator('input[name="lotName"]').fill("Lotto browser A");
      await page.locator('input[name="sownOn"]').fill("2026-05-01");
      await page.locator('input[name="plantLocation"]').fill("Balcone");
      await page.locator('select[name="category"]').selectOption("Tropicali da frutto");
      await page.locator('select[name="fruitType"]').selectOption("Tropicali e subtropicali");
      await page.locator('select[name="pollination"]').selectOption("Variabile");
      await page.locator('select[name="potSuitability"]').selectOption("Con accorgimenti");
      await page.locator('input[name="harvestMonth"][value="9"]').check();
      await page.locator('input[name="minColdC"]').fill("-5");
      await page.locator('input[name="searchAliases"]').fill("aguacate");
      await page.locator('textarea[name="internalNotes"]').fill("Nota privata di test");
      await page.locator('textarea[name="cultivarFruitNotes"]').fill("Dettaglio senza cultivar");
      await page.locator('input[name="published"]').check();
      await page.locator('#plant-form button[type="submit"]').click();
      await page.locator(".notice.error").filter({ hasText: "senza indicarne il nome" }).waitFor();
      assert.match(page.url(), /\/admin\/nuova/);
      assert.equal(await page.locator('textarea[name="cultivarFruitNotes"]').inputValue(),
        "Dettaglio senza cultivar", "Il dato varietale non deve essere cancellato da un errore");
      await page.locator('input[name="cultivarName"]').fill("Nuova cultivar non registrata");
      await page.locator('input[name="cultivarName"]').blur();
      assert.equal(await page.locator('textarea[name="cultivarFruitNotes"]').inputValue(),
        "Dettaglio senza cultivar", "Una cultivar digitata liberamente non deve svuotare la bozza");
      await page.locator('textarea[name="cultivarFruitNotes"]').fill("");
      await page.locator('input[name="cultivarName"]').fill("");
      await page.locator('input[name="cultivarName"]').blur();
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      await page.locator("#inventory-search-input").fill("ricerca privata non applicata");
      await page.locator("#inventory-search-input").evaluate((input) => input.blur());
      await page.evaluate(() => window.__pianteTestSnapshotRerender());
      assert.equal(await page.locator("#inventory-search-input").inputValue(),
        "ricerca privata non applicata");
      await page.locator("#inventory-search-input").fill("");
      await page.locator("#inventory-visibility").selectOption("Pubblicate");
      await page.locator("#inventory-visibility").evaluate((select) => select.blur());
      await page.evaluate(() => window.__pianteTestSnapshotRerender());
      assert.equal(await page.locator("#inventory-visibility").inputValue(), "Pubblicate");
      await page.locator("#inventory-visibility").selectOption("Tutte");
      await page.locator("#inventory-group").selectOption("Piante da frutto");
      await page.locator("#inventory-group").evaluate((select) => select.blur());
      await page.evaluate(() => window.__pianteTestSnapshotRerender());
      assert.equal(await page.locator("#inventory-group").inputValue(), "Piante da frutto");
      const link = await page.locator('a[href^="/admin/modifica/"]').first().getAttribute("href");
      const id = decodeURIComponent(link.split("/").pop());
      const savedPrivate = (await getDoc(doc(owner, "privatePlants", id))).data();
      assert.equal(await page.locator(".inventory-name .specimen-code").first().innerText(),
        specimenCodeOf({ id, ...savedPrivate }));
      assert.equal(savedPrivate.internalNotes, "Nota privata di test");
      assert.equal(savedPrivate.specimenLabel, undefined);
      assert.equal(savedPrivate.sourceDetails, "Seme di avocado etichettato Hass");
      assert.equal(savedPrivate.propagationMethod, "Da seme");
      assert.equal(savedPrivate.lifeStage, "Piantina");
      assert.equal(savedPrivate.seedSourceCultivar, "Hass");
      assert.equal(savedPrivate.lotName, "Lotto browser A");
      assert.ok(savedPrivate.speciesId);
      assert.equal(savedPrivate.cultivarId, "");
      assert.equal(savedPrivate.materialSource, "Frutto acquistato");
      assert.equal(savedPrivate.plantGroup, "Piante da frutto");
      const publicDoc = await getDoc(doc(guest, "catalog", id));
      assert.equal(publicDoc.data().name, "Avocado da browser");
      assert.equal(publicDoc.data().specimenCode, savedPrivate.specimenCode);
      assert.equal(publicDoc.data().minColdC, -5);
      assert.deepEqual(publicDoc.data().harvestMonths, [9]);
      assert.equal(publicDoc.data().pollination, "Variabile");
      assert.equal(publicDoc.data().internalNotes, undefined);
      assert.equal(publicDoc.data().sourceDetails, undefined);
      assert.equal(publicDoc.data().lifeStage, undefined);
      assert.equal(publicDoc.data().seedSourceCultivar, undefined);
      assert.equal(publicDoc.data().speciesId, savedPrivate.speciesId);
      assert.equal(publicDoc.data().specimenLabel, undefined);
      await page.goto(baseUrl + "/piante", { waitUntil: "domcontentloaded" });
      await page.locator(".plant-card").filter({ hasText: "Avocado da browser" })
        .waitFor({ timeout: 45000 });
      assert.equal(await page.locator(".plant-card .public-specimen-code").first().innerText(),
        specimenCodeOf({ id, ...savedPrivate }), "Il codice pubblico deve coincidere con quello dell'inventario");
      await page.goto(baseUrl + "/piante/" + encodeURIComponent(id), { waitUntil: "domcontentloaded" });
      await page.locator(".detail-title .public-specimen-code").waitFor();
      assert.equal(await page.locator(".detail-title .public-specimen-code").innerText(),
        specimenCodeOf({ id, ...savedPrivate }), "Il dettaglio deve mostrare lo stesso codice");
      await page.goto(baseUrl + "/piante", { waitUntil: "domcontentloaded" });
      await page.locator(".plant-card").filter({ hasText: "Avocado da browser" }).waitFor();
      assert.equal((await page.locator("#app").innerText()).includes("Nota privata di test"), false);
      await page.locator("#catalog-search-input").fill("aguacate");
      await page.locator('#search-form button[type="submit"]').click();
      assert.match(new URL(page.url()).searchParams.get("q"), /aguacate/);
      assert.equal(await page.locator(".plant-card").count(), 1);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".plant-card").filter({ hasText: "Avocado da browser" }).waitFor();
      await page.locator("[data-toggle-filters]").click();
      await page.locator("#climate-minimum").selectOption("-10");
      await page.locator('#climate-form button[type="submit"]').click();
      assert.equal(await page.locator(".plant-card").count(), 0);
      await page.goto(baseUrl + "/piante?gruppo=Piante+da+frutto&freddo=-5",
        { waitUntil: "domcontentloaded" });
      await page.locator(".plant-card").filter({ hasText: "Avocado da browser" }).waitFor();
      await noOverflow(page, "Filtri climatici 320px");

      await page.goto(baseUrl + "/admin/modifica/" + encodeURIComponent(id),
        { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('input.specimen-code[readonly]').inputValue(),
        specimenCodeOf({ id, ...savedPrivate }));
      assert.equal(await page.locator('input[name="specimenLabel"]').count(), 0);
      await page.locator('textarea[name="description"]').fill("Bozza locale da conservare");

      // Un errore del listener non deve rigenerare né svuotare un editor già modificato.
      await page.evaluate(() => window.__pianteTestSetInventoryError("Connessione interrotta"));
      await page.locator('#plant-form button[type="submit"]').click();
      await page.locator(".notice.error").waitFor({ state: "visible" });
      assert.match(await page.locator(".notice.error").innerText(), /Inventario non disponibile/);
      assert.equal(await page.locator('textarea[name="description"]').inputValue(),
        "Bozza locale da conservare");
      await page.evaluate(() => window.__pianteTestSetInventoryError(""));

      const other = await openPage(context, "/admin/modifica/" + encodeURIComponent(id));
      await other.locator("#plant-form").waitFor({ timeout: 45000 });
      await other.locator('input[name="name"]').fill("Avocado modificato altrove");
      await other.locator('#plant-form button[type="submit"]').click();
      await other.waitForURL("**/admin/piante", { timeout: 45000 });
      await page.locator('#plant-form button[type="submit"]').click();
      await page.locator('[data-action="reload-editor"]').waitFor({ timeout: 45000 });
      assert.equal(await page.locator('textarea[name="description"]').inputValue(),
        "Bozza locale da conservare");
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator('[data-action="reload-editor"]').click();
      assert.equal(await page.locator('input[name="name"]').inputValue(), "Avocado modificato altrove");

      page.once("dialog", (dialog) => dialog.accept());
      await page.locator('[data-action="delete-plant"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      assert.equal((await getDoc(doc(owner, "privatePlants", id))).exists(), false);
      assert.equal((await getDocs(collection(owner, "privatePlants", id, "events"))).size, 0);
      assert.equal((await getDoc(doc(guest, "catalog", id))).exists(), false);

      await page.goto(baseUrl + "/admin/impostazioni", { waitUntil: "domcontentloaded" });
      await page.locator(".settings-logout [data-action='logout']").waitFor();
      assert.equal(await page.locator("#username-form").count(), 0);
      assert.equal(await page.locator('[data-action="logout"]').count(), 1);
      assert.match(await page.locator(".admin-body").innerText(), /Email dell'account:/);
      await page.locator(".settings-logout [data-action='logout']").click();
      await page.waitForURL("**/login", { timeout: 45000 });
      assert.equal(await page.locator('#login-form input[name="identity"]').count(), 0);
      assert.equal(await page.locator('#login-form input[name="email"][type="email"]').count(), 1);
      await login(page);
      assert.match(page.url(), /\/admin/);
      await page.locator(".stat-grid").waitFor();
      assert.deepEqual(page.sandboxRequests, [], "Richieste fuori dagli emulatori");
      assert.deepEqual(other.sandboxRequests, [], "Richieste fuori dagli emulatori");
    } finally {
      await context.close();
    }
  });

test("scheda legacy: ID documentale autorevole e gruppo/fruttifera preservati", { timeout: 90000 }, async () => {
  const id = "esemplare-legacy";
  await environment.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "privatePlants", id), {
      id: "id-nel-record-diverso", name: "Fico d'India legacy", category: "Succulente",
      plantGroup: "Piante da frutto", fruitType: "Mediterranee", published: false
    });
  });
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  try {
    const page = await openPage(context, "/login");
    await login(page);
    await page.goto(baseUrl + "/admin/piante", { waitUntil: "domcontentloaded" });
    await page.locator('a[href="/admin/modifica/' + id + '"]').waitFor({ timeout: 45000 });
    await page.goto(baseUrl + "/admin/modifica/" + id, { waitUntil: "domcontentloaded" });
    await page.locator("#plant-form").waitFor({ timeout: 45000 });
    await expandEditor(page);
    assert.equal(await page.locator('input[name="name"]').inputValue(), "Fico d'India legacy");
    assert.equal(await page.locator('[data-fruit-type-field]').isVisible(), true);
    assert.equal(await page.locator('select[name="fruitType"]').inputValue(), "Mediterranee");
    assert.match(await page.locator("input.specimen-code").inputValue(), /^#[A-Z0-9]{6}$/);
    await page.locator('textarea[name="description"]').fill("Scheda storica aggiornata");
    assert.equal(await page.locator('textarea[name="description"]').inputValue(), "Scheda storica aggiornata");
    await page.locator('#plant-form button[type="submit"]').click();
    await page.waitForURL("**/admin/piante", { timeout: 45000 });
    const saved = (await getDoc(doc(owner, "privatePlants", id))).data();
    assert.equal(saved.description, "Scheda storica aggiornata");
    assert.equal(saved.plantGroup, "Piante da frutto");
    assert.equal(saved.fruitType, "Mediterranee");
    assert.equal(saved.id, "id-nel-record-diverso", "Metadati legacy non cancellati");
    await page.goto(baseUrl + "/admin/modifica/%", { waitUntil: "domcontentloaded" });
    await page.locator("h1").filter({ hasText: "Scheda non trovata" }).waitFor();
    assert.equal(page.diagnostic.filter((entry) => entry.startsWith("JavaScript:")).length, 0);
    assert.deepEqual(page.sandboxRequests, [], "Richieste fuori dagli emulatori");
  } finally {
    await context.close();
    await deleteDoc(doc(owner, "privatePlants", id));
  }
});


test("profili condivisi: specie manuale, cultivar distinta da seme, duplicazione e diario",
  { timeout: 130000 }, async () => {
    const legacyId = "legacy-avocado-shared";
    await environment.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "privatePlants", legacyId), {
        name: "Avocado", category: "Tropicali da frutto", published: false
      });
    });
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    try {
      const page = await openPage(context, "/login");
      await login(page);
      await page.goto(baseUrl + "/admin/nuova", { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('select[name="plantPreset"]').count(), 0);
      await page.locator('input[name="name"]').fill("Avocado");
      await page.locator('input[name="scientificName"]').fill("Persea americana");
      await page.locator('select[name="category"]').selectOption("Tropicali da frutto");
      await page.locator('input[name="searchAliases"]').fill("sinonimo avocado test");
      await page.locator('input[name="seedSourceCultivar"]').fill("Hass");
      await page.locator('select[name="lifeStage"]').selectOption("Piantina");
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      const entries = await getDocs(collection(owner, "privatePlants"));
      const fresh = entries.docs.find(d => d.id !== legacyId && d.data().name === "Avocado");
      assert.ok(fresh, "Nuovo esemplare non creato");
      const id = fresh.id;
      assert.equal(fresh.data().seedSourceCultivar, "Hass");
      assert.equal(fresh.data().cultivarId, "");
      await page.goto(baseUrl + "/admin/nuova", { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      await page.locator('input[name="scientificName"]').fill("Bozza botanica da preservare");
      await page.locator('input[name="name"]').fill("Avocado");
      page.once("dialog", dialog => dialog.dismiss());
      await page.locator('input[name="name"]').blur();
      assert.equal(await page.locator('input[name="name"]').inputValue(), "",
        "Rifiutando la sostituzione si deve ripristinare il nome precedente");
      assert.equal(await page.locator('input[name="scientificName"]').inputValue(),
        "Bozza botanica da preservare");
      page.once("dialog", dialog => dialog.accept());
      await page.locator('input[name="name"]').fill("SINONIMO AVOCADO TEST");
      await page.locator('input[name="name"]').blur();
      assert.equal(await page.locator('input[name="name"]').inputValue(), "Avocado");
      assert.equal(await page.locator('input[name="scientificName"]').inputValue(), "Persea americana");
      assert.equal(await page.locator('select[name="category"]').inputValue(), "Tropicali da frutto");
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      const matching = (await getDocs(collection(owner, "privatePlants"))).docs
        .filter(entry => entry.data().speciesId === fresh.data().speciesId);
      assert.ok(matching.length >= 2);
      assert.ok(matching.every(entry => entry.data().name === "Avocado"));
      await assert.rejects(getDoc(doc(guest, "plantProfiles", fresh.data().speciesId)),
        { code: "permission-denied" });
      assert.equal((await getDoc(doc(owner, "privatePlants", legacyId))).data().scientificName, undefined);
      await page.goto(baseUrl + "/admin/modifica/" + legacyId, { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('input[name="scientificName"]').inputValue(), "Persea americana");
      await page.goto(baseUrl + "/admin/modifica/" + id, { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      await page.locator('input[name="light"]').fill("Luce filtrata di prova");
       assert.equal(await page.locator('[data-shared-warning="species"]').isVisible(), true,
         "Deve apparire un avviso sulle modifiche condivise");
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      await page.goto(baseUrl + "/admin/modifica/" + legacyId, { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('input[name="light"]').inputValue(), "Luce filtrata di prova");
      await page.goto(baseUrl + "/admin/nuova?copy=" + encodeURIComponent(id),
        { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('input[name="name"]').inputValue(), "Avocado");
      assert.equal(await page.locator('input[name="seedSourceCultivar"]').inputValue(), "");
      assert.equal(await page.locator('input[name="sourceDetails"]').inputValue(), "");
      assert.equal(await page.locator('input[name="published"]').isChecked(), false);
      await page.goto(baseUrl + "/admin/modifica/" + id, { waitUntil: "domcontentloaded" });
      await page.locator("#journal-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      await page.evaluate(() => window.__pianteTestSetJournalSaving(true));
      await page.locator('#plant-form button[type="submit"]').click();
      await page.locator(".notice.error").filter({ hasText: "salvataggio del diario" }).waitFor();
      await page.evaluate(() => window.__pianteTestSetJournalSaving(false));
      await page.locator('textarea[name="eventNotes"]').fill("Rinvaso di prova");
      await page.locator('#journal-form button[type="submit"]').click();
      await page.locator(".diary-item").filter({ hasText: "Rinvaso di prova" })
        .waitFor({ timeout: 30000 });
      await page.locator('textarea[name="description"]').fill("Bozza della scheda da non perdere");
      await page.locator('textarea[name="eventNotes"]').fill("Attività non ancora registrata");
      await page.locator('#journal-form button[type="submit"]').click();
      await page.locator(".notice.error").filter({ hasText: "Salva prima le modifiche" }).waitFor();
      assert.equal(await page.locator('textarea[name="description"]').inputValue(),
        "Bozza della scheda da non perdere");
      assert.equal(await page.locator('textarea[name="eventNotes"]').inputValue(),
        "Attività non ancora registrata");
      page.once("dialog", dialog => dialog.accept());
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      assert.equal((await getDoc(doc(owner, "privatePlants", id))).data().description,
        "Bozza della scheda da non perdere");
      const events = (await getDocs(collection(owner, "privatePlants", id, "events")))
        .docs.map(d => d.data());
      assert.equal(events.filter(entry => entry.note === "Attività non ancora registrata").length, 1);
      assert.deepEqual(page.sandboxRequests, []);
    } finally {
      await context.close();
      await deleteDoc(doc(owner, "privatePlants", legacyId));
    }
  });

test("catalogo e inventario: cultivar riconoscibile, note climatiche senza numero e legacy",
  { timeout: 100000 }, async () => {
    const plantId = "ui-avocado-cultivar";
    const oldId = "ui-papaya-legacy";
    const speciesId = taxonId("species", "Avocado UI");
    const cultivarId = taxonId("cultivar", "Fuerte", speciesId);
    const plant = {
      name: "Avocado UI", scientificName: "Persea americana", category: "Tropicali da frutto",
      plantGroup: "Piante da frutto", fruitType: "Tropicali e subtropicali",
      speciesId, cultivarId, variety: "Fuerte", growthHabit: "Albero",
      coldNotes: "Proteggere dalle gelate persistenti.", published: true
    };
    const legacy = { name: "Papaya UI", category: "Tropicali da frutto",
      variety: "Formosa", description: "", published: true };
    await setDoc(doc(owner, "plantProfiles", speciesId), {
      kind: "species", name: "Avocado UI", public: true,
      scientificName: "Persea americana", category: "Tropicali da frutto",
      growthHabit: "Albero", coldNotes: "Proteggere dalle gelate persistenti."
    });
    await setDoc(doc(owner, "plantProfiles", cultivarId), {
      kind: "cultivar", name: "Fuerte", parentId: speciesId, public: true,
      fruitNotes: "Caratteristiche verificate del frutto"
    });
    await environment.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "privatePlants", plantId), plant);
      await setDoc(doc(ctx.firestore(), "privatePlants", oldId), legacy);
    });
    await setDoc(doc(owner, "catalog", plantId), catalogProjection(plant));
    await setDoc(doc(owner, "catalog", oldId), catalogProjection(legacy));
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    try {
      const page = await openPage(context, "/piante");
      const avocado = page.locator('.plant-card[href="/piante/' + plantId + '"]');
      await avocado.waitFor({ timeout: 45000 });
      assert.match(await avocado.locator(".plant-variety").innerText(), /Cultivar: Fuerte/);
      assert.equal((await avocado.locator(".plant-category").textContent()).trim(), "Tropicali da frutto");
      const papaya = page.locator('.plant-card[href="/piante/' + oldId + '"]');
      await papaya.waitFor();
      assert.match(await papaya.locator(".plant-variety").innerText(), /da verificare.*Formosa/);
      await noOverflow(page, "Catalogo cultivar 320px");
      await page.goto(baseUrl + "/piante/" + plantId, { waitUntil: "domcontentloaded" });
      await page.locator(".climate-detail").filter({ hasText: "Proteggere dalle gelate persistenti." }).waitFor();
      assert.match(await page.locator(".climate-detail").innerText(),
        /Informazioni sulla resistenza al freddo/);
      assert.doesNotMatch(await page.locator(".climate-detail").innerText(), /minima indicativa:/);
      assert.equal(await page.locator(".detail-variety").innerText(), "Cultivar: Fuerte");
      assert.match(await page.locator(".detail-properties").innerText(), /Forma di crescita[\s\S]*Albero/);
      assert.match(await page.locator(".detail-properties").innerText(), /Tipologia fruttifera/);
      assert.doesNotMatch(await page.locator(".detail-properties").innerText(), /Varietà/);
      await noOverflow(page, "Dettaglio cultivar 320px");
      await page.goto(baseUrl + "/login", { waitUntil: "domcontentloaded" });
      await login(page);
      await page.goto(baseUrl + "/admin/piante", { waitUntil: "domcontentloaded" });
      const row = page.locator(".inventory tr").filter({ hasText: "Avocado UI" });
      await row.waitFor({ timeout: 45000 });
      assert.equal(await row.locator(".inventory-variety").innerText(), "Cultivar: Fuerte");
      await noOverflow(page, "Inventario cultivar 320px");
      await page.goto(baseUrl + "/admin/modifica/" + plantId, { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await expandEditor(page);
      assert.equal(await page.locator('input[name="cultivarName"]').inputValue(), "Fuerte");
      assert.equal(await page.locator('textarea[name="cultivarFruitNotes"]').inputValue(),
        "Caratteristiche verificate del frutto");
      await page.locator('input[name="cultivarName"]').fill("Nuova cultivar");
      page.once("dialog", dialog => dialog.dismiss());
      await page.locator('input[name="cultivarName"]').blur();
      assert.equal(await page.locator('input[name="cultivarName"]').inputValue(), "Fuerte",
        "Il rifiuto del cambio di cultivar conserva il collegamento originale");
      assert.equal(await page.locator('textarea[name="cultivarFruitNotes"]').inputValue(),
        "Caratteristiche verificate del frutto");
      await page.locator('select[name="lifeStage"]').selectOption("Ceduta");
      await page.locator('[data-publication-status]').waitFor({ state: "visible" });
      assert.equal(await page.locator('input[name="published"]').isChecked(), true,
        "Lo stato Ceduta non deve cambiare la visibilità automaticamente");
      await page.locator('input[name="published"]').uncheck();
      assert.equal(await page.locator('[data-publication-status]').isVisible(), false);
      assert.deepEqual(page.sandboxRequests, []);
    } finally {
      await context.close();
      await deleteDoc(doc(owner, "catalog", plantId));
      await deleteDoc(doc(owner, "catalog", oldId));
      await deleteDoc(doc(owner, "privatePlants", plantId));
      await deleteDoc(doc(owner, "privatePlants", oldId));
    }
  });
