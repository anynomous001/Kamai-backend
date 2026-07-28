# ADR-009: Migration from Firebase Phone Auth to Backend-Owned Email OTP (Resend)

* **Status:** Accepted
* **Date:** 2026-07-27
* **Deciders:** Engineering & Product Leadership

---

## Context

Previously, the Kamai OMS Backend relied on Firebase Phone Authentication (`firebase.service.ts` + Firebase Admin SDK) for user identification and access control. 

During MVP development and testing, several architectural bottlenecks were identified with Firebase Phone Auth:
1. **Frontend Friction**: Firebase Web SDK required complex reCAPTCHA handling and SMS gateway configuration.
2. **Quota & Billing Blockers**: SMS verification quota restrictions and Google Cloud Billing requirements blocked automated testing and onboarding.
3. **Data Identifier Preference**: Email addresses are universal, unique identifiers suitable for multi-device login, whereas phone numbers vary in format and carrier reliability.
4. **Third-Party Dependency**: Verification logic was owned externally by Firebase, making local database audit trails and rate limiting fragmented.

---

## Decision

We have completely removed Firebase Authentication dependencies from the application and replaced it with a **100% backend-owned Email OTP Authentication System** powered by Resend.

### Key Architecture Components:
1. **Email OTP Delivery**: Verification codes sent via `Resend` API (`emailService`).
2. **OTP Hashing & Storage**: 6-digit numeric OTPs are hashed using SHA-256 (`crypto.createHash`) before storage in PostgreSQL (`EmailVerification` table). Raw OTPs are never stored.
3. **Strict Rate Limiting & Expiry**:
   - 60-second cooldown per email between OTP generation requests.
   - Maximum 5 OTP send requests per hour per email.
   - Maximum 5 incorrect verification attempts per OTP record.
   - OTP expiration window of 5 minutes (300 seconds).
4. **Email Normalization**: Incoming email strings are sanitized (`email.trim().toLowerCase()`) across schemas, services, and queries.
5. **Transactional Tenant Provisioning**: First-time login provisions the `Baker` tenant, seeds default inventory materials, and initializes payment settings inside a single PostgreSQL database transaction (`prisma.$transaction`).
6. **Session & Cookie Preservation**: Upon successful verification, signed access and refresh tokens are issued as HttpOnly `SameSite=Strict` cookies. The JWT payload (`sub`, `email`, `sessionId`) remains backward-compatible for Actions 3–24.

---

## Consequences

### Positive
* **Zero External Auth Vendor Lock-in**: Full ownership of OTP lifecycle, rate limiting, and verification records.
* **Simpler Infrastructure**: Removed Firebase Admin SDK plugin, Firebase environment keys, and Firebase SDK initialization overhead.
* **Database Consistency**: All auth audit events (`EMAIL_OTP_SENT`, `EMAIL_OTP_VERIFICATION_SUCCESS`, `USER_LOGGED_OUT`) and state live in PostgreSQL.
* **Seamless Developer Testing**: OTP tests run fast in Vitest with zero external network dependencies or SMS quota limits.

### Negative / Trade-offs
* **Transactional Email Rate Limits**: Governed by Resend API rate limits (generous free tier for MVP).
* **Breaking API Change**: Removed `POST /api/auth/firebase/login`. Authenticating clients must migrate to `POST /api/auth/send-email-otp` and `POST /api/auth/verify-email-otp`.
