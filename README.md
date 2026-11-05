# 📝 Sheafly


<img width="1844" height="899" alt="Sheafly app after login" src="https://github.com/user-attachments/assets/539f59df-c66a-4b8d-ab02-1b0bb033a2f6" />

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

Contributions are welcome: bug reports, ideas and pull requests all help. See [Contributing](#contributing).

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

#### Unraid

1. Copy the template into Unraid's user templates folder. From the Unraid terminal (**>_** in the top right):

   ```bash
   wget -O /boot/config/plugins/dockerMan/templates-user/my-sheafly.xml \
     https://raw.githubusercontent.com/AlexSwensen/sheafly/main/unraid/sheafly.xml
   ```

   Or copy [`unraid/sheafly.xml`](unraid/sheafly.xml) there yourself. The file name must start with `my-`.
2. On the **Docker** tab, click **Add Container** and pick **sheafly** under **User templates** in the **Template** dropdown.
3. Check the port and data path (default `/mnt/user/appdata/sheafly`), then click **Apply**.

The template uses the `latest` tag, so Unraid's **Check for updates** on the Docker tab flags each new stable release (pre-releases are never tagged `latest`). This needs the GHCR package to be public: GitHub creates it as private, so change it under **Packages → sheafly → Package settings → Change visibility**. Otherwise Unraid shows the update status as "not available". To stay on one major version, set the repository to `ghcr.io/alexswensen/sheafly:1` instead. To install updates automatically, add the **Auto Update Applications** plugin from Community Applications and enable it for the container.

#### Publishing to Docker Hub

The Publish workflow pushes to Docker Hub too once these are set in the GitHub repo (**Settings → Secrets and variables → Actions**):

- **Variable** `DOCKERHUB_USERNAME`: your Docker Hub username (the image becomes `<username>/sheafly`)
- **Secret** `DOCKERHUB_TOKEN`: a Docker Hub [access token](https://app.docker.com/settings/personal-access-tokens) with *Read, Write, and Delete* access

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
  server/                 @sheafly/server: Fastify API, also serves the built client
    src/
      index.ts            entry point: load config, open the DB, start listening
      config.ts           every environment variable is read here
      app.ts              buildApp(): creates Fastify and registers the routes
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
  db/                     @sheafly/db: Drizzle ORM schema, migrations, connection logic
  shared/                 @sheafly/shared: TypeScript types used by both apps (Note, API requests/responses)
  shared/                 @sheafly/shared: TypeScript types used by both apps (Note, API requests/responses)
```

`@sheafly/shared` contains only types, so it has no build step and adds nothing to the server at runtime. If you change the shape of a note or an API response, change it there and both apps will flag what needs updating (`npm run typecheck`).

## Contributing

Contributions of any size are welcome, from fixing a typo to building a new feature. You don't need to be an expert to help.

- **Found a bug or have an idea?** [Open an issue](https://github.com/AlexSwensen/sheafly/issues). Steps to reproduce, screenshots and your browser/device make bugs much easier to fix.
- **Want to write code?** Look for open issues, or open one first for larger changes so we can agree on the approach before you put in the work.

To send a pull request:

1. Fork the repo and create a branch from `main`.
2. Set up the project as described in [Development](#development).
3. Make your change and add or update tests next to the code you touched.
4. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. CI runs the same checks.
5. Use [Conventional Commits](https://www.conventionalcommits.org) for your commit messages (see [Releases](#releases)), then open the pull request against `main`.

[AGENTS.md](AGENTS.md) summarizes the project conventions (styling, database migrations, identifiers that must not be renamed), so it's worth a quick read before your first change.
