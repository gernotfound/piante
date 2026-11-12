import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1];

function attributes(element) {
  return Object.fromEntries([...element.matchAll(/([a-z][\w:-]*)="([^"]*)"/gi)]
    .map((match) => [match[1], match[2]]));
}

function headElements(tag) {
  return [...(head || "").matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map((m) => attributes(m[0]));
}

function meta(property, key = "property") {
  return headElements("meta").find((node) => node[key] === property)?.content;
}

function pngSize(filename) {
  const buffer = readFileSync(join(root, filename));
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", filename);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test("la favicon approvata è vettoriale e servita con fallback per browser", () => {
  const icons = headElements("link").filter((link) => link.rel === "icon");
  assert.ok(icons.some((link) => link.href === "/favicon.svg" && link.type === "image/svg+xml"));
  assert.ok(icons.some((link) => link.href === "/favicon.ico"));
  for (const size of [16, 32]) {
    assert.ok(icons.some((link) => link.href === `/favicon-${size}x${size}.png`));
  }
  for (const icon of icons) assert.ok(readFileSync(join(root, icon.href.slice(1))).length > 0);
  const svg = readFileSync(join(root, "favicon.svg"), "utf8");
  assert.match(svg, /<svg\s/);
  assert.match(svg, /<path\b/);
  assert.doesNotMatch(svg, /<image\b|data:image\//i);
  assert.equal(readFileSync(join(root, "favicon.ico")).subarray(0, 4).toString("hex"), "00000100");
  for (const size of [16, 32, 48]) {
    assert.deepEqual(pngSize(`favicon-${size}x${size}.png`), [size, size]);
  }
  assert.doesNotMatch(head, /rel="manifest"|apple-touch-icon/i);
});

test("Open Graph e Twitter sono accessibili ai crawler senza eseguire JavaScript", () => {
  for (const prop of ["og:type", "og:locale", "og:site_name", "og:title", "og:description", "og:url", "og:image", "og:image:width", "og:image:height", "og:image:alt"]) {
    assert.ok(meta(prop), `metadato mancante: ${prop}`);
  }
  assert.equal(meta("og:type"), "website");
  assert.equal(meta("og:locale"), "it_IT");
  assert.equal(meta("og:site_name"), "Piantee");
  assert.equal(meta("og:url"), "https://piantee.web.app/");
  assert.equal(meta("og:image"), "https://piantee.web.app/social-preview-v1.png");
  assert.equal(meta("og:image:secure_url"), meta("og:image"));
  assert.equal(meta("og:image:type"), "image/png");
  assert.equal(meta("og:image:width"), "1200");
  assert.equal(meta("og:image:height"), "630");
  assert.equal(meta("twitter:card", "name"), "summary_large_image");
  assert.equal(meta("twitter:image", "name"), meta("og:image"));
  assert.deepEqual(pngSize("social-preview-v1.png"), [1200, 630]);
  assert.equal(meta("og:description"), meta("description", "name"));
  assert.equal(meta("og:title"), html.match(/<title>(.*?)<\/title>/)?.[1]);
});

test("Il marchio usa la favicon SVG già approvata e il nome Piantee", () => {
  const publicUi = readFileSync(join(root, "src/ui/public.js"), "utf8");
  const adminUi = readFileSync(join(root, "src/ui/admin.js"), "utf8");
  const css = readFileSync(join(root, "styles/public.css"), "utf8");
  const brandIcon = /<img class="brand-symbol" src="\/favicon\.svg" width="36" height="36" alt="" aria-hidden="true">Piantee/g;
  assert.equal([...publicUi.matchAll(brandIcon)].length, 2, "Intestazione e footer usano il marchio condiviso");
  assert.equal([...adminUi.matchAll(brandIcon)].length, 1, "La sidebar usa il marchio condiviso");
  assert.match(publicUi, /aria-label="Piantee, torna alla home"/);
  assert.doesNotMatch(publicUi + adminUi, /class="brand-symbol"[^>]*>✳|brand-dot/);
  assert.match(css, /\.brand-symbol\{[^}]*object-fit:contain/);
  assert.match(html, /<title>Piantee — Vivaio e catalogo botanico<\/title>/);
  assert.equal(meta("og:title"), "Piantee — Vivaio e catalogo botanico");
});
