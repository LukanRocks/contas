# Contas

Long-term goal: a grocery price database built from scanned NFC-e receipts.
Today that is the ingestion core, plus two front ends that read it.

The repo holds three independent projects, each with its own dependencies and
lockfile:

| Folder                                 | What it is                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`container/`](container/README.md)    | The self-hosted server — the ingestion API and the web front end it serves, shipped as one Docker image |
| [`mobile/`](mobile/README.md)          | React Native (Expo) client for iOS and Android, talking to that server                                  |
| [`v2/`](v2/README.md)                  | The next architecture: a self-hosted finance API (Bun, Postgres) the projects above will move onto      |
| [`assets/`](assets/README.md)          | The logo, and the icon sources both front ends are rendered from                                        |

## Getting started

The server:

```bash
cd container && pnpm install && pnpm dev
```

Then open <http://localhost:3000>. Tests, Docker and adding a package are in
[container/README.md](container/README.md).

The mobile app:

```bash
cd mobile && pnpm install && pnpm ios
```

See [mobile/README.md](mobile/README.md).

No real fiscal note is committed to this repo — a scanned NFC-e carries the
buyer's CPF. Tests that need one skip unless you point them at a page you
captured yourself; see
[container/backend/README.md](container/backend/README.md#testing).

## CI

One workflow per project, each filtered to its own folder:

- [`docker.yml`](.github/workflows/docker.yml) — typechecks and tests
  `container/`, then builds the image and publishes it to GHCR from `main` and
  `v*` tags.
- [`mobile.yml`](.github/workflows/mobile.yml) — typechecks and tests
  `mobile/`.

## Layout

```
container/    the server workspace and its Docker image (see container/README.md)
mobile/       the Expo app (see mobile/README.md)
assets/       the logo and the icon sources (see assets/README.md)
.github/      one workflow per project
```

## License

Copyright (C) 2026 Lukan Vanderlinde

Contas is free software: you can redistribute it and/or modify it under the
terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).

It comes without any warranty, to the extent permitted by law.

The AGPL keeps every version open, including ones that only run on a server.
If you modify Contas and let people use it over a network, you must offer
those users the source of your version.

Up to commit `d1bcd92` the project was released under the MIT license, and
copies of those versions remain available under MIT.
