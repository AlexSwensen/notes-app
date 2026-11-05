# Migrating to better-auth

Status: **design / decision-making in progress** (2026-11-03).
This is a living design doc. Decisions are recorded in the "Decisions" section with the date;
open questions are in "Open Questions". Update this file as we go.

## Goal

Replace Sheafly's home-grown auth with [better-auth](https://better-auth.com):

- **No re-registration**: every existing user must be able to log in with their **existing
  email and password** after the migration.
- Move from the current **stateless HMAC Bearer token** to **cookie-based sessions**.
- Use better-auth's **built-in rate limiting**.

## Current auth (what we're migrating FROM)

| Concern         | Implementation                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User table      | `apps/server/src/db/schema/users.ts`: `id` (UUID text PK), `email` (`NOcase` unique), `password_hash`, `created_at` (ms integer).                                                                              |
| Password hash   | `apps/server/src/auth/password.ts`: **scrypt**, self-describing string `scrypt$<salt>$<key>` (salt+key base64url). `verifyPassword(pw, stored) -> boolean`.                                                    |
| Sessions        | `apps/server/src/auth/tokens.ts`: stateless HMAC-SHA256 `<payload>.<sig>`, payload = base64url `{sub, exp}`, 90-day TTL. Stored client-side in `localStorage['notes.token']`, sent as `Authorization: Bearer`. |
| Rate limit      | `apps/server/src/auth/rate-limit.ts`: in-memory 20 attempts / IP / 15 min.                                                                                                                                     |
| Auth routes     | `apps/server/src/routes/auth.ts`: `GET /api/config`, `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/me`.                                                                                           |
| Auth in context | `AppContext.requireUser` / `userFromToken` (`app.ts`) also gate `routes/sync.ts` and `routes/events.ts` (SSE, token via query string).                                                                         |
| Client          | `components/Auth.tsx` + `lib/api.ts`: POST `{email,password}`, store returned token in `localStorage['notes.token']` / `['notes.user']`.                                                                       |
| FK              | `notes.user_id -> users.id ON DELETE CASCADE` (see `drizzle/20261102192822_init/migration.sql`).                                                                                                               |

## Decisions

| #   | Decision                                                                                                                         | Date       | Notes                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| D1  | **Table strategy: create a NEW better-auth `user` table** (better-auth core schema), and **copy** existing `users` rows into it. | 2026-11-03 | Chosen over "reuse/alias the existing `users` table". See T2.         |
| D2  | **Cookies, not Bearer tokens.** Client switches to `createAuthClient()` from `better-auth/react` + `useSession()`.               | 2026-11-03 | See T4 for why this is clean (same-origin).                           |
| D3  | **Re-login on upgrade is acceptable.** The old Bearer token is dropped; users sign in once via cookies on upgrade.               | 2026-11-03 | IndexedDB notes are untouched, so no note data is orphaned.           |
| D4  | **Use better-auth's built-in rate limiting.** Drop `auth/rate-limit.ts`.                                                         | 2026-11-03 | Replace 20/IP/15min with better-auth defaults (tune later if needed). |
| D5  | **Decisions + design live in this doc** (`docs/agent/`), referenced from `AGENTS.md`.                                            | 2026-11-03 |                                                                       |

## better-auth facts (grounded in their docs)

- **Fastify integration**: mount a catch-all `/api/auth/*` forwarding to `auth.handler(req)`;
  read the session in routes via `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`.
- **Drizzle adapter**: `drizzleAdapter(db, { provider: 'sqlite' })` accepts the **same Drizzle
  instance** Sheafly already builds in `db/index.ts` → writes to the same `notes.db`. `node:sqlite`
  is supported; no engine change.
- **Core schema** (default table names): `user`, `session`, `account`, `verification`.
  **The password lives on `account`, not `user`**: a credential account is
  `{ providerId: 'credential', accountId: <userId>, userId, password: <hash> }`
  (for credentials, `accountId` = the user's id).
- **Custom verifier (the crux for old passwords)**: point `emailAndPassword.password.verify` at
  our existing scrypt verifier so old hashes keep working:
  ```ts
  emailAndPassword: {
    enabled: true,
    password: {
      verify: ({ hash, password }) => verifyPassword(password, hash), // scrypt$salt$key
      hash: async (pw) => hashPassword(pw), // rehash to native on first login
    },
  }
  ```
- **Preserve existing ids**: the migration uses `ctx.adapter.create({ model: 'user', data: { id, ... },
forceAllowId: true })`, then creates the `credential` account carrying the old `password_hash`.
  Pattern taken from better-auth's Clerk migration guide (Clerk also uses a non-bcrypt hash —
  same situation as us).
