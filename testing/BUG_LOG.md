# Bug Log

| Bug ID | Date | Severity | Module | Description | Root Cause | Fix | Status |
|---|---|---|---|---|---|---|---|
| **BUG-001** | 2026-07-26 | High | Auth | authenticatePlugin crashed with ReferenceError: env is not defined | Missing import statement for `env` config | Added `import { env } from '../config/env.js'` | **RESOLVED** |
| **BUG-002** | 2026-07-26 | Medium | Testing | Parallel Vitest threads crashed on DB unique key conflicts | Concurrent database writes to 'test-baker-id' | Appended sequential Vitest execution flags (`--sequence.concurrent=false --fileParallelism=false`) | **RESOLVED** |
| **BUG-003** | 2026-07-26 | Medium | Prisma | Prisma Order creation crashed with 'Argument baker is missing' | Using `bakerId` field instead of connecting `baker` relation in tests | Replaced with relation link `baker: { connect: { id: 'test-baker-id' } }` | **RESOLVED** |
| **BUG-004** | 2026-07-26 | Low | Auth | Firebase Login test failed on `business.phone` mapping | Expecting old business envelope property names | Updated E2E assertion to match `data.baker.phoneNumber` | **RESOLVED** |
| **BUG-005** | 2026-07-26 | Medium | Webhooks | Webhook test returned 404 | Empty `update` block in `prisma.baker.upsert` bypassed subscriptionId creation | Replaced upsert with baker delete followed by baker create | **RESOLVED** |
| **BUG-006** | 2026-07-26 | Medium | Billing | Webhook cleanup crashed with foreign key constraint violation on `BillingHistory` | BillingHistory table doesn't have Cascade delete enabled | Added explicit billing histories cleanup in `afterEach` hook | **RESOLVED** |
| **BUG-007** | 2026-07-26 | Low | Dashboard | Calendar view test returned 422 | Passed YYYY and MM as separate query fields instead of YYYY-MM | Adjusted query parameters to match Zod validation `month: '2026-08'` | **RESOLVED** |
| **BUG-008** | 2026-07-26 | High | Prisma | Prisma validation error: Argument `take`: Expected Int, provided String | Fastify query parser parses query parameters as strings under global `coerceTypes: false` configuration | Coerced query params in services to numbers and allowed string/integer type union in Ajv query schemas | **RESOLVED** |
| **BUG-009** | 2026-07-26 | Medium | Billing | Create mock subscription failed with 'Razorpay plan ID is not configured' | `RAZORPAY_EARLY_ADOPTER_PLAN_ID` was empty in `.env` | Configured `plan_early_adopter_1` directly in `.env` | **RESOLVED** |
| **BUG-010** | 2026-07-27 | Medium | Auth | `JwtPayload` type error — `firebaseUid` and `phoneNumber` required in `generateAccessToken` after auth migration | JWT payload types still had `firebaseUid` and `phoneNumber` as required fields; Email OTP flow does not supply them | Made `firebaseUid` and `phoneNumber` optional in `JwtPayload` and `generateAccessToken` signature | **RESOLVED** |
| **BUG-011** | 2026-07-27 | Low | Auth | `GoneError` (HTTP 410) missing from error class hierarchy | New OTP expired / re-use scenarios required 410 response but AppError only covered up to 409 | Added `GoneError` to `src/shared/errors/app-error.ts` | **RESOLVED** |

