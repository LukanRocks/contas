import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ParsedItem, ParsedNote, StoredNote } from "./types.ts";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  chave           TEXT PRIMARY KEY,
  uf              TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  emit_cnpj       TEXT,
  emit_name       TEXT,
  emit_address    TEXT,
  numero          TEXT,
  serie           TEXT,
  emitted_at      TEXT,
  total_items     INTEGER,
  total_value_c   INTEGER,
  discount_c      INTEGER,
  payable_c       INTEGER,
  paid_c          INTEGER,
  payment_method  TEXT,
  taxes_c         INTEGER,
  consumer_cpf    TEXT,
  consumer_name   TEXT,
  raw_html        TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chave           TEXT NOT NULL REFERENCES notes(chave),
  n_item          INTEGER NOT NULL,
  description     TEXT NOT NULL,
  store_code      TEXT,
  qty             REAL NOT NULL,
  unit            TEXT,
  unit_value_c    INTEGER NOT NULL,
  total_value_c   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_items_chave ON note_items(chave);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:" && !path.startsWith("file:")) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

const NOTE_COLUMNS = [
  "chave", "uf", "source_url", "emit_cnpj", "emit_name", "emit_address",
  "numero", "serie", "emitted_at", "total_items", "total_value_c", "discount_c",
  "payable_c", "paid_c", "payment_method", "taxes_c", "consumer_cpf",
  "consumer_name", "raw_html", "fetched_at", "created_at",
] as const;

// Everything except the primary key and created_at: a re-ingest refreshes the
// scraped data but keeps the timestamp of when we first saw the note.
const UPDATABLE = NOTE_COLUMNS.filter((c) => c !== "chave" && c !== "created_at");

const UPSERT_NOTE_SQL = `
INSERT INTO notes (${NOTE_COLUMNS.join(", ")})
VALUES (${NOTE_COLUMNS.map((c) => "@" + c).join(", ")})
ON CONFLICT(chave) DO UPDATE SET ${UPDATABLE.map((c) => `${c} = excluded.${c}`).join(", ")}
`;

const INSERT_ITEM_SQL = `
INSERT INTO note_items (chave, n_item, description, store_code, qty, unit, unit_value_c, total_value_c)
VALUES (@chave, @n_item, @description, @store_code, @qty, @unit, @unit_value_c, @total_value_c)
`;

export type IngestInput = ParsedNote & {
  source_url: string;
  raw_html: string;
  fetched_at: string;
};

/**
 * Idempotent write: upsert the note and fully replace its item rows.
 * Items are never deduped -- the same product legitimately repeats across lines,
 * so `n_item` (print order) is the only key that matters.
 */
export function upsertNote(db: DB, input: IngestInput): void {
  const upsert = db.prepare(UPSERT_NOTE_SQL);
  const insertItem = db.prepare(INSERT_ITEM_SQL);
  const deleteItems = db.prepare("DELETE FROM note_items WHERE chave = ?");

  const run = db.transaction((note: IngestInput) => {
    deleteItems.run(note.chave);
    upsert.run({
      chave: note.chave,
      uf: note.uf,
      source_url: note.source_url,
      emit_cnpj: note.emit_cnpj,
      emit_name: note.emit_name,
      emit_address: note.emit_address,
      numero: note.numero,
      serie: note.serie,
      emitted_at: note.emitted_at,
      total_items: note.total_items,
      total_value_c: note.total_value_c,
      discount_c: note.discount_c,
      payable_c: note.payable_c,
      paid_c: note.paid_c,
      payment_method: note.payment_method,
      taxes_c: note.taxes_c,
      consumer_cpf: note.consumer_cpf,
      consumer_name: note.consumer_name,
      raw_html: note.raw_html,
      fetched_at: note.fetched_at,
      created_at: new Date().toISOString(),
    });
    for (const item of note.items) {
      insertItem.run({ chave: note.chave, ...item });
    }
  });

  run(input);
}

type NoteRow = Omit<StoredNote, "items">;
type ItemRow = ParsedItem & { id: number; chave: string };

export function getNote(db: DB, chave: string): StoredNote | null {
  const row = db.prepare("SELECT * FROM notes WHERE chave = ?").get(chave) as NoteRow | undefined;
  if (!row) return null;
  const items = db
    .prepare("SELECT * FROM note_items WHERE chave = ? ORDER BY n_item")
    .all(chave) as ItemRow[];
  // Drop the storage-only columns so the shape matches ParsedItem.
  return {
    ...row,
    items: items.map(({ id: _id, chave: _chave, ...item }) => item),
  };
}

/** Row shape for the list view: note header fields plus how many lines it has. */
export type NoteSummary = Omit<StoredNote, "items" | "raw_html"> & { item_count: number };

const LIST_NOTES_SQL = `
SELECT n.chave, n.uf, n.source_url, n.emit_cnpj, n.emit_name, n.emit_address,
       n.numero, n.serie, n.emitted_at, n.total_items, n.total_value_c,
       n.discount_c, n.payable_c, n.paid_c, n.payment_method, n.taxes_c,
       n.consumer_cpf, n.consumer_name, n.fetched_at, n.created_at,
       COUNT(i.id) AS item_count
FROM notes n
LEFT JOIN note_items i ON i.chave = n.chave
GROUP BY n.chave
ORDER BY COALESCE(n.emitted_at, n.created_at) DESC, n.chave DESC
LIMIT ? OFFSET ?
`;

/** Newest note first, by emission date, falling back to when we first saw it. */
export function listNotes(db: DB, limit: number, offset: number): NoteSummary[] {
  return db.prepare(LIST_NOTES_SQL).all(limit, offset) as NoteSummary[];
}

export function countNotes(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n;
}

/** Just the stored markup for one note — used to render the original page. */
export function getNoteHtml(db: DB, chave: string): string | null {
  const row = db.prepare("SELECT raw_html FROM notes WHERE chave = ?").get(chave) as
    | { raw_html: string }
    | undefined;
  return row?.raw_html ?? null;
}