- **Sessions are invalidated by any auth swap** → users sign in again (same password).
- **Rehash-on-login**: on first successful legacy sign-in, overwrite `account.password` with a
  native hash; once no `account.password` starts with `scrypt$`, retire the custom `verify`.
- **Session config**: default 7-day expiry + 1-day refresh (`session.expiresIn` / `updateAge`);
  optional `session.cookieCache` (strategies `compact`/`jwt`/`jwe`).
- **Client** (`better-auth/react`): same-origin means `createAuthClient()` needs **no baseURL**.
  Reactive session via `const { data: session, isPending, error, refetch } = authClient.useSession()`;
  methods `signOut()`, `changePassword({ revokeOtherSessions })`, `signIn.email({ email, password })`.
  Cookies are managed automatically for same-origin requests.
- **Install**: `npm install better-auth -w @sheafly/client` and
  `npm install better-auth @better-auth/drizzle-adapter -w @sheafly/server`.

## T2 — new `user` table and the `notes.user_id` foreign key (RESOLVED, with a phased path)

**Decision D1** introduces a new `user` table (better-auth's identity store). `notes.user_id`
currently references `users.id`. Two facts drive the plan:

1. **The data copy is a runtime script, not a drizzle migration.** better-auth's idempotent copy
   (`users` → `user` + credential `account` rows) runs at server startup. A drizzle migration runs
   _before_ that script on a given start, so a drizzle migration can't assume `user` is populated.
2. **SQLite can't ALTER a foreign key in place.** Repointing `notes.user_id` from `users.id` to
   `user.id` requires a table rebuild (create new table with the new FK → copy → drop old → rename).
   That rebuild validates every `notes.user_id` against the new parent, so it can only happen
   **after** the copy has populated `user`.

### End state (target)

- better-auth owns `user` / `session` / `account` / `verification`.
- `notes.user_id -> user.id ON DELETE CASCADE` (repointed).
- Old `users` table dropped. `auth/password.ts` legacy scrypt verifier retired.

### Phased, reversible path

- **Phase 1 — additive (fully reversible).**
  - New drizzle migration: `CREATE` `user`, `session`, `account`, `verification`. Purely additive;
    safe and reversible (nothing repointed yet, `users` untouched).
  - Startup migration script (`apps/server/scripts/migrate-users.ts`, guarded by a `meta` flag so
    it's idempotent): for each row in `users`, `ctx.adapter.create` a `user` (same `id`,
    `forceAllowId: true`) and a `credential` `account` (`accountId = id`, `password = old password_hash`).
  - App identity lookups move to better-auth: `AppContext.requireUser` / `userFromToken` resolve via
    `auth.api.getSession(...)`; `routes/auth.ts` calls `auth.api.signInEmail` / `signUpEmail`.
  - **`notes.user_id` still points at `users.id`.** Because ids are preserved, the FK keeps
    validating against `users`, which still holds the rows. Zero data movement on `notes`.
  - `users` is kept for the FK only. Rollback = revert code; no data is destroyed.
- **Phase 2 — repoint + cleanup (separate release, after a delay).**
  - A drizzle migration repoints `notes.user_id` to `user.id` (SQLite table rebuild) and drops
    `users`. This must ship **after** every running deployment has executed the Phase-1 copy,
    otherwise a fresh migration on a not-yet-migrated DB would rebuild `notes` against an empty
    `user` table. Enforce with a release delay (e.g. Phase 2 ships one minor version after Phase 1).
  - Once no `account.password` starts with `scrypt$`, remove the custom `verify` (native hashing only).

### Open sub-questions for T2

- **Q-T2a**: For Phase 1, keep `notes.user_id -> users.id` (recommended — zero data movement) vs.
  repointing immediately in the script. Recommendation: keep it; repoint in Phase 2.
- **Q-T2b**: How to generate the better-auth drizzle schema — hand-write the four tables in
  `apps/server/src/db/schema/` (one file per table, per AGENTS.md) and run `npm run db:generate`,
  using `npx auth generate` as a reference for exact column names/types. Recommendation: hand-write
  to keep one schema folder + one migration chain; verify columns against `npx auth generate`.
- **Q-T2c**: `createdAt`/`updatedAt` type. better-auth expects real dates; our `created_at` is a
  **ms integer**. The copy must map correctly (see T6 / better-auth's `max_age`/date note).

## Phased migration script (sketch)

```ts
// apps/server/scripts/migrate-users.ts  (run at startup; idempotent via meta flag)
const done = (await getMeta<boolean>('better-auth-migrated')) === true
if (!done) {
  const ctx = await auth.$context
  const rows = /* SELECT id, email, password_hash, created_at FROM users */
  for (const u of rows) {
    await ctx.adapter.create({
      model: 'user',
      data: { id: u.id, email: u.email, createdAt: toDate(u.created_at) /* see Q-T2c */ },
      forceAllowId: true,
    })
    await ctx.adapter.create({
      model: 'account',
      data: { providerId: 'credential', accountId: u.id, userId: u.id, password: u.password_hash },
    })
  }
  await setMeta('better-auth-migrated', true)
}
```

Test on a throwaway DB copy first; verify a migrated user logs in with the **old** password
(via the scrypt `verify`), and that `notes.user_id` still resolves.

## Integration points to change

- **Server**
  - New `apps/server/src/auth/better-auth.ts`: `betterAuth()` with `drizzleAdapter`, custom
    `verify`/`hash`, `emailAndPassword` enabled, rate limiting on.
  - `app.ts`: register `/api/auth/*` catch-all; rewrite `requireUser`/`userFromToken` to use
    `auth.api.getSession({ headers })`. Ripples into `routes/sync.ts` and `routes/events.ts`.
  - `routes/auth.ts`: `auth.api.signInEmail` / `signUpEmail`; `GET /api/config` → better-auth's
    allow-signup concept.
  - Delete `auth/tokens.ts` and `auth/rate-limit.ts`; update server tests in `apps/server/test/`
    (`routes-auth.test.ts`, `auth.test.ts`, `helpers.ts` — `signup()` uses Bearer tokens today).
- **Client**
  - `components/Auth.tsx` + `lib/api.ts`: use `createAuthClient()`; drop the
    `localStorage['notes.token']` / `['notes.user']` handling (re-login on upgrade, D3).
  - `sync.ts` / `api.ts` `fetch` calls must send cookies (`credentials: 'include'`).
- **Shared types** (`packages/shared/src/api.ts`): `AuthResponse` / `ConfigResponse` change shape —
  update here FIRST (per the "change shared types first" convention).
- **AGENTS.md**: the "don't rename `notes.*` keys" invariant no longer holds for `notes.token`
  / `notes.user` (they become obsolete, not renamed). Update the wording so it doesn't mislead.

## Open questions

- **T1 — AGENTS.md invariant conflict (D3):** moving to cookies makes `notes.token` / `notes.user`
  obsolete. Decision: stop _using_ them (not rename), re-login on upgrade. Still update AGENTS.md
  text accordingly. **Action**: update AGENTS.md wording.
- **T3 — `notes.token` key:** same as T1; clearing on upgrade is fine (D3).
- **T4 — SSE + cookies (RESOLVED for same-origin):** `EventSource` sends cookies automatically for
  same-origin requests. Sheafly is same-origin (server serves the built client in `routes/static.ts`),
  so the better-auth `session_token` cookie flows to `/api/events` and `getSession` — we can **drop the
  query-string token** from the SSE route. (Cross-origin would need CORS `credentials` +
  `Access-Control-Allow-Credentials`; not our case, but keep in mind if a separate client host is ever used.)
- **T5 — email case-insensitivity:** our `users.email` is `NOcase`; confirm better-auth's `user.email`
  still prevents `A@x.com` / `a@x.com` collisions. (Verify before building.)
- **T6 — schema validation / date types:** better-auth validates user-table columns at init; confirm
  additive columns (`updatedAt`, `emailVerified`, `name`) satisfy it, or relax
  `advanced.database.validateSchema`. Also confirm `createdAt`/`updatedAt` date handling (Q-T2c).

## Verify before building

- Run on a throwaway DB copy first; confirm a migrated user logs in with the OLD password (via the
  scrypt `verify`), and that `notes.user_id` still resolves after the copy.
- Confirm `docker compose up -d --build` still serves the app and `GET /api/health`.

## Next steps

1. (this doc + AGENTS.md note) ✅
2. Resolve T5 / T6 by reading better-auth docs (email case handling, schema validation, date types).
3. Answer Q-T2a/b/c (recommended answers given above — confirm).
4. Phase 1 implementation as one PR: shared types → better-auth config + tables → migration script →
   routes → client → tests → AGENTS.md wording.
5. Phase 2 (separate release): repoint FK + drop `users` + retire legacy verifier.
