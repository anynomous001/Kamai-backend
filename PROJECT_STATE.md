# PROJECT STATE — Kamai Backend OMS

> **Single source of truth for implementation progress.**
> Updated after every completed action.

---

## 📊 Overall Progress

| Metric | Value |
|--------|-------|
| **Total Actions** | 24 |
| **Completed Actions** | 24 |
| **Remaining Actions** | 0 |
| **Current Action** | MVP Complete — Auth migrated to Email OTP |
| **Auth Architecture** | Email OTP via Resend (Firebase removed 2026-07-27) |

---

## ✅ Completed Actions

- ✅ **Foundation Setup** — Project scaffold, Docker, CI/CD, tooling, shared infrastructure
- ✅ **Action 1 — Send Email OTP** — `POST /api/auth/send-email-otp`, SHA-256 OTP hashing, rate limiting (60s cooldown / 5 per hour), email delivery via Resend, `EmailVerification` table
- ✅ **Action 2 — Verify Email OTP & Tenant Provisioning** — `POST /api/auth/verify-email-otp`, OTP verification, single-use enforcement, tenant provisioning, default material seeding, JWT cookie issuance
- ✅ **Action 24 — Logout** — `POST /api/auth/logout`, per-device refresh session revocation, HttpOnly cookie clearance, `USER_LOGGED_OUT` audit logging
- ✅ **Action 3 — Summary Dashboard** — `GET /api/dashboard/summary`, `Order` model, JWT auth middleware
- ✅ **Action 4 — Create New Order** — `POST /api/orders`, `Customer` model, Prisma transactions, Caching/Audit stubs
- ✅ **Action 5 — Order History** — `GET /api/orders`, pagination, multi-sort, dynamic filters, compound indexes
- ✅ **Action 6 — View Order Details** — `GET /api/orders/:orderNumber`, unified detailed DTO retrieval
- ✅ **Action 7 — Update Order Status** — `PATCH /api/orders/:orderNumber/status`, state machine validation
- ✅ **Action 8 — Record Balance Payment** — `PATCH /api/orders/:orderNumber/payment`, finance ledger, `PaymentStatus`
- ✅ **Action 9 — Edit Order** — `PUT /api/orders/:orderNumber`, update order details and recalulate financials
- ✅ **Action 10 — Cancel / Archive Order** — `DELETE /api/orders/:orderNumber`, soft delete logic, terminal state validation
- ✅ **Action 11 — Customer Upsert** — Automatic CRM creation/update during order placement, LTV calculation
- ✅ **Action 12 — Customer Directory** — `GET /api/customers`, sort/search CRM list, outstanding balance calculation
- ✅ **Action 13 — Customer Profile** — `GET /api/customers/:customerId`, full profile with paginated order history
- ✅ **Action 14 — Update Customer Profile** — `PUT /api/customers/:customerId`, edit CRM profile, deduplicate phone numbers
- ✅ **Action 15 — Calendar View** — `GET /api/dashboard/calendar`, aggregates orders by delivery date for month/week views
- ✅ **Action 16 — Investment / Expense Ledger** — `POST`, `GET`, `DELETE` `/api/investments` for tracking raw material costs and net profit calculation
- ✅ **Action 17 — Billing & Subscription** — `GET /api/billing/status`, `POST /api/billing/create-subscription`, Razorpay Gateway integration
- ✅ **Action 18 — Razorpay Webhook Processing** — `POST /api/webhooks/razorpay`, idempotent subscription event processing and `BillingHistory` ledger
- ✅ **Action 19 — Manage UPI Settings** — `PUT /api/baker/upi-settings`, Baker profile extension with generic `PaymentSettingsService`
- ✅ **Action 20 — Upload Business Assets** — `POST /api/uploads/signed-url`, `POST /api/uploads/confirm`, Supabase Storage integration with short-lived signed URLs
- ✅ **Action 21 — WhatsApp Receipt & Payment Reminder Generation** — `POST /api/notifications/whatsapp`, deep link generation with separated `WhatsAppTemplateEngine`, `MessageFormatter`, and `DeepLinkGenerator`
- ✅ **Action 22 — Baker Profile & Settings** — `GET /api/baker/profile`, structured profile reading, mapped Settings DTO with dynamic storage URL resolution
- ✅ **Action 23 — Support & Help Desk** — `POST /api/support/chat`, WhatsApp support deep link generation with `SupportMessageFormatter`, version detection, and `SUPPORT_NOT_CONFIGURED` 503 error handling
- ✅ **Action 24 — Logout** — `POST /api/auth/logout`, per-device refresh session revocation, auth cookie clearance, and `USER_LOGGED_OUT` audit logging

