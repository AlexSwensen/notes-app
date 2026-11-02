# 📝 Notes

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
| `DATA_DIR`     | `/data` (Docker), `server/data`  | Where `notes.db` and `secret.key` live                       |
| `ALLOW_SIGNUP` | `true`                           | `false` disables new accounts. The first account can always be created. |
| `AUTH_SECRET`  | auto-generated in `DATA_DIR`     | HMAC key for session tokens                                  |
| `TRUST_PROXY`  | `false`                          | Set `true` behind a reverse proxy so login rate limits use the real client IP |

## Development

Requires Node 24+. The server runs TypeScript natively, with no build step.

```bash
npm run install:all
npm run dev:server   # API on :3000
npm run dev:client   # Vite on :5173 (proxies /api to :3000)
npm test             # server tests
```

## How sync works

- Every note is a document with an `updatedAt` timestamp. The client writes to IndexedDB (Dexie) first and marks the note `dirty`.
- The sync engine `POST /api/sync`s the dirty notes together with the last server sequence number it has seen. The server applies them with **last-writer-wins per note**, then returns everything changed since that sequence (paginated).
- The server pushes a `change` event over SSE to your other connected devices, and they pull immediately. Clients also sync on startup, on reconnect, when the tab regains focus, and every 60 seconds.
- Deletions are tombstones (`purged`), so they propagate to every device.

## Project layout

```
server/   Fastify + node:sqlite API (auth, sync, SSE) and static hosting
client/   React + TipTap editor, Dexie (IndexedDB), MiniSearch, vite-plugin-pwa
```
