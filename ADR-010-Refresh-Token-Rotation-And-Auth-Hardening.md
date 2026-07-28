# ADR-010: Refresh Token Rotation, Reuse Detection, Persistent Audit Logging, and Completion of Firebase Removal

* **Status:** Accepted
* **Date:** 2026-07-28
* **Deciders:** Engineering & Product Leadership

---

## Context

A security review of the Email OTP authentication system introduced in [ADR-009](./ADR-009-Authentication-Migration.md) surfaced four gaps before the backend's first deployment:

1. **No refresh flow.** A `POST /auth/refresh` endpoint did not exist. Access tokens (15m expiry) had no way to be renewed without forcing the baker to re-verify OTP, and there was no server-side mechanism to detect a stolen refresh token being replayed by an attacker.
2. **Incomplete Firebase removal.** ADR-009 stated Firebase had been "completely removed," but the `Baker.firebaseUid` column, `FIREBASE_*` environment variables, the `firebase-admin` dependency, and stale Firebase error codes (`FIREBASE_TOKEN_INVALID`, `FIREBASE_TOKEN_EXPIRED`) were still present in the codebase.
3. **No-op audit logging.** `NoOpAuditService` was wired as the production audit implementation — every `logEvent()` call was silently discarded, so there was no durable record of OTP sends, verifications, logins, logouts, or (once added) refresh/reuse events.
4. **Non-constant-time OTP comparison.** `verifyOtpHash` compared the SHA-256 hash of the submitted OTP against the stored hash using `===`, which is vulnerable to timing side-channel attacks against the hash comparison.

The backend is not yet deployed to any environment, so this work carried no migration/rollout risk — it was applied directly against `main`.

---

## Decision

### 1. Refresh Token Rotation + Reuse Detection

`POST /auth/refresh` reads the `kamai_refresh_token` HttpOnly cookie and calls `authService.refreshSession()`:

- The raw refresh token is JWT-verified (`jwtService.verifyRefreshToken`), then SHA-256 hashed and looked up in the `RefreshToken` table by `tokenHash` (the raw token is never stored).
- **Valid & unused** → the old `RefreshToken` row is marked `revokedAt`, a brand new access/refresh token pair is issued via the existing `createSession()` path, both cookies are re-set, and a `REFRESH_TOKEN_ROTATED` audit event is recorded. This is one-time-use ("rotate on every refresh"), the industry-standard pattern used by Auth0, AWS Cognito, and Okta.
- **Reused (row already revoked or missing)** → treated as a stolen/replayed token. `revokeAllSessions(bakerId)` marks every active `RefreshToken` for that baker as revoked (killing all sessions, not just the suspicious one), a `REFRESH_TOKEN_REUSE_DETECTED` audit event is recorded with the offending token's metadata, and the request receives `401 REFRESH_TOKEN_INVALID`.
- **Naturally expired** (JWT `exp` elapsed) → `401 REFRESH_TOKEN_EXPIRED` is returned with **no** mass revocation, since this is normal token lifecycle, not an attack signal.
- **Missing cookie** → `401 REFRESH_TOKEN_INVALID` before any database lookup.

A shared `setSessionCookies(reply, tokens)` helper in `auth.controller.ts` deduplicates cookie-setting logic between `verifyEmailOtp` (login) and the new `refresh` handler.

### 2. Completion of Firebase Removal

- Dropped `Baker.firebaseUid` (column + unique index) via migration `20260728180000_remove_firebase_uid`.
- Removed `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` from `src/config/env.ts`'s Zod schema.
- Removed the `firebase-admin` dependency from `package.json` and the corresponding pnpm `allowBuilds` entry.
- Removed `FIREBASE_TOKEN_INVALID` / `FIREBASE_TOKEN_EXPIRED` from the `ErrorCode` union in `src/shared/errors/app-error.ts`.
- Fixed a stale docstring in `jwt.service.ts` that still referenced `firebaseUid` in the JWT payload shape.
- Historical documents (`AUTH_MIGRATION.md`, `CHANGELOG.md`, ADR-009 itself) are intentionally left as-is as a historical record of the original (incomplete) migration claim.

