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
