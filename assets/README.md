# assets

The logo, and the icons both front ends are dressed in. Nothing here is loaded
at runtime — these are the sources the committed PNGs are rendered from.

| File                   | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `logo.af`              | The Affinity Designer document. The real master; edit this one          |
| `base-logo.svg`        | Exported from it, untouched. The reference the three below derive from  |
| `icon.svg`             | `base-logo.svg` with the mark scaled 1.2× — every square icon           |
| `icon-foreground.svg`  | The mark at 0.8× on transparency — the Android adaptive foreground      |
| `icon-monochrome.svg`  | The same, in one colour — the Android themed-icon layer                 |

The three derivatives wrap `base-logo.svg`'s four artwork groups in a single
centre-anchored `scale()` and change nothing else, so the path data stays
comparable to the export. Re-exporting the logo means re-applying that wrapper,
not redrawing anything.

## Why three scales

Measured off `base-logo.svg`, the mark occupies **x 117.8 → 882.2, y 272.2 →
727.8** on its 1000×1000 grid: 764.5 × 455.6, centred exactly on (500, 500). So
it fills 76.4% of the tile's width, 45.6% of its height, and it is a wide mark —
1.68:1 — sitting in a square.

That drives the two numbers:

- **1.2× for square icons.** The export leaves an 11.8% margin on each side,
  which reads as slack at icon sizes. The hard ceiling is 1.308× (`1000 / 764.5`),
  where the dots touch the edge; 1.2× lands at 91.7% width with a 4.1% rim. The
  dots sit on the vertical centre line, where iOS's squircle mask is at full
  width, so they are never clipped.
- **0.8× for the Android layers.** An adaptive icon only guarantees the inner
  66/108 (61.1%) circle is visible, and a round mask at full size would take a
  bite out of both dots. At 0.8× the mark is 611.6 wide and the dots' outer edge
  lands at radius 305.8 against a safe radius of 305.5 — flush, by construction.

The Android background is not an image: `app.json` sets `backgroundColor` to
`#1E0F3C`, the logo's own background, so there is no second file to keep in sync.

## Regenerating

Run from the repo root. Nothing is installed — `npx` fetches `sharp-cli` for the
run and the repo `package.json`s stay untouched.

```bash
tmp=$(mktemp -d)
icon() {  # icon <src.svg> <px> <dest.png> [extra sharp commands...]
  src=$1; px=$2; dest=$3; shift 3
  npx --yes sharp-cli -i "assets/$src" -o "$tmp" --density 288 -f png resize "$px" "$px" "$@"
  mv "$tmp/$(basename "$src" .svg).png" "$dest"
}

icon icon.svg            1024 mobile/assets/icon.png                     -- removeAlpha
icon icon-foreground.svg  512 mobile/assets/android-icon-foreground.png
icon icon-monochrome.svg  432 mobile/assets/android-icon-monochrome.png
icon icon.svg              48 mobile/assets/favicon.png
icon icon.svg              32 container/web/public/favicon-32.png
icon icon.svg              16 container/web/public/favicon-16.png
icon icon.svg             180 container/web/public/apple-touch-icon.png  -- removeAlpha

cp assets/icon.svg container/web/public/favicon.svg
rm -rf "$tmp"
```

Four things that look arbitrary and are not:

- **`--density 288`** renders the vector at 4× before the resize down. librsvg
  defaults to 72 DPI, which would rasterize the 1000px viewBox at 1000px and
  make the 1024px iOS icon a slight *up*scale.
- **`removeAlpha`** on the two that need it. App Store validation rejects an
  icon with an alpha channel, and `apple-touch-icon` composites badly with one.
  The others keep theirs: the Android layers are transparent by design.
- **`-o` takes a directory**, never a filename, and names the output after the
  input — hence the `mv`. Writing to stdout instead is not an option; `sharp-cli`
  requires `-o` whenever `-i` is given.
- **`"$@"` rather than `$@`**, and the `--` passed by the caller. zsh does not
  word-split unquoted expansions, so building the extra arguments into one
  string silently drops them and the file is written *with* its alpha channel.

The sizes match what Expo's template shipped, so nothing downstream had to
change. `splash-icon.png` in `mobile/assets` is left alone: `expo-splash-screen`
is not installed and `app.json` has no `splash` block, so it is currently
vestigial.
