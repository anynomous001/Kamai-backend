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

- [x] Project scaffold (package.json, tsconfig, eslint, prettier)
- [x] Fastify application factory
- [x] Security plugins (Helmet, CORS, Cookie, Rate Limit)
- [x] Centralized error handling
- [x] Typed error class hierarchy (`GoneError` added 2026-07-27)
- [x] Pino structured logger
- [x] Prisma ORM setup
- [x] Zod environment validation
- [x] Swagger/OpenAPI documentation
- [x] Health check endpoint
- [x] Docker + Docker Compose
- [x] GitHub Actions CI pipeline
- [x] Vitest test framework
- [x] `DATABASE_URL` configured (Supabase pooler)
- [x] `DIRECT_URL` configured (Supabase direct)
- [x] `JWT_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET` generated
- [x] Prisma schema validated against live Supabase DB
- [x] **Authentication migrated** — Firebase removed; Email OTP via Resend (2026-07-27)
- [x] **`RESEND_API_KEY`** configured for email OTP delivery
- [x] **`EmailVerification` model** added to Prisma schema
- [x] **Audit logging** — Implemented across all auth flows (resilient non-blocking pattern)
- [x] **All 24 MVP actions** implemented and tested
