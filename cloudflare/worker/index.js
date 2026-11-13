// Worker-side API only. This module must never be copied into public static assets.
// The admin surface is intentionally unavailable until CF-03 has verified auth.
const CATALOG_PATH = "/api/v1/catalog";
const CATEGORIES_PATH = "/api/v1/catalog/categories";
const ITEM_PATH = /^\/api\/v1\/catalog\/([A-Za-z0-9_-]{1,96})$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;
const MAX_SEARCH_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 120;
const MAX_CATEGORY_OPTIONS = 200;

// An explicit public allowlist provides a second defense if the SQL view evolves.
// Anonymous queries must never read private specimen, lot or journal tables.
const PUBLIC_FIELDS = [
  "id", "code", "taxon_name", "scientific_name", "taxon_kind",
  "category", "taxon_description", "growth_habit", "light", "water",
  "taxon_pollination", "taxon_cold_min_c", "cultivar_name", "cultivar_fruit_notes",
  "cultivar_cold_min_c", "cultivar_pollination", "summary", "photo_url", "published_at"
];
const PUBLIC_COLUMNS = PUBLIC_FIELDS.join(", ");

function publicRow(row) {
  if (!row || typeof row !== "object" ||
      typeof row.id !== "string" || !ID_PATTERN.test(row.id) ||
      typeof row.published_at !== "string" || row.published_at.length > 40) {
    throw new Error("Database returned an invalid public row");
  }
  const projected = {};
  for (const field of PUBLIC_FIELDS) {
    if (!Object.hasOwn(row, field)) throw new Error("Database omitted a public field");
    projected[field] = row[field];
  }
  return projected;
}

// Only fixed fragments appear in SQL; user input always goes through bind().
const ORDER_SQL = "ORDER BY published_at DESC, id DESC LIMIT ?";
const SEARCH_SQL = "(taxon_name LIKE ? ESCAPE '!' OR scientific_name LIKE ? ESCAPE '!' OR cultivar_name LIKE ? ESCAPE '!' OR code LIKE ? ESCAPE '!')";
const AFTER_SQL = "(published_at < ? OR (published_at = ? AND id < ?))";
const CATEGORIES_SQL = `SELECT DISTINCT category FROM public_catalog
  WHERE category IS NOT NULL AND trim(category) != ''
  ORDER BY category COLLATE NOCASE, category LIMIT ?`;
const DETAIL_SQL = `SELECT ${PUBLIC_COLUMNS} FROM public_catalog WHERE id = ? LIMIT 1`;

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

class InvalidInput extends Error {}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders }
  });
}

function failure(status, code, extraHeaders) {
  return json({ error: { code } }, status, extraHeaders);
}

function parseLimit(params) {
  const raw = params.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  if (!/^[1-9][0-9]{0,1}$/.test(raw)) throw new InvalidInput("Invalid limit");
  const value = Number(raw);
  if (value > MAX_LIMIT) throw new InvalidInput("Page too large");
  return value;
}

function parseCursor(raw) {
  if (raw === null) return null;
  if (!CURSOR_PATTERN.test(raw)) throw new InvalidInput("Invalid cursor");
  try {
    const decoded = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
    if (!Array.isArray(decoded) || decoded.length !== 2 ||
        typeof decoded[0] !== "string" || decoded[0].length < 1 || decoded[0].length > 40 ||
        typeof decoded[1] !== "string" || !ID_PATTERN.test(decoded[1])) {
      throw new InvalidInput("Invalid cursor content");
    }
    return decoded;
  } catch {
    throw new InvalidInput("Invalid cursor encoding");
  }
}

