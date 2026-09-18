import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";
import type { ParsedItem, ParsedNote } from "../types.ts";
import {
  brDateTimeToIso,
  digitsOnly,
  normalizeText,
  parseDecimal,
  parseInteger,
  toCents,
} from "../ptbr.ts";
import { normalizeChave, ufFromChave } from "../chave.ts";

export class ParseError extends Error {}

/** Lowercase + strip accents, so label matching survives encoding wobbles. */
function fold(s: string): string {
  return normalizeText(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Text of an element with its <strong> label removed ("Qtde.:1" -> "1"). */
function valueOf($el: Cheerio<Element>): string {
  if ($el.length === 0) return "";
  const clone = $el.first().clone();
  clone.find("strong, label").remove();
  return normalizeText(clone.text());
}

function emptyToNull(s: string): string | null {
  return s === "" ? null : s;
}

/** Locate one of the collapsible panels in #infos by its <h4> heading. */
function findSection($: CheerioAPI, headingRe: RegExp): Cheerio<Element> | null {
  let match: Cheerio<Element> | null = null;
  $("h4").each((_i, el) => {
    if (match) return;
    if (headingRe.test(fold($(el).text()))) match = $(el).parent() as Cheerio<Element>;
  });
  return match;
}

/** "(Código: 36053)" -> "36053" */
function parseCodigo(raw: string): string | null {
  const m = /\(\s*c[óo]digo\s*:?\s*([^)]*)\)/i.exec(raw);
  return m ? emptyToNull(normalizeText(m[1] ?? "")) : null;
}

/** Fallback for portals that put description and code in one text blob. */
function splitDescriptionAndCode(raw: string): { description: string; store_code: string | null } {
  const m = /^(.*?)\s*\(\s*c[óo]digo\s*:?\s*([^)]*)\)\s*$/i.exec(raw);
  if (!m) return { description: normalizeText(raw), store_code: null };
  return {
    description: normalizeText(m[1] ?? ""),
    store_code: emptyToNull(normalizeText(m[2] ?? "")),
  };
}