### 3. Persistent Audit Logging

`src/shared/audit/index.ts` now exports:
- `AuditService` — the interface (unchanged contract: `logEvent(action, entityId, metadata?)`).
- `PrismaAuditService` — the new production default. Persists every event to a new `AuditLog` table (`id`, `action`, `entityId`, `metadata Json?`, `createdAt`, indexed on `(action, createdAt)` and `(entityId, createdAt)` for efficient querying). Internally catches and logs its own errors (`logger.error`) rather than throwing, because most call sites invoke `logEvent()` without wrapping it in `try/catch` — an audit-logging failure must never fail the primary request.
- `NoOpAuditService` — retained for isolated unit tests that don't need a database.

### 4. Timing-Safe OTP Comparison

`otp.service.ts`'s `verifyOtpHash` now uses `crypto.timingSafeEqual` on the two SHA-256 hash buffers (with an explicit length-equality guard first, since `timingSafeEqual` throws on mismatched buffer lengths rather than returning `false`), eliminating the timing side-channel present in the previous `===` string comparison.

---

## Consequences

### Positive
* **Stolen-refresh-token blast radius is bounded and detected.** An attacker who replays a rotated-out refresh token immediately invalidates every session for that baker and leaves an audit trail, rather than silently succeeding.
* **Firebase is now fully absent** from schema, config, dependencies, and error taxonomy — no partial-migration surface area remains.
* **Every security-relevant event is durably queryable** in Postgres instead of disappearing into a no-op.
* **OTP verification is no longer vulnerable to hash-comparison timing analysis.**

### Negative / Trade-offs
* **One extra table (`AuditLog`) and two new indexes** to maintain and eventually archive/prune as volume grows — no retention policy has been defined yet and should be revisited before high-volume production traffic.
* **Refresh endpoint adds one additional database round-trip per token refresh** (lookup + revoke + create), which is the accepted cost of rotation-based detection versus a stateless (non-revocable) refresh scheme.
* **Mass session revocation on reuse detection is intentionally aggressive** — a legitimate baker who is logged in on multiple devices will be logged out everywhere if any single refresh token is replayed (e.g., due to a client-side bug retrying a request). This is the standard trade-off industry implementations (Auth0, Cognito) make in favor of security over convenience.

---

## Out of Scope / Deferred (found during this work, not fixed)

* `src/tests/setup.ts` — unused `beforeEach` import (`TS6133`), pre-existing and unrelated to auth.
* Schema/migration drift: `Baker.isVerified` and the `BillingHistory` table exist in `schema.prisma` but have no corresponding migration file. Pre-existing since the initial commit; does not affect the auth changes in this ADR.
* A pnpm workspace configuration bug (missing `packages` key in `pnpm-workspace.yaml`, required by pnpm ≥ 9.x) was blocking every `pnpm` command from the repository root and was fixed as a prerequisite to running any tests in this work.
* A subset of e2e tests (Actions 2–3, 5–17, 19–23) fail with `401` even though `DEV_BYPASS_AUTH` is stubbed to `'true'` in `src/tests/setup.ts`. Likely cause: `env.ts` parses and caches `process.env` as a module-level singleton at first import, and ES module static imports (e.g. `setup.ts`'s `import { prisma } from '../shared/database/prisma.js'` on line 25, which transitively imports `env.ts`) are evaluated before any of that same file's own top-level statements — including the `vi.stubEnv()` calls on lines 5–23 that precede it lexically. By the time `env.DEV_BYPASS_AUTH` is read, it may already be cached as `false`. **Confirmed pre-existing and unrelated to this ADR's changes** via `git stash` — the identical `401` failure reproduces on the untouched pre-session `main` commit with the original Firebase-based code and env schema.
