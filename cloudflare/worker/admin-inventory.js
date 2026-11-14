// Trusted private inventory reads. The Worker must authenticate the single owner
// before calling any function in this module; no private row is queried for guests.
const ID = /^[A-Za-z0-9_-]{1,96}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const MAX_LIMIT = 40;
const DEFAULT_LIMIT = 20;

export class InvalidAdminQuery extends Error {}

const SPECIMEN_LIST_FIELDS = [
  "id", "code", "taxon_id", "taxon_name", "cultivar_id", "cultivar_name",
  "seed_lot_id", "display_label", "life_stage", "image_url",
  "updated_at", "version", "published_at"
];
const SPECIMEN_DETAIL_FIELDS = [
  ...SPECIMEN_LIST_FIELDS,
  "propagation_method", "source_details", "private_location", "internal_notes",
  "sown_on", "created_at", "seed_lot_label"
];
const TAXON_LIST_FIELDS = [
  "id", "kind", "name", "scientific_name", "category", "updated_at", "version"
];
const TAXON_DETAIL_FIELDS = [
  ...TAXON_LIST_FIELDS, "name_key", "description", "growth_habit", "light",
  "water", "pollination", "cold_min_c", "cold_source_url", "cold_notes", "created_at"
];

const SPECIMEN_FROM = `FROM specimens AS s
  JOIN taxa AS t ON t.id = s.taxon_id
  LEFT JOIN cultivars AS c ON c.id = s.cultivar_id
  LEFT JOIN public_listings AS l ON l.specimen_id = s.id`;

const SPECIMEN_LIST_SQL = `SELECT s.id AS id, s.code AS code, s.taxon_id AS taxon_id,
  t.name AS taxon_name, s.cultivar_id AS cultivar_id, c.name AS cultivar_name,
  s.seed_lot_id AS seed_lot_id, s.display_label AS display_label,
  s.life_stage AS life_stage, s.image_url AS image_url,
  s.updated_at AS updated_at, s.version AS version,
  l.published_at AS published_at ${SPECIMEN_FROM}`;

const SPECIMEN_DETAIL_SQL = `SELECT s.id AS id, s.code AS code, s.taxon_id AS taxon_id,
  t.name AS taxon_name, s.cultivar_id AS cultivar_id, c.name AS cultivar_name,
  s.seed_lot_id AS seed_lot_id, s.display_label AS display_label,
  s.life_stage AS life_stage, s.image_url AS image_url,
  s.updated_at AS updated_at, s.version AS version,
  l.published_at AS published_at, s.propagation_method AS propagation_method,
  s.source_details AS source_details, s.private_location AS private_location,
  s.internal_notes AS internal_notes, s.sown_on AS sown_on,
  s.created_at AS created_at, b.label AS seed_lot_label
  ${SPECIMEN_FROM}
  LEFT JOIN seed_lots AS b ON b.id = s.seed_lot_id
  WHERE s.id = ? LIMIT 1`;

const TAXON_LIST_SQL = `SELECT id, kind, name, scientific_name, category,
  updated_at, version FROM taxa`;
const TAXON_DETAIL_SQL = `SELECT id, kind, name, scientific_name, category,
  updated_at, version, name_key, description, growth_habit, light, water,
  pollination, cold_min_c, cold_source_url, cold_notes, created_at
  FROM taxa WHERE id = ? LIMIT 1`;

function safeRow(row, fields) {
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      typeof row.id !== "string" || !ID.test(row.id) ||
      typeof row.updated_at !== "string" || !row.updated_at ||
      row.updated_at.length > 40 ||
      !Number.isSafeInteger(row.version) || row.version < 1) {
    throw new Error("Invalid private database result");
  }
  const projected = {};
  for (const field of fields) {
    if (!Object.hasOwn(row, field)) throw new Error("Private database column missing");
    projected[field] = row[field];
  }
  return projected;
}