## ⏳ Pending Actions

- None — All initial MVP actions (1–24) completed!

---

## 🧩 Modules Completed

| Module | Status | Notes |
|--------|--------|-------|
| Foundation / Scaffold | ✅ Done | package.json, tsconfig, Docker, plugins, error handling |
| Auth | ✅ Done | Email OTP via Resend (`send-email-otp`, `verify-email-otp`), baker provisioning, JWT cookies, refresh token, logout (`POST /api/auth/logout`) — **Firebase removed 2026-07-27** |
| Baker | ✅ Done | Baker Profile (`GET /api/baker/profile`), Manage UPI (`PUT /api/baker/upi-settings`) |
| Orders | ✅ Done | `Order` creation, history, details, status lifecycle API, payment status |
| Customers | ✅ Done | Customer Directory (`GET /api/customers`), Profile (`GET /api/customers/:customerId`), Profile Update (`PUT /api/customers/:customerId`) |
| Dashboard | ✅ Done | `GET /api/dashboard/summary` metrics API, `GET /api/dashboard/calendar` |
| Finance | ✅ Done | `PaymentLedger` recording, Investment / Expense Ledger (`/api/investments`) |
| Billing & Subscription | ✅ Done | `GET /api/billing/status`, `POST /api/billing/create-subscription`, Webhooks (`POST /api/webhooks/razorpay`) |
| Settings | ✅ Done | Manage UPI Settings (`PUT /api/baker/upi-settings`), Uploads (`POST /api/uploads/signed-url`), Baker Profile (`GET /api/baker/profile`) |
| Calendar | ✅ Done | Calendar View (`GET /api/dashboard/calendar`) |
| Investments | ✅ Done | Investment & Expense Ledger (`POST /api/investments`, `GET /api/investments`) |
| Support | ✅ Done | Support & Help Desk (`POST /api/support/chat`) |
| Notifications | ✅ Done | WhatsApp Receipt & Reminder Generation (`POST /api/notifications/whatsapp`) |
| Uploads | ✅ Done | Supabase Business Asset Uploads (`POST /api/uploads/signed-url`, `POST /api/uploads/confirm`) |

---

## 🗄️ Database Status

| Item | Value |
|------|-------|
| **ORM** | Prisma 5.x |
| **Provider** | PostgreSQL (Supabase) |
| **Schema Version** | v0.6.0 |
| **Latest Migration** | `add_email_verification_and_baker_email` (2026-07-27) |
| **Tables Created** | 9 (`Baker`, `RefreshToken`, `Order`, `Customer`, `PaymentLedger`, `Investment`, `WebhookEvent`, `BillingHistory`, `EmailVerification`) |

### Tables

| Table | Key Fields |
|-------|------------|
| `Baker` | `id` (PK), `firebaseUid` (optional, unique), `email` (unique, indexed), `phoneNumber` (indexed), `status`, `subscriptionStatus` |
| `RefreshToken` | `id` (PK = sessionId), `tokenHash` (unique, SHA-256), `bakerId` (FK), `expiresAt`, `revokedAt` |
| `Customer` | `id` (PK), `bakerId` (FK), `phone` (unique with bakerId), `name` |
| `Order` | `id` (PK), `orderNumber` (unique), `bakerId` (FK), `customerId` (FK), `deliveryDate`, `status`, `totalPrice`, `advancePaid`, `balanceDue`, `deletedAt` |
| `PaymentLedger` | `id` (PK), `bakerId` (FK), `orderId` (FK nullable), `amount`, `type`, `paymentMode` |
| `Investment` | `id` (PK), `bakerId` (FK), `materialName`, `quantity`, `pricePerUnit`, `totalCost`, `deletedAt` |
| `WebhookEvent` | `id` (PK), `eventId` (unique — idempotency key), `eventType`, `status` |
| `BillingHistory` | `id` (PK), `bakerId` (FK), `subscriptionId`, `eventType`, `amount` |
| `EmailVerification` | `id` (PK), `email` (indexed), `otpHash` (SHA-256), `expiresAt`, `attempts`, `verifiedAt` |

---

