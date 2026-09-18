/** A single line item as printed on the note. */
export type ParsedItem = {
  n_item: number;
  description: string;
  store_code: string | null;
  qty: number;
  unit: string | null;
  unit_value_c: number;
  total_value_c: number;
};

/**
 * Everything a parser can pull out of a note's HTML.
 * Mirrors the `notes` columns (money as integer cents) plus the item rows.
 * Storage-only columns (source_url, raw_html, fetched_at, created_at) are added
 * by the persistence layer, not by the parser.
 */
export type ParsedNote = {
  chave: string;
  uf: string;
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
  items: ParsedItem[];
};

/** A note as stored, i.e. parsed fields plus the provenance columns. */
export type StoredNote = ParsedNote & {
  source_url: string;
  raw_html: string;
  fetched_at: string;
  created_at: string;
};