function encodeCursor(row) {
  return btoa(JSON.stringify([row.published_at, row.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function optionalFilter(params, key, maxLength) {
  if (!params.has(key)) return null;
  const value = params.get(key).trim();
  if (!value || value.length > maxLength || /[\\u0000-\\u001f\\u007f]/.test(value)) {
    throw new InvalidInput("Invalid filter");
  }
  return value;
}

function parseListParams(params) {
  for (const key of params.keys()) {
    if (!["limit", "cursor", "q", "category"].includes(key) || params.getAll(key).length !== 1) {
      throw new InvalidInput("Unknown or duplicated parameter");
    }
  }
  return {
    limit: parseLimit(params),
    cursor: parseCursor(params.get("cursor")),
    q: optionalFilter(params, "q", MAX_SEARCH_LENGTH),
    category: optionalFilter(params, "category", MAX_CATEGORY_LENGTH)
  };
}

// LIKE metacharacters are literal user text, not a user-controlled wildcard.
function literalLike(value) {
  return "%" + value.replace(/[!%_]/g, char => "!" + char) + "%";
}

function dbFromEnv(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") return null;
  return env.DB;
}

async function listCatalog(db, { limit, cursor, q, category }) {
  const clauses = [];
  const binds = [];
  if (q) {
    const term = q.startsWith("#") ? q.slice(1) : q;
    if (!term) throw new InvalidInput("Invalid code search");
    const pattern = literalLike(term);
    clauses.push(SEARCH_SQL);
    binds.push(pattern, pattern, pattern, pattern);
  }
  if (category) {
    clauses.push("category = ? COLLATE NOCASE");
    binds.push(category);
  }
  if (cursor) {
    clauses.push(AFTER_SQL);
    binds.push(cursor[0], cursor[0], cursor[1]);
  }
  const sql = `SELECT ${PUBLIC_COLUMNS} FROM public_catalog
    ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""}
    ${ORDER_SQL}`;
  const result = await db.prepare(sql).bind(...binds, limit + 1).all();
  if (result?.success !== true || !Array.isArray(result.results)) {
    throw new Error("Database returned an unexpected result");
  }
  const hasMore = result.results.length > limit;
  const items = result.results.slice(0, limit).map(publicRow);
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}

async function listCategories(db) {
  const result = await db.prepare(CATEGORIES_SQL).bind(MAX_CATEGORY_OPTIONS + 1).all();
  if (result?.success !== true || !Array.isArray(result.results) ||
      result.results.length > MAX_CATEGORY_OPTIONS) {
    throw new Error("Category list is not available");
  }
  const categories = result.results.map(row => {
    if (!row || typeof row.category !== "string" ||
        !row.category.trim() || row.category.length > MAX_CATEGORY_LENGTH) {
      throw new Error("Invalid category");
    }
    return row.category;
  });
  return { categories };
}

async function getCatalogItem(db, id) {
  const row = await db.prepare(DETAIL_SQL).bind(id).first();
  if (row === null) return null;
  const publicRecord = publicRow(row);
  if (publicRecord.id !== id) throw new Error("Database returned an unexpected row");
  return publicRecord;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Nothing under /api can ever fall through to an SPA or static-asset 200.
    if (path === "/api" || path.startsWith("/api/")) {
      if (path === "/api/v1/admin" || path.startsWith("/api/v1/admin/")) {
        return failure(403, "admin_unavailable");
      }
      const isList = path === CATALOG_PATH;
      const isCategories = path === CATEGORIES_PATH;
      const item = path.match(ITEM_PATH);
      if (!isList && !isCategories && !item) return failure(404, "not_found");
      if (request.method !== "GET") return failure(405, "method_not_allowed", { Allow: "GET" });
      if (!isList && url.search) return failure(400, "invalid_request");

      let page;
      try {
        if (isList) page = parseListParams(url.searchParams);
      } catch {
        return failure(400, "invalid_request");
      }

      // Missing bindings and D1 failures must not be presented as an empty catalog.
      const db = dbFromEnv(env);
      if (!db) return failure(503, "service_unavailable");
      try {
        if (isList) return json(await listCatalog(db, page));
        if (isCategories) return json(await listCategories(db));
        const record = await getCatalogItem(db, item[1]);
        return record === null ? failure(404, "not_found") : json(record);
      } catch (error) {
        if (error instanceof InvalidInput) return failure(400, "invalid_request");
        // Do not expose D1 errors, binding names or query text to visitors.
        return failure(503, "service_unavailable");
      }
    }

    // Asset-first static routing is configured separately in CF-02. When the
    // asset binding is not present, do not claim to serve a valid application.
    if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return failure(404, "not_found");
  }
};
