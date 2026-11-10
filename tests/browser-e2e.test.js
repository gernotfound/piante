import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PROJECT = "demo-piante-browser";
const EMAIL = "browser-owner@example.test";
const PASSWORD = "Only-For-Local-Emulator-123!";
const originalMain = readFileSync(join(ROOT, "src/main.js"), "utf8");
const hook = 'firebase = { ...authMod, ...dbMod, auth: authMod.getAuth(app), db: dbMod.getFirestore(app) };';
assert.equal(originalMain.split(hook).length, 2, "Il bootstrap Firebase è cambiato: aggiornare esplicitamente il test");
const sandboxMain = originalMain.replace(hook, hook + '\n' +
  'authMod.connectAuthEmulator(firebase.auth, "http://127.0.0.1:9099", { disableWarnings: true });\n' +
  'dbMod.connectFirestoreEmulator(firebase.db, "127.0.0.1", 8080);\n' +
  'window.__pianteTestReady = true;');
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
  const allowed = name === "/index.html" || name === "/styles.css" ||
    /^\/src\/[a-z-]+\.js$/.test(name) ||
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
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
});

test.after(async () => {
  await browser?.close();
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await environment?.cleanup();
});

async function openPage(context, route) {
  const page = await context.newPage();
  const forbidden = [];
  await page.route(/https:\/\/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com\//, async (intercept) => {
    forbidden.push(intercept.request().url());
    await intercept.abort();
  });
  page.sandboxRequests = forbidden;
  await page.goto(baseUrl + route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__pianteTestReady === true, null, { timeout: 45000 });
  return page;
}

async function login(page) {
  await page.locator('input[name="identity"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('#login-form button[type="submit"]').click();
  await page.locator(".stat-grid").waitFor({ state: "visible", timeout: 45000 });
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.content <= dimensions.viewport + 1,
    label + ": overflow orizzontale " + JSON.stringify(dimensions));
}

test("vetrina Mobile First: 320, 390, 768 e 1024 CSS px senza overflow", { timeout: 90000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true });
  try {
    const page = await openPage(context, "/");
    await page.locator(".hero").waitFor();
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 700 });
      await noOverflow(page, "Home " + width + "px");
      await page.goto(baseUrl + "/piante", { waitUntil: "domcontentloaded" });
      await page.locator("#search-form").waitFor();
      await noOverflow(page, "Catalogo " + width + "px");
    }
    assert.deepEqual(page.sandboxRequests, [], "Richieste fuori dagli emulatori");
  } finally {
    await context.close();
  }
});

test("browser: login, creazione, pubblicazione, conflitto tra schede, recupero, eliminazione e logout",
  { timeout: 180000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, hasTouch: true });
    try {
      const page = await openPage(context, "/login");
      await login(page);
      await noOverflow(page, "Dashboard 320px");
      await page.goto(baseUrl + "/admin/nuova", { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await noOverflow(page, "Editor 320px");
      await page.locator('input[name="name"]').fill("Avocado da browser");
      await page.locator('textarea[name="internalNotes"]').fill("Nota privata di test");
      await page.locator('input[name="published"]').check();
      await page.locator('#plant-form button[type="submit"]').click();
      await page.waitForURL("**/admin/piante", { timeout: 45000 });
      const link = await page.locator('a[href^="/admin/modifica/"]').first().getAttribute("href");
      const id = decodeURIComponent(link.split("/").pop());
      assert.equal((await getDoc(doc(owner, "privatePlants", id))).data().internalNotes, "Nota privata di test");
      const publicDoc = await getDoc(doc(guest, "catalog", id));
      assert.equal(publicDoc.data().name, "Avocado da browser");
      assert.equal(publicDoc.data().internalNotes, undefined);
      await page.goto(baseUrl + "/piante", { waitUntil: "domcontentloaded" });
      await page.locator(".plant-card").filter({ hasText: "Avocado da browser" })
        .waitFor({ timeout: 45000 });
      assert.equal((await page.locator("#app").innerText()).includes("Nota privata di test"), false);

      await page.goto(baseUrl + "/admin/modifica/" + encodeURIComponent(id),
        { waitUntil: "domcontentloaded" });
      await page.locator("#plant-form").waitFor({ timeout: 45000 });
      await page.locator('textarea[name="description"]').fill("Bozza locale da conservare");

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
      assert.equal((await getDoc(doc(guest, "catalog", id))).exists(), false);

      await page.goto(baseUrl + "/admin/impostazioni", { waitUntil: "domcontentloaded" });
      await page.locator(".settings-logout [data-action='logout']").click();
      await page.waitForURL("**/login", { timeout: 45000 });
      assert.deepEqual(page.sandboxRequests, [], "Richieste fuori dagli emulatori");
      assert.deepEqual(other.sandboxRequests, [], "Richieste fuori dagli emulatori");
    } finally {
      await context.close();
    }
  });
