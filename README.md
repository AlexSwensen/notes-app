# 📝 Sheafly

A Notion-style notes app with **cloud sync across your devices** and **instant full-text search**. Self-hosted: one small Node server with a SQLite database, run with Docker.

## Features

- **Block editor**: headings, bulleted, numbered and to-do lists, quotes, code blocks, dividers, links and highlights
  - Type `/` for the command menu; Markdown shortcuts work (`#`, `-`, `1.`, `[ ]`, `>`, `` ``` ``)
  - Select text to get a formatting toolbar
- **Nested pages**: a sidebar page tree with drag-and-drop, breadcrumbs, sub-pages, emoji icons and favorites
- **Search** (`Ctrl/⌘ K`): fuzzy, typo-tolerant, prefix search across titles and content, with highlighted snippets. It runs locally, so it's instant and works offline.
- **Cloud sync**: changes sync automatically and appear live on your other open devices (Server-Sent Events)
- **Offline-first**: notes live in IndexedDB, so you can edit offline and changes sync when you reconnect. It can be installed as an app (PWA) on desktop, iOS and Android.
- **Trash**: restore pages, or delete them permanently
- Light and dark mode, responsive mobile layout

## Quick start (Docker)

```bash
docker compose up -d --build
```

Open http://localhost:3000 and create your account. After you've signed up, set `ALLOW_SIGNUP: "false"` in `docker-compose.yml` and run `docker compose up -d` so nobody else can register.

Data (the SQLite DB and the auth signing key) is stored in the `notes-data` volume. Back it up by copying `/data` from the container.

### Using it on your other devices

Service workers (offline support and installing as an app) **require HTTPS** on any host other than `localhost`. Put the server behind a TLS reverse proxy, for example [Caddy](https://caddyserver.com):

```
notes.example.com {
    reverse_proxy localhost:3000
}
```

Or, for a private setup, use [Tailscale](https://tailscale.com) with `tailscale serve 3000`. Then open the URL on your phone and choose **Add to Home Screen** or **Install app**.

### Configuration

| Variable       | Default                          | Description                                                  |
| -------------- | -------------------------------- | ------------------------------------------------------------ |
| `PORT`         | `3000`                           | HTTP port                                                    |
| `DATA_DIR`     | `/data` (Docker), `apps/server/data` | Where `notes.db` and `secret.key` live                   |
| `ALLOW_SIGNUP` | `true`                           | `false` disables new accounts. The first account can always be created. |
| `AUTH_SECRET`  | auto-generated in `DATA_DIR`     | HMAC key for session tokens                                  |
| `TRUST_PROXY`  | `false`                          | Set `true` behind a reverse proxy so login rate limits use the real client IP |
| `PUID` / `PGID` | `1000` / `1000`                 | User and group the server runs as. `/data` is chowned to them on start (use `99`/`100` on Unraid). |

### Prebuilt images and Unraid

Every release publishes a multi-arch image (amd64 and arm64) to `ghcr.io/alexswensen/sheafly`, and to Docker Hub when that's configured (see below). Images are tagged with the version (`1.4.2`, `1.4`, `1`) and `latest`. To use one instead of building locally, replace `build: .` with `image: ghcr.io/alexswensen/sheafly:1` in `docker-compose.yml`.

On Unraid, add `https://github.com/AlexSwensen/sheafly` under **Docker → Template repositories**, or install from [`unraid/sheafly.xml`](unraid/sheafly.xml). Data goes to `/mnt/user/appdata/sheafly`. To pick up new releases automatically, install the **Auto Update Applications** plugin from Community Applications and enable it for the container. Unraid also flags updates on the Docker tab.

#### Publishing to Docker Hub

The Publish workflow pushes to Docker Hub too once these are set in the GitHub repo (**Settings → Secrets and variables → Actions**):

- **Variable** `DOCKERHUB_USERNAME`: your Docker Hub username (the image becomes `<username>/sheafly`)
- **Secret** `DOCKERHUB_TOKEN`: a Docker Hub [access token](https://app.docker.com/settings/personal-access-tokens) with *Read & Write* access

## Development

Requires Node 24+. The server runs TypeScript natively, with no build step. This is an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) monorepo: run every command from the repo root, and there is a single `package-lock.json`.

```bash
npm install          # installs all workspaces
npm run dev:server   # API on :3000
npm run dev:client   # Vite on :5173 (proxies /api to :3000)
npm test             # all tests (client: Vitest, server: node:test)
npm run test:coverage # tests with coverage reports in apps/*/coverage
npm run typecheck    # type-check every workspace
npm run lint         # lint every workspace
```

To add a dependency to one app, target its workspace: `npm install <pkg> -w @sheafly/client`.

## Releases

Versions are worked out by [semantic-release](https://semantic-release.gitbook.io), but nothing ships until you say so. When a push to `main` passes CI and contains releasable commits, it:

1. picks the next version from the commit messages,
2. bumps every `package.json`, updates `CHANGELOG.md`, and commits that as `chore(release): x.y.z`,
3. tags `vx.y.z` and creates a **draft** GitHub release with the notes.

To ship it, open the draft under **Releases**, edit the notes if you like, and click **Publish release**. That triggers the Publish workflow, which builds the Docker image and pushes it to GHCR.

semantic-release counts versions by git tag, not by whether a release was published. So if you haven't published a draft yet, the next releasable push still makes a new draft with a higher version. Publish the newest one, and delete older drafts you don't want.

`main` is protected by a ruleset: changes go through a pull request with the Lint & typecheck, Server tests, Client tests, Build and Commit messages checks passing (merge or rebase; squash is off because PR titles aren't linted). Force-pushes and deletion are blocked. The release job pushes its version commit with a deploy key (secret `RELEASE_DEPLOY_KEY`), the only actor allowed to bypass the ruleset.

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org). A git hook checks them locally (installed by `npm install`), and CI checks them on pull requests.

| Commit | Release |
| ------ | ------- |
| `fix: …` | patch (1.0.**1**) |
| `feat: …` | minor (1.**1**.0) |
| `feat!: …` or a `BREAKING CHANGE:` footer | major (**2**.0.0) |
| `docs:`, `chore:`, `test:`, `refactor:`, `ci:` … | no release |

The running version is shown at the bottom of the sidebar and returned by `GET /api/health`.

## How sync works

- Every note is a document with an `updatedAt` timestamp. The client writes to IndexedDB (Dexie) first and marks the note `dirty`.
- The sync engine `POST /api/sync`s the dirty notes together with the last server sequence number it has seen. The server applies them with **last-writer-wins per note**, then returns everything changed since that sequence (paginated).
- The server pushes a `change` event over SSE to your other connected devices, and they pull immediately. Clients also sync on startup, on reconnect, when the tab regains focus, and every 60 seconds.
- Deletions are tombstones (`purged`), so they propagate to every device.

## Project layout

```
apps/
  server/                 @sheafly/server: Fastify + node:sqlite API, also serves the built client
    src/
      index.ts            entry point: load config, open the DB, start listening
      config.ts           every environment variable is read here
      app.ts              buildApp(): creates Fastify and registers the routes
      db/                 Drizzle: connection and queries (index.ts), schema/ (one file per table + relations)
      sse.ts              tracks open live-update connections per user
      auth/               password hashing, session tokens, login rate limit
      routes/             one file per API area: auth, sync, events (SSE), static files
    test/                 API tests (node:test)
  client/                 @sheafly/client: React PWA (Vite)
    src/
      main.tsx            entry point
      App.tsx             top-level layout and routing
      components/         UI: sidebar, page view, search palette, trash, login
      editor/             TipTap editor and the "/" command menu
      hooks/              React hooks (routing, theme, note tree)
      lib/                non-UI logic: API client, IndexedDB, note actions, sync, search
packages/
  shared/                 @sheafly/shared: TypeScript types used by both apps (Note, API requests/responses)
```

`@sheafly/shared` contains only types, so it has no build step and adds nothing to the server at runtime. If you change the shape of a note or an API response, change it there and both apps will flag what needs updating (`npm run typecheck`).
