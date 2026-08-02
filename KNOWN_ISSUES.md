# KNOWN ISSUES — Kamai Backend OMS

> Documents known issues, limitations, blockers, and temporary workarounds.
> Updated as issues are discovered and resolved.

---

## KI-001 — `fastify-plugin` not listed as direct dependency

**Status:** ⚠️ Open
**Discovered:** 2026-07-25 (Foundation)

### Issue

`fastify-plugin` is required by all plugin files but was not added to `package.json` explicitly. It is a transitive dependency of Fastify.

### Cause

Oversight during initial scaffold.

### Temporary Fix

None needed — currently works as transitive dependency.

### Permanent Solution

Add `fastify-plugin` as a direct dependency:
```
pnpm add fastify-plugin
```

---

## KI-002 — Argon2 requires native build tools in Docker

**Status:** ⚠️ Open
**Discovered:** 2026-07-25 (Foundation)

### Issue

The `argon2` npm package uses native bindings and may fail to build in Alpine Linux containers without build tools.

### Cause

Alpine Linux does not include `python3`, `make`, `g++` by default.

### Temporary Fix

Not yet encountered (argon2 not integrated yet).

### Permanent Solution

Add to Dockerfile before `pnpm install`:
```dockerfile
RUN apk add --no-cache python3 make g++
```

---

## KI-003 — Prisma `directUrl` required for Supabase migrations

**Status:** ⚠️ Open
**Discovered:** 2026-07-25 (Foundation)

### Issue

Supabase uses a connection pooler (PgBouncer) by default. Prisma migrations do not work through PgBouncer (transaction mode limitation).

### Cause

PgBouncer in transaction mode does not support `SET LOCAL` statements used by Prisma migrations.

### Temporary Fix

Use `DIRECT_URL` (non-pooled Supabase connection) for migrations. The `directUrl` is already configured in `schema.prisma`.

### Permanent Solution

Always run migrations using `DIRECT_URL`:
```
# .env
DATABASE_URL=postgresql://...@db.<project>.supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://...@db.<project>.supabase.co:5432/postgres
```

---

## KI-004 — ESLint path alias resolution requires `eslint-import-resolver-typescript`

**Status:** ⚠️ Open
**Discovered:** 2026-07-25 (Foundation)

### Issue

ESLint's `import/order` and `import/no-unresolved` rules cannot resolve `@/` TypeScript path aliases without the TypeScript resolver.

### Cause

Standard `eslint-plugin-import` does not understand TypeScript `paths` in tsconfig.

### Temporary Fix

`eslint-import-resolver-typescript` is configured in `.eslintrc.json` under `settings.import/resolver`.

### Permanent Solution

Ensure `eslint-import-resolver-typescript` is installed:
```
pnpm add -D eslint-import-resolver-typescript
```

---

## KI-005 — Vitest path aliases need manual configuration

**Status:** ⚠️ Open
**Discovered:** 2026-07-25 (Foundation)

### Issue

Vitest does not automatically read TypeScript `paths` from `tsconfig.json`. Path aliases (`@/`, `@modules/`, etc.) must be manually mapped in `vitest.config.ts`.

### Cause

Vite/Vitest resolves modules independently of TypeScript compiler.

### Temporary Fix

Path aliases manually configured in `vitest.config.ts` resolve block.

### Permanent Solution

Consider using `vite-tsconfig-paths` plugin:
```
pnpm add -D vite-tsconfig-paths
```

---

## KI-006 — Test suite: `DEV_BYPASS_AUTH` stub doesn't apply when a test file runs in isolation

**Status:** ⚠️ Open
**Discovered:** 2026-07-31 (Action 26 — Shareable Menu Link)

### Issue

Running a single test file directly (`vitest run tests/action26-shareable-menu-link.test.ts`, or any other single file) gets spurious 401s on every authenticated route, even though `tests/setup.ts` calls `vi.stubEnv('DEV_BYPASS_AUTH', 'true')`. Reproduces identically on pre-existing files (confirmed on `action16-investment-ledger.test.ts`), so this is not specific to any one test — every test file is affected when run alone.

### Cause

ES module imports are hoisted above other top-level statements within a file. In `tests/setup.ts`, `import { prisma } from '../shared/database/prisma.js'` (which transitively imports `src/config/env.ts` and parses `process.env` into the frozen `env` singleton) is hoisted ahead of the `vi.stubEnv(...)` calls that appear earlier in the file textually. `env.DEV_BYPASS_AUTH` therefore gets parsed from the real, un-stubbed `process.env` (default `false`, since `.env` doesn't set it) before the stub ever takes effect, and nothing re-parses it afterward.

### Temporary Fix

Pass the same values as real shell env vars instead of relying on the stub, e.g.:
```
NODE_ENV=test DEV_BYPASS_AUTH=true DEV_BAKER_ID=test-baker-id JWT_SECRET=... npx vitest run <file>
```
This sidesteps the hoisting order entirely since real `process.env` values are already present before any import executes.

### Permanent Solution

Not yet decided — options include restructuring `tests/setup.ts` so `vi.stubEnv` calls happen before any import that transitively loads `config/env.ts` (may require deferring that import), or moving the dev-bypass values into a dedicated `.env.test` loaded via `dotenv` before Vitest's module graph resolves. Needs a look before it's trusted for CI, since CI's `env:` block only sets `NODE_ENV`/secrets, not `DEV_BYPASS_AUTH` — worth confirming whether CI is actually affected or coincidentally sidesteps this the same way the temporary fix does.

---

## KI-007 — Test suite: shared `'test-baker-id'` fixture races when test files run concurrently

**Status:** ⚠️ Open
**Discovered:** 2026-07-31 (Action 26 — Shareable Menu Link)

### Issue

Running the full suite (`vitest run`, all ~25+ files) produces failures that don't reproduce when files are run individually — including in files unrelated to whatever change triggered the run (e.g. `tests/integration/orders.test.ts`, `tests/integration/inventory.test.ts` failing with `Unique constraint failed on the fields: (id)` or assertions on data that should exist but doesn't).

