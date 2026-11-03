# 🚀 Comprehensive Migration Plan: From Custom Auth to Better-Auth

**Project:** Sheafly
**Goal:** Migrate the existing authentication system to utilize the `better-auth` framework while maintaining **zero data loss** and **zero forced user re-registration**.
**Core Components:** React PWA (Client) $\leftrightarrow$ Fastify/Drizzle (Server) $\leftrightarrow$ SQLite (Database).
**Date:** 2026-11-03
**Auth Status:** Custom hashing (`scrypt`) $\rightarrow$ `better-auth` JWTs.
**Tenancy Status:** Flat User Schema $\rightarrow$ Multi-tenant, Organization/Team structure.

---

## 💡 Architectural Summary & Dependencies

### **1. Project Conventions (From `AGENTS.md`)**
*   **Database Layer:** Drizzle ORM on SQLite. All schema changes must be run via `npm run db:generate -w @sheafly/server`.
*   **Core Concept:** The client is **offline-first** (IndexedDB sync). All persistent IDs must be protected.
*   **Versioning:** Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org).

### **2. Better-Auth Features Implemented**
*   **Security:** Supports 2FA (TOTP, OTP), Account Lockout, and strong password hashing via plugins.
*   **Multi-Tenancy:** Full Organization, Team, Role, and Member management.
*   **Scalability:** Built-in hooks for customization (`beforeCreateOrganization`, etc.).

### **3. The Migration Gap (The Bridge)**
The biggest gap is connecting the old, flat user model to the new, relational model required by `better-auth`'s plugins. The migration plan must account for this connection point.

---

## 🗓️ Phase-by-Phase Execution Plan

### **Phase 0: Preparation & Schema Integration (Current Focus)**
**Goal:** Establish the new required schema for `better-auth` and integrate the core libraries.
**Steps:**
1.  **Install Dependencies:** Update `package.json` in `@sheafly/server` and potentially `shared` with `better-auth` and its required plugins.
2.  **Schema Update:** Run `npm run db:generate -w @sheafly/server` to create migration files that incorporate new tables (Organizations, Teams, 2FA credentials, etc.).
3.  **Migration Script Creation:** Write an initial, one-time migration script (e.g., `scripts/migrate-auth.ts`) that reads old data and writes it to the new structured tables.

### **Phase 1: Service Layer Refactoring (Backend)**
**Goal:** Decouple authentication logic from old custom implementations.
**Steps:**
1.  **Hashing Replacement:** Replace custom `scrypt` logic in `apps/server/src/auth/password.ts` with `better-auth`'s hashing service.
2.  **Token Service Replacement:** Replace custom JWT issuance in `apps/server/src/auth/tokens.ts` with the `better-auth` token/session management service.
3.  **API Endpoint Updates:** Update endpoints in `apps/server/src/routes/*` to initialize and use `better-auth` context for authentication checks.
4.  **Hook Integration:** Implement necessary hooks (e.g., `beforeAuth` hooks) in `apps/server/src/auth/index.ts` to wrap core logic with multi-tenancy and organization checks.

### **Phase 2: Client-Side State & API Update (Frontend)**
**Goal:** Adapt the client to the new token and session management flow.
**Steps:**
1.  **API Client Update:** Modify `apps/client/src/lib/api.ts` to fetch user state and tokens using the new backend endpoints.
2.  **State Management:** Update state management logic (in components like `Sidebar.tsx`, `Home.tsx`) to handle Organization/Team context and the possibility of multi-user sessions (if applicable).
3.  **Persistence:** Review `apps/client/src/lib/api.ts`'s usage of `localStorage` and update it to interact with the new authenticated context.

### **Phase 3: Data Migration Execution & Testing**
**Goal:** Execute the one-time data migration and validate functionality.
**Steps:**
1.  **Run Migration Script:** Execute the script from Phase 0 (`scripts/migrate-auth.ts`) *offline* using a dedicated test database instance.
2.  **Validation:** Manually verify that existing users retain their correct roles, team assignments, and notes data integrity.
3.  **Deployment:** Once validated, wrap the migration logic into a data-only migration task that runs *before* the first production deployment of the new auth service.

---

## 🛑 CRITICAL CONSTRAINTS & WARNINGS

1.  **Data Integrity:** **Never** hardcode migration assumptions. The migration must be deterministic and account for all historical data fields.
2.  **User Experience:** All changes must respect the offline-first nature and avoid any mechanism that forces a user to log out or re-register unless explicitly required for a feature rollout (and even then, this must be noted).
3.  **Idempotency:** The migration script must be idempotent, allowing it to be rerun safely.
