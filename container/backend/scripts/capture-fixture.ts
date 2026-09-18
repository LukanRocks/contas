/**
 * Save an NFC-e page to disk so the parser tests can run against a real note.
 *
 *   pnpm --filter @nf-price-tracker/backend fixture:capture "<qr-url>" [outfile]
 *
 * Defaults to data/nfce-fixture.html at the workspace root, which is gitignored
 * -- captured notes contain a CPF and must never be committed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractChaveFromUrl, ufFromChave } from "../src/chave.ts";
import { fetchNoteHtml } from "../src/fetcher.ts";
import { isSupportedUf } from "../src/parsers/index.ts";

const WORKSPACE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const [url, outArg] = process.argv.slice(2);
if (!url) {
  console.error('usage: fixture:capture "<qr-url>" [outfile]');
  process.exit(1);
}

const chave = extractChaveFromUrl(url);
const uf = ufFromChave(chave);
if (!isSupportedUf(uf)) {
  console.error(`unsupported UF "${uf}" -- only Paraná (41) has a parser today`);
  process.exit(1);
}

const target = outArg ?? "data/nfce-fixture.html";
const out = isAbsolute(target) ? target : resolve(WORKSPACE_ROOT, target);

const { html } = await fetchNoteHtml(url);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");

console.log(`saved ${html.length} chars to ${out}`);
console.log(`\nAdd this to .env at the workspace root:\n  NFCE_FIXTURE=${target}`);
