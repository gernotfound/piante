import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { buildCloudflareSite } from "../../scripts/build-cloudflare-site.mjs";

const MIME = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"]
};
let directory;
let server;
let browser;
let url;

function specimen(i = 0, summary = "Descrizione pubblica") {
  return {
    id: "plant-" + String(i).padStart(3, "0"), code: "A" + String(i).padStart(5, "0"),
    taxon_name: "Pianta di prova", scientific_name: null, taxon_kind: "unverified",
    category: null, taxon_description: null, growth_habit: null,
    light: null, water: null, taxon_pollination: null, taxon_cold_min_c: null,
    cultivar_name: null, cultivar_fruit_notes: null, cultivar_cold_min_c: null,
    cultivar_pollination: null, summary, photo_url: null,
    published_at: new Date(Date.parse("2026-01-01T00:00:00Z") - i * 1000).toISOString()
  };
}
function json(data, status = 200) {
  return { status, contentType: "application/json; charset=utf-8", body: JSON.stringify(data) };
}

test.before(async () => {
  directory = mkdtempSync(join(tmpdir(), "piantee-cf-e2e-"));
  buildCloudflareSite(join(directory, "site"));
  server = createServer((req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const asset = MIME[path];
    if (!asset || req.method !== "GET") { res.writeHead(404).end(); return; }
    try {
      res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
      res.end(readFileSync(join(directory, "site", asset[0])));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ headless: true,
    ...(process.env.PIANTE_CHROME_CHANNEL === "chrome" ? { channel: "chrome" } : {}),
    args: ["--no-sandbox"] });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test("vetrina mobile e desktop senza overflow; scheda dettaglio e chiusura", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route("**/api/v1/catalog*", async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill(json(path.endsWith("/plant-000")
        ? specimen(0) : { items: [specimen(0)], nextCursor: null }));
    });
    await page.goto(url + "/", { waitUntil: "networkidle" });
    await page.locator(".plant-card").first().waitFor();
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, "Overflow orizzontale alla larghezza " + width + ": " + overflow);
    }
    assert.equal(await page.locator(".plant-card").count(), 1);
    await page.getByRole("button", { name: "Dettagli di Pianta di prova" }).click();
    await page.locator("#plant-dialog[open]").waitFor();
    assert.ok((await page.locator("#dialog-body").innerText()).includes("#A00000"));
    await page.getByRole("button", { name: "Chiudi dettagli" }).click();
    assert.equal(await page.locator("#plant-dialog").evaluate(element => element.open), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("paginazione e duplicati: non perde le piante già mostrate", async () => {
  const page = await browser.newPage();
  try {
    await page.route("**/api/v1/catalog*", async route => {
      const parsed = new URL(route.request().url());
      const next = parsed.searchParams.has("cursor");
      await route.fulfill(json(next
        ? { items: [specimen(19), specimen(20)], nextCursor: null }
        : { items: Array.from({ length: 20 }, (_, i) => specimen(i)), nextCursor: "next-page" }));
    });
    await page.goto(url + "/");
    await page.locator(".plant-card").nth(19).waitFor();
    await page.getByRole("button", { name: "Mostra altre piante" }).click();
    await page.locator(".plant-card").nth(20).waitFor();
    assert.equal(await page.locator(".plant-card").count(), 21);
    assert.equal(await page.getByRole("button", { name: "Mostra altre piante" }).isVisible(), false);
  } finally { await page.close(); }
});

test("errore di rete, riprova e catalogo realmente vuoto", async () => {
  const page = await browser.newPage();
  let calls = 0;
  try {
    await page.route("**/api/v1/catalog*", async route => {
      calls++;
      await route.fulfill(calls === 1 ? json({ error: { code: "service_unavailable" } }, 503)
        : json({ items: [], nextCursor: null }));
    });
    await page.goto(url + "/");
    await page.getByRole("button", { name: "Riprova" }).waitFor();
    assert.ok((await page.locator("#catalog-status").innerText()).includes("non è disponibile"));
    await page.getByRole("button", { name: "Riprova" }).click();
    await page.getByText("Non ci sono ancora piante pubblicate.").waitFor();
    assert.equal(await page.locator(".plant-card").count(), 0);
    assert.equal(calls, 2);
  } finally { await page.close(); }
});

test("testo pubblico non è interpretato come HTML eseguibile", async () => {
  const page = await browser.newPage();
  try {
    const malicious = specimen(0, "<img src=x onerror=window.injectedByCatalog=true>");
    await page.route("**/api/v1/catalog*", async route =>
      route.fulfill(json({ items: [malicious], nextCursor: null })));
    await page.goto(url + "/");
    await page.locator(".plant-card").first().waitFor();
    assert.equal(await page.evaluate(() => window.injectedByCatalog === true), false);
    assert.equal(await page.locator(".plant-card img").count(), 0);
    assert.ok((await page.locator(".plant-description").innerText()).includes("<img"));
  } finally { await page.close(); }
});
