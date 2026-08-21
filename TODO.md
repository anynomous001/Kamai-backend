# TODO — Kamai Backend OMS

> Technical TODO list. Updated after each action.

---

## 🔴 High Priority

- [ ] **Configure environment variables** — Provide `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `RESEND_API_KEY` to start feature development
- [ ] **Supabase project setup** — SUPABASE_URL + service role key needed for Storage/Uploads module

---

## 🟡 Medium Priority

- [ ] **Razorpay integration** — Credentials needed before Payment action
- [ ] **Twilio/WhatsApp integration** — Credentials needed before Notifications action
- [ ] **Sentry setup** — DSN needed for production error monitoring
- [ ] **Supabase Storage bucket** — Create bucket before Uploads action
- [ ] **Unit tests for `OtpService`** — Test hash generation, rate limit logic, and expiry calculations in isolation

---

## 🟢 Low Priority

- [ ] **Swagger examples** — Add realistic example values to all OpenAPI schemas
- [ ] **Database seed script** — Create `prisma/seed.ts` with realistic dev data
- [ ] **Load testing** — Add k6 or autocannon load test scripts
- [ ] **Optimize Prisma queries** — Review N+1 risks after Order/Customer modules
- [ ] **Add request ID propagation** — Pass `X-Request-ID` through to downstream services
- [ ] **Audit logging** — Log all mutating operations to an audit table
- [ ] **API versioning** — Consider `/api/v1/` prefix strategy

---

## ✅ Done

- [X] Project scaffold (package.json, tsconfig, eslint, prettier)
- [X] Fastify application factory
- [X] Security plugins (Helmet, CORS, Cookie, Rate Limit)
- [X] Centralized error handling
- [X] Typed error class hierarchy (`GoneError` added 2026-07-27)
- [X] Pino structured logger
- [X] Prisma ORM setup
- [X] Zod environment validation
- [X] Swagger/OpenAPI documentation
- [X] Health check endpoint
- [X] Docker + Docker Compose
- [X] GitHub Actions CI pipeline
- [X] Vitest test framework
- [X] `DATABASE_URL` configured (Supabase pooler)
- [X] `DIRECT_URL` configured (Supabase direct)
- [X] `JWT_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET` generated
- [X] Prisma schema validated against live Supabase DB
- [X] **Authentication migrated** — Firebase removed; Email OTP via Resend (2026-07-27)
- [X] **`RESEND_API_KEY`** configured for email OTP delivery
- [X] **`EmailVerification` model** added to Prisma schema
- [X] **Audit logging** — Implemented across all auth flows (resilient non-blocking pattern)
- [X] **All 24 MVP actions** implemented and tested