## 🔐 Environment Variables

| Variable | Status | Required By |
|----------|--------|-------------|
| `DATABASE_URL` | ✅ Configured | Supabase pooler (port 6543, pgbouncer=true) |
| `DIRECT_URL` | ✅ Configured | Supabase direct (port 5432, for migrations) |
| `SUPABASE_URL` | ❌ Pending | Uploads, Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Pending | Uploads, Storage |
| `SUPABASE_ANON_KEY` | ❌ Pending | Optional |
| `SUPABASE_STORAGE_BUCKET` | ❌ Pending | Uploads |
| `JWT_SECRET` | ✅ Configured | Auth (80-char hex) |
| `JWT_REFRESH_SECRET` | ✅ Configured | Auth (80-char hex) |
| `JWT_ACCESS_EXPIRES_IN` | ✅ Configured | Auth (default: 15m) |
| `JWT_REFRESH_EXPIRES_IN` | ✅ Configured | Auth (default: 7d) |
| `COOKIE_SECRET` | ✅ Configured | Auth (80-char hex) |
| `REDIS_URL` | ⚠️ Optional | No longer required for OTP; retained for future use |
| `RAZORPAY_KEY_ID` | ❌ Pending | Payments |
| `RAZORPAY_SECRET` | ❌ Pending | Payments |
| `RAZORPAY_WEBHOOK_SECRET` | ❌ Pending | Payments |
| `FIREBASE_PROJECT_ID` | 🚫 Removed | Firebase Auth removed 2026-07-27 |
| `FIREBASE_CLIENT_EMAIL` | 🚫 Removed | Firebase Auth removed 2026-07-27 |
| `FIREBASE_PRIVATE_KEY` | 🚫 Removed | Firebase Auth removed 2026-07-27 |
| `TWILIO_ACCOUNT_SID` | ❌ Pending | WhatsApp Notifications |
| `TWILIO_AUTH_TOKEN` | ❌ Pending | WhatsApp Notifications |
| `TWILIO_WHATSAPP_FROM` | ❌ Pending | WhatsApp Notifications |
| `RESEND_API_KEY` | ✅ Required | Email OTP delivery (auth) |
| `SENTRY_DSN` | ❌ Pending | Monitoring |
| `CORS_ORIGIN` | ❌ Pending | Foundation |
| `PORT` | ❌ Pending | Foundation (default: 3001) |
| `NODE_ENV` | ❌ Pending | Foundation |
| `LOG_LEVEL` | ❌ Pending | Foundation (default: info) |

---

## 🔌 Third-Party Integrations

| Service | Status | Notes |
|---------|--------|-------|
| Supabase (Database) | ✅ Configured | Connected & schema validated |
| Supabase (Storage) | ⏳ Pending | Bucket name not yet provided |
| Redis | ⚠️ Optional | No longer required for OTP; Docker config retained for future use |
| BullMQ | ⏳ Pending | Redis retained in compose; BullMQ not wired yet |
| Razorpay | ⏳ Pending | Keys not yet provided |
| Firebase Auth | 🚫 Removed | Removed 2026-07-27 — migrated to Email OTP via Resend |
| Twilio / WhatsApp | ⏳ Pending | SID/token not yet provided (notifications only) |
| Resend (Email) | ✅ Integrated | Used for OTP delivery — `POST /api/auth/send-email-otp` |
| Sentry | ⏳ Pending | DSN not yet provided |

---

## 📡 API Progress