function readCursor(value) {
  if (!CURSOR.test(value)) throw new InvalidAdminQuery("Malformed cursor");
  try {
    const decoded = JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/")));
    if (!Array.isArray(decoded) || decoded.length !== 2 ||
        typeof decoded[0] !== "string" || !decoded[0] ||
        decoded[0].length > 40 || typeof decoded[1] !== "string" ||
        !ID.test(decoded[1])) {
      throw new InvalidAdminQuery("Invalid cursor values");
    }
    return decoded;
  } catch {
    throw new InvalidAdminQuery("Malformed cursor encoding");
  }
}

function parseListOptions(params) {
  for (const key of params.keys()) {
    if (!["limit", "cursor"].includes(key) || params.getAll(key).length !== 1) {
      throw new InvalidAdminQuery("Unsupported or duplicate query");
    }
  }
  const limitParam = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    if (!/^[1-9][0-9]?$/.test(limitParam)) throw new InvalidAdminQuery("Bad limit");
    limit = Number(limitParam);
    if (limit > MAX_LIMIT) throw new InvalidAdminQuery("Page too large");
  }
  const token = params.get("cursor");
  return { limit, cursor: token === null ? null : readCursor(token) };
}

function encodeCursor(row) {
  return btoa(JSON.stringify([row.updated_at, row.id]))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function getPage(db, sql, { limit, cursor }, fields, alias) {
  const clause = cursor
    ? ` WHERE (${alias}.updated_at < ? OR (${alias}.updated_at = ? AND ${alias}.id < ?))`
    : "";
  const values = cursor ? [cursor[0], cursor[0], cursor[1]] : [];
  const result = await db.prepare(
    sql + clause + ` ORDER BY ${alias}.updated_at DESC, ${alias}.id DESC LIMIT ?`
  ).bind(...values, limit + 1).all();
  if (result?.success !== true || !Array.isArray(result.results) ||
      result.results.length > limit + 1) {
    throw new Error("Unexpected private database page");
  }
  const items = result.results.slice(0, limit).map(row => safeRow(row, fields));
  return {
    items,
    nextCursor: result.results.length > limit ? encodeCursor(items[items.length - 1]) : null
  };
}

async function getDetail(db, sql, id, fields) {
  const row = await db.prepare(sql).bind(id).first();
  if (row === null) return null;
  const result = safeRow(row, fields);
  if (result.id !== id) throw new Error("Private database detail mismatched");
  return result;
}

const PATHS = {
  specimens: "/api/v1/admin/specimens",
  taxa: "/api/v1/admin/taxa"
};

export function isAdminInventoryPath(path) {
  return path === PATHS.specimens || path === PATHS.taxa ||
    /^\/api\/v1\/admin\/(?:specimens|taxa)\/[A-Za-z0-9_-]{1,96}$/.test(path);
}

// Only the Worker calls this, after successful Access JWT verification.
// Route allowlists are mirrored here to avoid any unexpected private SQL read.
export async function readAdminInventory(db, path, searchParams) {
  const specimenId = path.startsWith(PATHS.specimens + "/")
    ? path.slice(PATHS.specimens.length + 1) : null;
  const taxonId = path.startsWith(PATHS.taxa + "/")
    ? path.slice(PATHS.taxa.length + 1) : null;

  if (specimenId || taxonId) {
    if (searchParams.size !== 0) throw new InvalidAdminQuery("Unexpected query");
    return specimenId
      ? getDetail(db, SPECIMEN_DETAIL_SQL, specimenId, SPECIMEN_DETAIL_FIELDS)
      : getDetail(db, TAXON_DETAIL_SQL, taxonId, TAXON_DETAIL_FIELDS);
  }
  const options = parseListOptions(searchParams);
  if (path === PATHS.specimens) {
    return getPage(db, SPECIMEN_LIST_SQL, options, SPECIMEN_LIST_FIELDS, "s");
  }
  if (path === PATHS.taxa) {
    return getPage(db, TAXON_LIST_SQL, options, TAXON_LIST_FIELDS, "taxa");
  }
  throw new InvalidAdminQuery("Unknown private route");
}
