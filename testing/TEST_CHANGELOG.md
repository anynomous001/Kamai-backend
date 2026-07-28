# Test Changelog

## [1.1.0] - 2026-07-27 — Auth Migration Tests
- Added `tests/action01-send-email-otp.test.ts` — 4 integration tests for Email OTP sending (happy path, validation, 60s cooldown, hourly rate limit).
- Added `tests/action02-verify-email-otp.test.ts` — 6 integration tests for OTP verification and tenant provisioning (new baker, existing baker, wrong OTP, expired, max attempts, re-use prevention).
- Added `tests/action24-logout.test.ts` — 2 integration tests for session-driven logout (happy path, resilient audit failure handling).
- Replaced `tests/action01-login.test.ts` (Firebase) and `tests/action02-session.test.ts` (Firebase session bypass) with new Email OTP equivalents.
- Mocked Resend API in tests using `vi.spyOn` to prevent actual email delivery during test runs.
- Added `GoneError` (HTTP 410) test assertion for expired and already-verified OTP scenarios.
- Verified `auditService.logEvent` failure does not block logout (resilient audit pattern confirmed via `mockRejectedValueOnce`).

## [1.0.0] - 2026-07-26
- Created unit tests for the status machine logic, pricing mathematics, message template engines, and profile mappers under `tests/unit/`.
- Created module integration tests for orders history and customer updates under `tests/integration/`.
- Created E2E regression tests for all 24 business actions (`tests/action01-login.test.ts` through `tests/action24-logout.test.ts`) using Fastify's native `app.inject()` helper.
- Added bypass authentication credentials directly to `.env` to prevent ES modules hoisting race conditions in tests.
- Modified Vitest configuration `vitest.config.ts` to support sequential execution (`--sequence.concurrent=false --fileParallelism=false`) to eliminate database write contentions on shared resources.
- Added test execution scripts to `package.json` for running specific test layers sequentially.
- Coerced page and limit query string parameters in orders and customers service modules to prevent Prisma input type string validation errors.
- Adjusted query validation schemas to support union type `['integer', 'string']` to align with global `coerceTypes: false` query parser behaviors.
- Configured a mock Razorpay plan ID in `.env` to resolve early adopter plan instantiation check errors.

