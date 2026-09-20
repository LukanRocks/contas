# @nf-price-tracker/web

A plain HTML/CSS/JS front end for browsing scanned notes and exercising the
ingest flow. No framework, no build step, no dependencies — `public/` is served
exactly as written, by `@nf-price-tracker/backend`.

## Running

These are static files with no server of their own — the backend serves them at
`/`. From the workspace root:

```bash
pnpm dev
```

Then open <http://localhost:3000>.

The API is same-origin under `/api`, so there is nothing to configure and no
CORS involved. The backend finds these files via its `WEB_ROOT` setting, which
defaults to this folder's `public/`.

## What it does

- **Scan** — paste an NFC-e QR URL and `POST /api/nfce`. An example button
  fills in the sample receipt. Success jumps to the new note; failures show the
  backend's own error message.
- **List** — `GET /api/nfce`, newest emission first. Click or press Enter on a row
  to open it.
- **Detail** — `GET /api/nfce/:chave`, showing every extracted field: issuer,
  totals, consumer, all line items, and collection metadata.
- **Original note** — the captured portal page itself, rendered as the last
  section from `GET /api/nfce/:chave/html`.

Routing is hash-based (`#/`, `#/nota/<chave>`), so notes are deep-linkable and
survive a refresh.

## Layout

```
public/
  index.html            page shell
  styles.css            light/dark via prefers-color-scheme
  app.js                routing, rendering, formatting
  favicon.svg           the logo, for browsers that take an SVG icon
  favicon-32.png        raster fallbacks for those that do not
  favicon-16.png
  apple-touch-icon.png  what iOS uses when the page is saved to the home screen
```

## Notes

- Values arrive as integer cents and are formatted for display only
  (`R$ 844,57`); CNPJ, CPF and the chave are stored digits-only and formatted
  here too.
- All interpolated values pass through an HTML escape helper — item
  descriptions come from a scraped page and are treated as untrusted text.
- The captured page is shown in a `sandbox` iframe, never injected into this
  document. It gets an opaque origin with scripts and forms disabled, so
  third-party markup can never run against the origin the API lives on. The
  iframe is a fixed height with its own scrollbar: a sandboxed document cannot
  be measured from the parent, so it cannot auto-size.
