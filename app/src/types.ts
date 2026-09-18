/**
 * The fields this app reads from the backend's `NoteSummary`
 * (backend/src/db.ts). Hand-written rather than imported: the app is outside
 * the pnpm workspace, so it cannot depend on the backend package.
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
