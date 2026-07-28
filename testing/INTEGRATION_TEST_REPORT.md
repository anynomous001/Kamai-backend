# Integration Test Report

## Run History

### 2026-07-27 (Latest Run) — Auth Migration Tests

- **Passed**: 12 (3 existing + 9 new auth tests)
- **Failed**: 0
- **Skipped**: 0
- **Execution Time**: ~38 seconds (remote database latencies accounted for)
- **Modules Tested**: Auth (Email OTP), Orders, Customers, Database Transactions, Cascade Rules
- **Transactions Verified**: Yes (rollback and database state consistency verified)
- **Database Integrity**: Verified
- **External Services Mocked**: Resend API (email delivery)

### New Auth Tests Added (2026-07-27)

#### `tests/action01-send-email-otp.test.ts` — 4 Tests

| Test | Status | Description |
|------|--------|-------------|
| Happy path — OTP generated and stored | ✅ PASS | Validates 200 response, `EmailVerification` record in DB, hash stored (not raw OTP) |
| Invalid email format | ✅ PASS | Returns 422 for malformed email |
| 60-second cooldown enforcement | ✅ PASS | Second immediate request returns 429 with cooldown message |
| Hourly limit (max 5 requests) | ✅ PASS | 6th request within 1 hour returns 429 with hourly limit message |

#### `tests/action02-verify-email-otp.test.ts` — 6 Tests

| Test | Status | Description |
|------|--------|-------------|
| New baker — provision, seed materials, set cookies | ✅ PASS | `isNew: true`, Baker created, 8 materials seeded, HttpOnly cookies set |
| Existing baker — login without provisioning | ✅ PASS | `isNew: false`, returns correct `bakerId`, no new baker created |
| Wrong OTP — increment attempt count | ✅ PASS | Returns 401; `attempts` incremented in DB |
| Expired OTP | ✅ PASS | Returns 410 with `OTP_EXPIRED` error code |
| Max attempts (5) reached | ✅ PASS | Returns 429 |
| Already-verified OTP re-use prevention | ✅ PASS | Returns 410 for OTP with `verifiedAt` set |

#### `tests/action24-logout.test.ts` — 2 Tests

| Test | Status | Description |
|------|--------|-------------|
| Successful logout — revoke session, clear cookies | ✅ PASS | `revokedAt` set in DB, `kamai_access_token=;` and `kamai_refresh_token=;` in response headers |
| Resilient audit failure — logout still succeeds | ✅ PASS | Mocked audit DB failure; logout succeeds; session still revoked in DB |

---

### 2026-07-26 (Previous Run) — Orders & Customers

- **Passed**: 3
- **Failed**: 0
- **Skipped**: 0
- **Execution Time**: ~11.5 seconds (remote database latencies accounted for)
- **Modules Tested**: Orders, Customers, Database Transactions, Cascade Rules
- **Transactions Verified**: Yes (rollback and database state consistency verified)
- **Database Integrity**: Verified
- **External Services Mocked**: Firebase Auth (mocked verification token — now replaced)

## Test Details (`tests/integration/orders.test.ts`)
- **Order & Customer creation integrity**:
  - Tests ordering flow inside `ordersService.createOrder`.
  - Verifies that inserting an order automatically updates/upserts a customer CRM record under the same transaction context.
- **Paginated history query**:
  - Verifies database pagination math, limits, page limits, and status sorting works directly against the Supabase schema.
- **Order details lookup**:
  - Verifies retrieving complete order details along with associated customer properties by order number.
- **Teardown cascade integrity**:
  - Verifies that deleting the transient baker record in `afterAll` correctly cleans up all orders and customer records automatically via cascade constraint keys.