function parseItems($: CheerioAPI): ParsedItem[] {
  const items: ParsedItem[] = [];

  $("#tabResult tr").each((i, tr) => {
    const $tr = $(tr) as Cheerio<Element>;

    // Skip any header/spacer row that carries no product cell.
    const hasProduct =
      $tr.find(".txtTit2").length > 0 || $tr.find(".RCod").length > 0 || $tr.find(".Rqtd").length > 0;
    if (!hasProduct) return;

    const n_item = items.length + 1;

    let description = normalizeText($tr.find(".txtTit2").first().text());
    let store_code = parseCodigo(normalizeText($tr.find(".RCod").first().text()));

    if (description === "") {
      // Description and code share the first cell: strip the numeric spans and split.
      const cell = $tr.find("td").first().clone();
      cell.find(".Rqtd, .RUN, .RvlUnit").remove();
      const split = splitDescriptionAndCode(normalizeText(cell.text()));
      description = split.description;
      store_code = store_code ?? split.store_code;
    }

    const qtyRaw = valueOf($tr.find(".Rqtd") as Cheerio<Element>);
    const unitRaw = valueOf($tr.find(".RUN") as Cheerio<Element>);
    const unitValueRaw = valueOf($tr.find(".RvlUnit") as Cheerio<Element>);
    const totalRaw = normalizeText($tr.find(".valor").first().text());

    if (description === "") {
      throw new ParseError(`item ${n_item}: could not read a description`);
    }

    try {
      items.push({
        n_item,
        description,
        store_code,
        qty: parseDecimal(qtyRaw),
        unit: emptyToNull(unitRaw),
        unit_value_c: toCents(unitValueRaw),
        total_value_c: toCents(totalRaw),
      });
    } catch (err) {
      throw new ParseError(
        `item ${n_item} (${description}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  return items;
}

type TotalsRow = { label: string; value: string };

function parseTotals($: CheerioAPI) {
  const rows: TotalsRow[] = [];
  $("#totalNota > div").each((_i, el) => {
    rows.push({
      label: normalizeText($(el).find("label").first().text()),
      value: normalizeText($(el).find("span").first().text()),
    });
  });

  const find = (re: RegExp): TotalsRow | undefined => rows.find((r) => re.test(fold(r.label)));
  const cents = (re: RegExp): number | null => {
    const row = find(re);
    if (!row || row.value === "") return null;
    return toCents(row.value);
  };

  const itemsRow = find(/qtd.*total.*itens/);

  // "Forma de pagamento:" / "Valor pago R$:" is a header row; the values land
  // on the row directly beneath it.
  const formaIdx = rows.findIndex((r) => /forma de pagamento/.test(fold(r.label)));
  const paymentRow = formaIdx >= 0 ? rows[formaIdx + 1] : undefined;

  return {
    total_items: itemsRow && itemsRow.value !== "" ? parseInteger(itemsRow.value) : null,
    total_value_c: cents(/^valor total/),
    discount_c: cents(/^descontos/),
    payable_c: cents(/^valor a pagar/),
    payment_method: paymentRow ? emptyToNull(paymentRow.label) : null,
    paid_c: paymentRow && paymentRow.value !== "" ? toCents(paymentRow.value) : null,
    taxes_c: cents(/tributos totais/),
  };
}

function parseEmitente($: CheerioAPI) {
  const emit_name = emptyToNull(
    normalizeText($("#u20").first().text()) || normalizeText($(".txtTopo").first().text()),
  );

  const textDivs = $(".txtCenter .text").toArray() as Element[];
  let emit_cnpj: string | null = null;
  let emit_address: string | null = null;

  for (const el of textDivs) {
    const text = normalizeText($(el).text());
    if (emit_cnpj === null && /cnpj/.test(fold(text))) {
      const d = digitsOnly(text);
      emit_cnpj = d.length === 14 ? d : emptyToNull(d);
      continue;
    }
    if (emit_address === null && text !== "") emit_address = text;
  }

  return { emit_name, emit_cnpj, emit_address };
}

function parseGeneralInfo($: CheerioAPI) {
  const section = findSection($, /informac(o|õ)es gerais/);
  const text = normalizeText(section ? section.text() : $("#infos").text());

  const numero = /n[úu]mero\s*:\s*(\S+)/i.exec(text)?.[1] ?? null;
  const serie = /s[ée]rie\s*:\s*(\S+)/i.exec(text)?.[1] ?? null;
  const emissao = /emiss[ãa]o\s*:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i.exec(text)?.[1];

  return {
    numero: numero ? normalizeText(numero) : null,
    serie: serie ? normalizeText(serie) : null,
    emitted_at: emissao ? brDateTimeToIso(emissao) : null,
  };
}

function parseChave($: CheerioAPI): string {
  const printed = normalizeText($(".chave").first().text());
  if (printed !== "") return normalizeChave(printed);

  const section = findSection($, /chave de acesso/);
  const text = normalizeText(section ? section.text() : "");
  const m = /((?:\d[\s.]*){44})/.exec(text);
  if (!m) throw new ParseError("chave de acesso not found in page");
  return normalizeChave(m[1] ?? "");
}

function parseConsumidor($: CheerioAPI) {
  const section = findSection($, /consumidor/);
  if (!section) return { consumer_cpf: null, consumer_name: null };

  const sectionText = fold(section.text());
  let consumer_cpf: string | null = null;
  let consumer_name: string | null = null;

  section.find("li").each((_i, el) => {
    const $li = $(el) as Cheerio<Element>;
    const label = fold($li.find("strong, label").first().text());
    const value = valueOf($li);
    if (/cpf/.test(label)) {
      const d = digitsOnly(value);
      if (d.length === 11) consumer_cpf = d;
    } else if (/nome/.test(label)) {
      consumer_name = emptyToNull(value);
    }
  });

  // Unidentified consumer: the note prints a notice instead of a document.
  if (/consumidor nao identificado/.test(sectionText)) consumer_cpf = null;

  return { consumer_cpf, consumer_name };
}

/** Parse a Paraná (UF 41) NFC-e DANFE page. */
export function parsePR(html: string): ParsedNote {
  const $ = cheerio.load(html);

  const chave = parseChave($);
  const items = parseItems($);
  if (items.length === 0) throw new ParseError("no item rows found in page");

  return {
    chave,
    uf: ufFromChave(chave),
    ...parseEmitente($),
    ...parseGeneralInfo($),
    ...parseTotals($),
    ...parseConsumidor($),
    items,
  };
}
