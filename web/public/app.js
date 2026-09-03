"use strict";

// The backend serves this page, so the API is same-origin under /api.
const API = "/api";

const view = document.getElementById("view");
const form = document.getElementById("scan-form");
const input = document.getElementById("scan-url");
const scanButton = document.getElementById("scan-button");
const statusEl = document.getElementById("scan-status");

/* ---------- formatting ---------- */

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));

const brl = (cents) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

const qty = (n) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
    : null;

/** "2026-09-02T19:12:34" -> "02/09/2026 19:12" (already local time). */
function dateTime(iso, withSeconds = false) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mi, ss] = m;
  if (!hh) return `${d}/${mo}/${y}`;
  return `${d}/${mo}/${y} ${hh}:${mi}${withSeconds && ss ? `:${ss}` : ""}`;
}

/** Timestamps we store as UTC instants (fetched_at, created_at). */
function instant(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

const cnpj = (d) =>
  d && d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;

const cpf = (d) =>
  d && d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

const chaveGroups = (c) => (c ? c.replace(/(\d{4})(?=\d)/g, "$1 ") : c);

const bytes = (n) =>
  typeof n === "number" ? `${n.toLocaleString("pt-BR")} bytes` : null;

/** Render a value, or a muted placeholder when it is absent. */
const cell = (value) =>
  value === null || value === undefined || value === ""
    ? '<span class="null">—</span>'
    : esc(value);

/* ---------- api ---------- */

async function api(path, options) {
  const res = await fetch(`${API}${path}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page from somewhere upstream */
  }
  if (!res.ok) {
    const detail = body?.message || body?.error || text.slice(0, 200) || res.statusText;
    throw new Error(`${res.status} — ${detail}`);
  }
  return body;
}

/* ---------- views ---------- */

function renderError(message) {
  view.innerHTML = `<section class="panel"><p class="status err">${esc(message)}</p></section>`;
}

async function renderList() {
  view.innerHTML = '<section class="panel"><p class="empty">Carregando…</p></section>';
  let data;
  try {
    data = await api("/nfce");
  } catch (err) {
    renderError(`Não foi possível carregar as notas: ${err.message}`);
    return;
  }

  const rows = data.notes
    .map(
      (n) => `
      <tr class="row" tabindex="0" data-chave="${esc(n.chave)}">
        <td>
          <div class="store">${cell(n.emit_name)}</div>
          <div class="chave-short">${esc(n.chave.slice(0, 8))}…${esc(n.chave.slice(-6))}</div>
        </td>
        <td class="hide-sm">${cell(dateTime(n.emitted_at))}</td>
        <td class="num hide-sm">${cell(n.item_count)}</td>
        <td class="num">${cell(brl(n.total_value_c))}</td>
        <td class="num">${cell(brl(n.payable_c))}</td>
      </tr>`,
    )
    .join("");

  view.innerHTML = `
    <section class="panel">
      <div class="list-head">
        <h2>Notas escaneadas</h2>
        <span class="count">${data.total} ${data.total === 1 ? "nota" : "notas"}</span>
      </div>
      ${
        data.notes.length === 0
          ? '<p class="empty">Nenhuma nota ainda. Escaneie uma acima para começar.</p>'
          : `<div class="table-wrap"><table>
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th class="hide-sm">Emissão</th>
                  <th class="num hide-sm">Itens</th>
                  <th class="num">Total</th>
                  <th class="num">A pagar</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table></div>`
      }
    </section>`;

  for (const row of view.querySelectorAll("tr.row")) {
    const open = () => {
      location.hash = `#/nota/${row.dataset.chave}`;
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  }
}

function fieldList(pairs) {
  return `<dl class="fields">${pairs
    .map(
      ([label, value, mono]) =>
        `<dt>${esc(label)}</dt><dd${mono ? ' class="mono"' : ""}>${cell(value)}</dd>`,
    )
    .join("")}</dl>`;
}

async function renderDetail(chave) {
  view.innerHTML = '<section class="panel"><p class="empty">Carregando…</p></section>';
  let n;
  try {
    n = await api(`/nfce/${chave}`);
  } catch (err) {
    renderError(`Não foi possível carregar a nota: ${err.message}`);
    return;
  }

  const items = n.items
    .map(
      (i) => `
      <tr>
        <td class="num">${i.n_item}</td>
        <td>${cell(i.description)}</td>
        <td class="hide-sm">${cell(i.store_code)}</td>
        <td class="num">${cell(qty(i.qty))}</td>
        <td>${cell(i.unit)}</td>
        <td class="num">${cell(brl(i.unit_value_c))}</td>
        <td class="num">${cell(brl(i.total_value_c))}</td>
      </tr>`,
    )
    .join("");

  view.innerHTML = `
    <a class="back" href="#/">← Todas as notas</a>

    <section class="panel">
      <h2 class="detail-title">${cell(n.emit_name)}</h2>
      <p class="detail-sub">
        Nº ${cell(n.numero)} · Série ${cell(n.serie)} · ${cell(dateTime(n.emitted_at, true))}
      </p>
      ${fieldList([
        ["CNPJ", cnpj(n.emit_cnpj)],
        ["Endereço", n.emit_address],
        ["UF", n.uf],
        ["Chave de acesso", chaveGroups(n.chave), true],
        ["URL do QR", n.source_url, true],
      ])}
    </section>

    <section class="panel">
      <h2>Totais</h2>
      ${fieldList([
        ["Qtd. total de itens", n.total_items],
        ["Valor total", brl(n.total_value_c)],
        ["Descontos", brl(n.discount_c)],
        ["Valor a pagar", brl(n.payable_c)],
        ["Forma de pagamento", n.payment_method],
        ["Valor pago", brl(n.paid_c)],
        ["Tributos totais", brl(n.taxes_c)],
      ])}
    </section>

    <section class="panel">
      <h2>Consumidor</h2>
      ${fieldList([
        ["CPF", cpf(n.consumer_cpf)],
        ["Nome", n.consumer_name],
      ])}
    </section>

    <section class="panel">
      <div class="list-head">
        <h2>Itens</h2>
        <span class="count">${n.items.length} ${n.items.length === 1 ? "linha" : "linhas"}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Descrição</th>
              <th class="hide-sm">Código</th>
              <th class="num">Qtde.</th>
              <th>Un.</th>
              <th class="num">Vl. unit.</th>
              <th class="num">Vl. total</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>Coleta</h2>
      ${fieldList([
        ["Coletada em", instant(n.fetched_at)],
        ["Primeiro registro", instant(n.created_at)],
        ["HTML bruto", bytes(n.raw_html_bytes)],
      ])}
    </section>

    <section class="panel">
      <h2>Nota original</h2>
      <p class="hint">
        Página capturada do portal da fazenda, exibida isolada — os dados acima
        foram extraídos dela.
      </p>
      <iframe
        class="raw-note"
        src="${esc(API)}/nfce/${esc(n.chave)}/html"
        sandbox
        title="HTML original da nota ${esc(n.chave)}"></iframe>
    </section>`;
}

/* ---------- scan ---------- */

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  scanButton.disabled = true;
  setStatus("Buscando no portal da fazenda…", "busy");

  try {
    const note = await api("/nfce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const total = brl(note.total_value_c) ?? "";
    setStatus(
      `Nota de ${note.emit_name ?? "emitente desconhecido"} salva — ${note.items.length} itens, ${total}.`,
      "ok",
    );
    input.value = "";
    // Show the note we just ingested; re-render if we are already on it.
    const target = `#/nota/${note.chave}`;
    if (location.hash === target) renderDetail(note.chave);
    else location.hash = target;
  } catch (err) {
    setStatus(`Falhou: ${err.message}`, "err");
  } finally {
    scanButton.disabled = false;
  }
});

// The example button only appears when NFCE_SAMPLE_URL is set on the backend,
// so a fresh clone ships no real note.
const sampleButton = document.getElementById("sample-button");

api("/config")
  .then(({ sampleUrl }) => {
    if (!sampleUrl) return;
    sampleButton.hidden = false;
    sampleButton.addEventListener("click", () => {
      input.value = sampleUrl;
      input.focus();
    });
  })
  .catch(() => {
    /* the example button is optional; the form works without it */
  });

/* ---------- routing ---------- */

function route() {
  const match = /^#\/nota\/(\d{44})$/.exec(location.hash);
  if (match) renderDetail(match[1]);
  else renderList();
}

window.addEventListener("hashchange", route);
route();