### Cause

Vitest runs test files concurrently (multiple worker processes) by default. Every test file in this suite creates/deletes/reads the same hardcoded `bakerId: 'test-baker-id'` row against the same live Supabase database, with no per-file or per-worker isolation. Two files' `beforeEach`/`beforeAll` hooks racing on that one row (one deleting+recreating it while another is mid-test) produces exactly this class of cross-file, seemingly-unrelated failure.

### Temporary Fix

Run test files sequentially, or run one file at a time, when you need a trustworthy result.

### Permanent Solution

Not yet decided — options include a unique baker fixture id per test file (or per Vitest worker), a dedicated/ephemeral test database instead of the shared live Supabase instance, or forcing sequential file execution (`fileParallelism: false` in `vitest.config.ts`, at the cost of slower runs). Will only get worse as more feature test files are added on top of the existing ~25 — each new file is another racer against the same fixture.

---

## KI-008 — Upload flows can orphan objects in Supabase Storage (no delete/sweep mechanism)

**Status:** ⚠️ Open
**Discovered:** 2026-07-31 (Action 26 — Shareable Menu Link, photo upload review)

### Issue

Two known instances of the same gap — an object gets written to Supabase Storage with no DB row ever referencing it, and nothing ever cleans it up:

1. **`BUSINESS_LOGO`** (`baker-profile.service.ts` / the "Change Photo" flow) — confirms and overwrites `baker.logoPath` immediately on upload. The *previous* logo's object is never deleted, so every logo replacement orphans the old file.
2. **`MENU_ITEM_PHOTO`** (`menu-items` module) — the signed-upload-url + direct-PUT happens the moment a file is chosen in the Add/Edit Menu Item form, before the menu item is created/saved. If the baker closes the sheet or navigates away after the photo finishes uploading but before submitting, the uploaded object has no referencing `MenuItem.photoPath` and never will (each upload gets a fresh `uuid()` path — see `uploads.service.ts` — so a later upload can't coincidentally reuse and "adopt" the orphaned path).

Confirmed low-cost at current scale (small bucket, early-stage user base, private bucket so orphans aren't publicly discoverable) — not urgent, but unbounded: it grows with every logo change and every abandoned menu-item photo upload, with zero cleanup today.

**Update (2026-08-02):** A separate symptom sharing this same upload-then-verify-later seam has been **fixed** and should not be confused with the orphan-object issue above, which remains open. Both `confirmUpload()` (BUSINESS_LOGO/FSSAI_DOCUMENT) and `verifyPhotoPath()` (MENU_ITEM_PHOTO) called a shared `verifyObjectExists()` that made a second, independent network call to Supabase Storage's `list` API after the client's direct PUT had already completed — and silently collapsed *any* failure of that call (timeout, transient 5xx, network blip) into the same `false` as "the file genuinely isn't there," with zero logging (a 400 never reached the `>=500` logging branch in the global error handler). This produced intermittent, unlogged "something went wrong" failures on both the menu-item photo submit and the baker profile picture confirm, indistinguishable from real user error. Root-caused via code-path tracing (see `src/shared/storage/supabase.storage.ts`); ruled out signed-URL expiry (Supabase upload-sign tokens are ~2hr, not configurable — the `expiresInSeconds` param was dead code) and Vercel request-timeout (this service isn't deployed on Vercel — no `vercel.json`/`api/` dir, runs as a persistent Fastify process). Fixed by: retrying the `list()` call once on error, throwing a distinguishable `StorageVerificationError` (503, `errorCode: STORAGE_VERIFICATION_FAILED`) instead of a silent `false` when it keeps failing, logging both the transient-failure and genuine-not-found cases with full context (bakerId/category/path/attempt), and widening the menu-items route response schemas (`400`/`404`) that were stripping `message`/`errorCode` off every error response before it reached the client. Covered by `tests/unit/storage-verify.test.ts` and `tests/upload-verification-error-handling.test.ts`. The orphan-storage-object problem this KI describes is untouched by this fix and remains open below.

### Cause

`StorageProvider` (`storage-provider.interface.ts`) has no `deleteObject`/`listObjects` method at all — cleanup was never built for either flow.

### Temporary Fix

None — accepted as-is for now given current scale.

### Permanent Solution

Not yet decided — should be built as **one** general-purpose orphan-sweep mechanism (list objects under a given prefix, diff against the relevant DB column's referenced paths, delete anything unreferenced and older than a grace period to avoid racing a legitimate in-flight upload), parameterized by folder prefix/grace period, rather than two separate one-off patches for logo vs. menu-item photos. Needs `StorageProvider.listObjects`/`deleteObject` plus a scheduled job to run it.
