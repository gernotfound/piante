-- Piantee Cloudflare Fresh Start: empty D1 schema v1.
-- No Firebase identifiers, rows, user accounts or legacy compatibility.
-- D1 enforces foreign keys by default; all mutations are to use trusted Workers.

CREATE TABLE taxa (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('species', 'hybrid', 'unverified')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  name_key TEXT NOT NULL UNIQUE CHECK (length(trim(name_key)) BETWEEN 1 AND 160),
  scientific_name TEXT,
  category TEXT,
  description TEXT,
  growth_habit TEXT,
  light TEXT,
  water TEXT,
  pollination TEXT,
  cold_min_c REAL,
  cold_source_url TEXT,
  cold_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Aliases can be ambiguous across taxa: search may return candidates, never
-- silently bind a specimen to the first matching synonym.
CREATE TABLE taxon_aliases (
  taxon_id TEXT NOT NULL REFERENCES taxa(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
  alias_key TEXT NOT NULL CHECK (length(trim(alias_key)) > 0),
  PRIMARY KEY (taxon_id, alias_key)
);
CREATE INDEX idx_taxon_aliases_lookup ON taxon_aliases(alias_key, taxon_id);

CREATE TABLE cultivars (
  id TEXT PRIMARY KEY NOT NULL,
  taxon_id TEXT NOT NULL REFERENCES taxa(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  name_key TEXT NOT NULL CHECK (length(trim(name_key)) > 0),
  fruit_notes TEXT,
  cold_min_c REAL,
  cold_source_url TEXT,
  cold_notes TEXT,
  pollination TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (taxon_id, name_key),
  UNIQUE (taxon_id, id)
);

-- NULL means unknown, not zero or empty months. Cultivar-specific months are
-- explicit and do not imply that a seed-grown offspring has the same traits.
CREATE TABLE taxon_harvest_months (
  taxon_id TEXT NOT NULL REFERENCES taxa(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  PRIMARY KEY (taxon_id, month)
);
CREATE TABLE cultivar_harvest_months (
  cultivar_id TEXT NOT NULL REFERENCES cultivars(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  PRIMARY KEY (cultivar_id, month)
);

-- Source provenance and free-text source cultivar are PRIVATE. They never
-- constitute evidence of the registered plant's cultivar identity.
CREATE TABLE seed_lots (
  id TEXT PRIMARY KEY NOT NULL,
  taxon_id TEXT NOT NULL REFERENCES taxa(id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  source_details TEXT,
  source_cultivar_label TEXT,
  private_notes TEXT,
  sown_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (taxon_id, id)
);
CREATE INDEX idx_seed_lots_taxon ON seed_lots(taxon_id, label);

-- Reservations survive specimen deletion and cannot be reassigned by the API.
-- After restoring an older backup, later reservations must be reconciled
-- before writes resume; a UNIQUE constraint alone cannot guarantee that.
CREATE TABLE specimen_code_reservations (
  code TEXT PRIMARY KEY NOT NULL
    CHECK (length(code) = 6 AND code GLOB '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  specimen_id TEXT NOT NULL UNIQUE,
  reserved_at TEXT NOT NULL,
  UNIQUE (code, specimen_id)
);
-- INSERT OR REPLACE can bypass a DELETE trigger when SQLite recursive_triggers
-- is disabled; reject collisions before its conflict handler can replace a row.
CREATE TRIGGER specimen_code_reservations_no_replace
  BEFORE INSERT ON specimen_code_reservations
  WHEN EXISTS (
    SELECT 1 FROM specimen_code_reservations
    WHERE code = NEW.code OR specimen_id = NEW.specimen_id
  )
  BEGIN SELECT RAISE(ABORT, 'specimen code already reserved'); END;
CREATE TRIGGER specimen_code_reservations_no_update
  BEFORE UPDATE ON specimen_code_reservations
  BEGIN SELECT RAISE(ABORT, 'specimen code reservation is immutable'); END;
CREATE TRIGGER specimen_code_reservations_no_delete
  BEFORE DELETE ON specimen_code_reservations
  BEGIN SELECT RAISE(ABORT, 'specimen code reservation is permanent'); END;

CREATE TABLE specimens (
  id TEXT PRIMARY KEY NOT NULL,
  taxon_id TEXT NOT NULL REFERENCES taxa(id) ON DELETE RESTRICT,
  cultivar_id TEXT,
  seed_lot_id TEXT,
  code TEXT NOT NULL UNIQUE,
  display_label TEXT,
  life_stage TEXT,
  propagation_method TEXT,
  source_details TEXT,
  private_location TEXT,
  internal_notes TEXT,
  image_url TEXT,
  sown_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (taxon_id, cultivar_id) REFERENCES cultivars(taxon_id, id),
  FOREIGN KEY (taxon_id, seed_lot_id) REFERENCES seed_lots(taxon_id, id),
  FOREIGN KEY (code, id) REFERENCES specimen_code_reservations(code, specimen_id)
);
CREATE INDEX idx_specimens_taxon ON specimens(taxon_id, id);
CREATE INDEX idx_specimens_lot ON specimens(seed_lot_id) WHERE seed_lot_id IS NOT NULL;
CREATE INDEX idx_specimens_stage ON specimens(life_stage, id);

-- Immutable historical diary. The default conservative deletion policy is
-- ON DELETE RESTRICT: an observed specimen cannot silently lose its history.
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  specimen_id TEXT NOT NULL REFERENCES specimens(id) ON DELETE RESTRICT,
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'automatic')),
  kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
  note TEXT,
  event_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_journal_specimen_date ON journal_entries(specimen_id, event_on DESC, id DESC);
CREATE TRIGGER journal_entries_no_replace
  BEFORE INSERT ON journal_entries
  WHEN EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.id)
  BEGIN SELECT RAISE(ABORT, 'journal entry already recorded'); END;
CREATE TRIGGER journal_entries_no_update
  BEFORE UPDATE ON journal_entries
  BEGIN SELECT RAISE(ABORT, 'journal entries are append-only'); END;
CREATE TRIGGER journal_entries_no_delete
  BEFORE DELETE ON journal_entries
  BEGIN SELECT RAISE(ABORT, 'journal entries are append-only'); END;

-- A listing is the owner-approved public projection. No inventory notes,
-- provenance, seed-lot metadata or diary fields can be exposed through it.
CREATE TABLE public_listings (
  specimen_id TEXT PRIMARY KEY NOT NULL REFERENCES specimens(id) ON DELETE CASCADE,
  summary TEXT,
  photo_url TEXT CHECK (photo_url IS NULL OR substr(photo_url, 1, 8) = 'https://'),
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_public_listings_date ON public_listings(published_at DESC, specimen_id DESC);

-- This view is the only allowed SQL source for anonymous catalog queries.
-- Shared taxon/cultivar edits are visible immediately without a fan-out.
CREATE VIEW public_catalog AS
SELECT l.specimen_id AS id,
       s.code AS code,
       t.name AS taxon_name,
       t.scientific_name AS scientific_name,
       t.kind AS taxon_kind,
       t.category AS category,
       t.description AS taxon_description,
       t.growth_habit AS growth_habit,
       t.light AS light,
       t.water AS water,
       t.pollination AS taxon_pollination,
       t.cold_min_c AS taxon_cold_min_c,
       c.name AS cultivar_name,
       c.fruit_notes AS cultivar_fruit_notes,
       c.cold_min_c AS cultivar_cold_min_c,
       c.pollination AS cultivar_pollination,
       l.summary AS summary,
       l.photo_url AS photo_url,
       l.published_at AS published_at
FROM public_listings AS l
JOIN specimens AS s ON s.id = l.specimen_id
JOIN taxa AS t ON t.id = s.taxon_id
LEFT JOIN cultivars AS c ON c.id = s.cultivar_id;
