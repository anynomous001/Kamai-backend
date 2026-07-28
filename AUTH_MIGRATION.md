# AUTH_MIGRATION.md — Firebase → Email OTP (Resend)

> Documents the complete authentication architecture migration from Firebase Phone Authentication to a backend-owned Email OTP flow powered by Resend.

---

## Migration Overview

| Attribute | Before (Firebase Phone Auth) | After (Email OTP — Resend) |
|---|---|---|
| **Auth Provider** | Firebase Phone Authentication | Backend-owned (Kamai Auth Service) |
| **Identity Key** | `firebaseUid` (Firebase UID) | `email` (unique, indexed, normalized) |
| **OTP Delivery** | SMS via Firebase / Google | Email via Resend API |
| **OTP Lifecycle Owner** | Firebase / Google | Kamai backend (OtpService + VerificationRepository) |
| **OTP Storage** | Firebase-managed (not in our DB) | PostgreSQL (`EmailVerification` table) |
| **OTP Hashing** | N/A (Firebase-owned) | SHA-256 (via `crypto.createHash`) |
| **Rate Limiting** | Firebase-managed | Custom: 60s cooldown + 5/hr per email + 5 max attempts |
| **Tenant Provisioning** | On first Firebase login | On first `verify-email-otp` call (single DB transaction) |
| **Session Issuance** | On `POST /api/auth/firebase/login` | On `POST /api/auth/verify-email-otp` |
| **Logout** | Firebase SignOut + session revocation | Pure session revocation (`POST /api/auth/logout`) |
| **External Dependencies** | Firebase Admin SDK, Google Cloud Billing | Shared Email Service (Resend SDK) |
| **Redis Required** | Yes (OTP storage in old Redis design) | **No** — OTPs stored in PostgreSQL |

---

## Migration Decision Log

### Why Firebase Phone Auth Was Removed
- Firebase Phone Authentication introduced significant implementation complexity in the frontend.
- Google Cloud Billing became a blocker (billing account required for Phone Auth quotas).
- reCAPTCHA enforcement added friction to the login flow.
- Phone numbers are not a universal identifier for bakers; email is more reliable.

### Architecture Improvements Implemented
1. **Shared Email Provider Abstraction**: `email.service.ts` resides in `src/shared/email/` and is consumed by `OtpService`.
2. **Layered OTP Architecture**: `Auth Controller` → `Auth Service` → `OtpService` → `VerificationRepository` → `PostgreSQL`.
3. **100% Firebase Purge**: Removed all Firebase plugins, services, routes, schemas, environment keys, and test mocks.
4. **Complete OpenAPI/Swagger Coverage**: Fastify JSON schemas with request/response/error examples (401, 410, 422, 429).
5. **Transactional Tenant Provisioning**: Baker creation, default material seeding, and session issuance run inside a single `prisma.$transaction`.
6. **Backward-Compatible JWT Session**: Tokens preserve `sub`, `email`, `phoneNumber`, `sessionId` so Actions 3–24 continue operating seamlessly.

---

## New Authentication Architecture

```
Baker enters email
     ↓
POST /api/auth/send-email-otp
     ↓
OtpService checks rate limits (60s cooldown, 5/hr)
     ↓
OTP generated (6-digit), hashed (SHA-256), stored via VerificationRepository
     ↓
OTP emailed via Shared Email Service (Resend API)
     ↓
Baker enters OTP
     ↓
POST /api/auth/verify-email-otp
     ↓
OtpService verifies hash match, expiration (5m), max attempts (5)
     ↓
If new baker → TenantService provisions Baker + seeds default materials in 1 DB transaction
     ↓
Session issued (15m Access JWT + 7d Refresh JWT set as HttpOnly cookies)
     ↓
Dashboard
```

---

## New Database Models & Extensions

### `EmailVerification` Model

```prisma
model EmailVerification {
  id         String    @id @default(uuid())
  email      String
  otpHash    String                    // SHA-256 of raw OTP — raw never stored
  expiresAt  DateTime                  // 5 minutes from creation
  attempts   Int       @default(0)     // Incremented on wrong OTP; max 5
  verifiedAt DateTime?                 // Set on success; prevents re-use
  consumedAt DateTime?                 // Single-use timestamp
  lastSentAt DateTime?                 // Cooldown timestamp
  ipAddress  String?                   // Request origin IP
  userAgent  String?                   // Client user agent
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([email, createdAt])
  @@index([email, expiresAt])
}
```

---

## New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/send-email-otp` | Generate and email a 6-digit OTP (reused for resend) |
| `POST` | `/api/auth/verify-email-otp` | Verify OTP, provision tenant transactionally, issue JWT cookies |
| `POST` | `/api/auth/logout` | Revoke session in DB, clear HttpOnly cookies |

---

## Security & Compliance Properties

| Property | Status |
|----------|--------|
| Email normalization (`trim().toLowerCase()`) | ✅ Implemented |
| OTP hashed with SHA-256 before storage | ✅ Implemented |
| Raw OTP never persisted | ✅ Implemented |
| OTP expiry: 5 minutes | ✅ Implemented |
| Max OTP attempts: 5 per verification record | ✅ Implemented |
| Cooldown between resend requests: 60 seconds | ✅ Implemented |
| Hourly send limit: 5 per email | ✅ Implemented |
| Single-use OTP (`verifiedAt` / `consumedAt`) | ✅ Implemented |
| JWT access token: HttpOnly, SameSite=Strict, 15m | ✅ Implemented |
| JWT refresh token: HttpOnly, SameSite=Strict, 7d | ✅ Implemented |
| Session revocation on logout (PostgreSQL) | ✅ Implemented |
| Complete Firebase code removal | ✅ Implemented |

---

## Related ADRs

- **ADR-009** — Migration from Firebase Phone Auth to Backend-Owned Email OTP *(current)*