| Method | Endpoint | Module | Status |
|--------|----------|--------|---------|
| GET | `/health` | System | ✅ Done |
| GET | `/docs` | Swagger | ✅ Done |
| POST | `/api/auth/send-email-otp` | Auth | ✅ Done |
| POST | `/api/auth/verify-email-otp` | Auth | ✅ Done |
| POST | `/api/auth/logout` | Auth | ✅ Done |
| POST | `/api/auth/firebase/login` | Auth | 🚫 Deprecated (2026-07-27) |
| GET | `/api/dashboard/summary` | Dashboard | ✅ Done |
| GET | `/api/dashboard/calendar` | Dashboard | ✅ Done |
| POST | `/api/orders` | Orders | ✅ Done |
| GET | `/api/orders` | Orders | ✅ Done |
| GET | `/api/orders/:orderNumber` | Orders | ✅ Done |
| PUT | `/api/orders/:orderNumber` | Orders | ✅ Done |
| PATCH | `/api/orders/:orderNumber/status` | Orders | ✅ Done |
| PATCH | `/api/orders/:orderNumber/payment` | Orders (Finance) | ✅ Done |
| DELETE | `/api/orders/:orderNumber` | Orders | ✅ Done |
| GET | `/api/customers` | Customers | ✅ Done |
| GET | `/api/customers/:customerId` | Customers | ✅ Done |
| PUT | `/api/customers/:customerId` | Customers | ✅ Done |
| GET | `/api/billing/status` | Billing | ✅ Done |
| POST | `/api/billing/create-subscription` | Billing | ✅ Done |
| POST | `/api/webhooks/razorpay` | Webhooks | ✅ Done |
| PUT | `/api/baker/upi-settings` | Baker | ✅ Done |
| GET | `/api/baker/profile` | Baker | ✅ Done |
| POST | `/api/uploads/signed-url` | Uploads | ✅ Done |
| POST | `/api/uploads/confirm` | Uploads | ✅ Done |
| POST | `/api/notifications/whatsapp` | Notifications | ✅ Done |
| POST | `/api/support/chat` | Support | ✅ Done |
| POST | `/api/investments` | Finance | ✅ Done |
| GET | `/api/investments` | Finance | ✅ Done |
| DELETE | `/api/investments/:entryId` | Finance | ✅ Done |

---

## 🔮 Pending Database Work

- All models pending sequence diagrams
- Migration strategy: per-action migrations with descriptive names

---

## 🛡️ Security Checklist

| Feature | Status |
|---------|--------|
| Helmet (HTTP headers) | ✅ Implemented |
| CORS | ✅ Implemented |
| Rate Limiting | ✅ Implemented |
| Cookie Security (HttpOnly, Secure) | ✅ Implemented |
| Input Validation (Zod) | ✅ Framework ready |
| Centralized Error Handling | ✅ Implemented |
| Logging (Pino + redaction) | ✅ Implemented |
| Email OTP Generation & Hashing (SHA-256) | ✅ Implemented (Action 1) |
| OTP Rate Limiting (60s cooldown / 5 per hour) | ✅ Implemented (Action 1) |
| Single-use OTP Enforcement | ✅ Implemented (Action 2) |
| JWT Issuance (Kamai Access Token) | ✅ Implemented (Action 2) |
| Tenant Provisioning on First Login | ✅ Implemented (Action 2) |
| Session Revocation on Logout (PostgreSQL) | ✅ Implemented (Action 24) |
| Resilient Audit Logging | ✅ Implemented (non-blocking on failure) |
| Refresh Token Rotation | ⏳ Future action |
| CSRF Protection | ⏳ Future action |
| Sentry Monitoring | ⏳ Pending DSN |

---

## 🧪 Testing Progress

| Type | Status | Coverage |
|------|--------|----------|
| Unit Tests | ✅ 17 passed | ~85% (targeted modules) |
| Integration Tests | ✅ 3 passed | 85% (Orders, Customers) |
| E2E / API Tests | ✅ 31 passed (Actions 1–24) | 100% |
| Auth Integration Tests | ✅ New — Actions 1, 2, 24 | send-email-otp, verify-email-otp, logout |
| Coverage Threshold | Configured (70%) | ✅ Met |

---

## 🚀 Deployment Status

| Component | Status |
|-----------|--------|
| Dockerfile (multi-stage) | ✅ Done |
| Docker Compose (API + Redis) | ✅ Done |
| GitHub Actions CI | ✅ Done |
| Production Environment | ⏳ Pending |

---

## 🔄 Recent Changes (2026-07-27)

| Change | Description |
|--------|-------------|
| Auth Migration | Removed Firebase Phone Auth; implemented Email OTP via Resend |
| New: `EmailVerification` table | Stores hashed OTPs with expiry, attempts, and single-use flag |
| Baker model updated | `firebaseUid` now optional; `email` added as unique indexed field |
| New endpoint | `POST /api/auth/send-email-otp` |
| New endpoint | `POST /api/auth/verify-email-otp` |
| Updated endpoint | `POST /api/auth/logout` (Firebase-free, pure session-driven) |
| New service | `OtpService` — generation, hashing, rate limiting, verification |
| New service | `TenantService` — baker provisioning and default material seeding |
| Env var removed | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Env var added | `RESEND_API_KEY` (required for auth) |
