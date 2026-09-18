/**
 * The fields this app reads from the backend's `NoteSummary`
 * (container/backend/src/db.ts). Hand-written rather than imported: the app is
 * not part of the server's pnpm workspace, so it cannot depend on the backend
 * package.
 */
export type NoteSummary = {
  chave: string;
  uf: string;
  emit_name: string | null;
  emit_cnpj: string | null;
  numero: string | null;
  emitted_at: string | null;
  total_value_c: number | null;
  payable_c: number | null;
  item_count: number;
  created_at: string;
};

/** Body of `GET /api/nfce`. */
export type NoteListResponse = {
  total: number;
  limit: number;
  offset: number;
  notes: NoteSummary[];
};

/**
 * What `POST /api/nfce` gives back: the note as parsed, before the storage-only
 * columns are added. Only the fields the scan confirmation shows are listed.
 */
export type ParsedNote = {
  chave: string;
  uf: string;
  emit_name: string | null;
  emitted_at: string | null;
  total_value_c: number | null;
  payable_c: number | null;
  items: unknown[];
};

/** One line of a note, as the backend's `ParsedItem` (container/backend/src/types.ts). */
export type NoteItem = {
  n_item: number;
  description: string;
  store_code: string | null;
  qty: number;
  unit: string | null;
  unit_value_c: number;
  total_value_c: number;
};

/**
 * Body of `GET /api/nfce/:chave`: the stored note with its lines. The page
 * itself is left out of that answer and only its size reported; the markup is
 * `GET /api/nfce/:chave/html`.
 */
export type NoteDetail = {
  chave: string;
  uf: string;
  source_url: string;
  emit_cnpj: string | null;
  emit_name: string | null;
  emit_address: string | null;
  numero: string | null;
  serie: string | null;
  emitted_at: string | null;
  total_items: number | null;
  total_value_c: number | null;
  discount_c: number | null;
  payable_c: number | null;
  paid_c: number | null;
  payment_method: string | null;
  taxes_c: number | null;
  consumer_cpf: string | null;
  consumer_name: string | null;
  fetched_at: string;
  created_at: string;
  raw_html_bytes: number;
  items: NoteItem[];
};
