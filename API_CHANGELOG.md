# API_CHANGELOG.md — Kamai Backend OMS

> Documents all API contract changes in chronological order.

---

## [2026-07-27] — Auth Architecture Refactor (Email OTP Migration)

### ⚠️ Breaking Changes

#### `POST /api/auth/firebase/login` — REMOVED

This endpoint and all underlying Firebase services have been completely removed from the backend. Authenticating clients must use `POST /api/auth/send-email-otp` and `POST /api/auth/verify-email-otp`.

**Old contract:**
```json
// Request
{
  "idToken": "<firebase-id-token>"
}

// Response
{
  "success": true,
  "baker": { "id": "...", "phoneNumber": "...", "isNewBaker": false }
}
```

---

### ✅ New Endpoints

#### `POST /api/auth/send-email-otp`

Generates a 6-digit OTP and delivers it to the provided email address.

**Request:**
```json
{
  "email": "owner@mybakery.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Verification code sent successfully.",
  "expiresIn": 300
}
```

**Error Responses:**
| Status | Error Code | Condition |
|--------|-----------|-----------|
| `422` | `VALIDATION_ERROR` | Invalid email format |
| `429` | `OTP_RATE_LIMITED` | Resend request within 60-second cooldown |
| `429` | `OTP_HOURLY_LIMIT` | More than 5 send requests within 1 hour |
| `500` | `EMAIL_DELIVERY_FAILED` | Resend API failure |

---

#### `POST /api/auth/verify-email-otp`

Verifies the OTP, provisions the baker (if new), and issues session cookies.

**Request:**
```json
{
  "email": "owner@mybakery.com",
  "otp": "483271"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "bakerId": "<uuid>",
  "isNew": true
}
```

Sets the following HttpOnly cookies on success:
- `kamai_access_token` — JWT access token, 15 minutes
- `kamai_refresh_token` — JWT refresh token, 7 days

**Error Responses:**
| Status | Error Code | Condition |
|--------|-----------|-----------|
| `401` | `OTP_INVALID` | OTP does not match hash |
| `410` | `OTP_EXPIRED` | OTP has expired (> 5 minutes) |
| `410` | `OTP_ALREADY_USED` | OTP already verified (`verifiedAt` is set) |
| `429` | `OTP_MAX_ATTEMPTS` | 5 failed attempts on this record |
| `403` | `BAKER_SUSPENDED` | Baker account is suspended |
| `422` | `VALIDATION_ERROR` | Missing or invalid fields |

---

#### `POST /api/auth/logout` — Updated (Firebase-free)

Session-driven logout. No Firebase SignOut required.

**Request:** No body required. Session identified by `kamai_access_token` cookie.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

Clears:
- `kamai_access_token` cookie
- `kamai_refresh_token` cookie

Revokes `RefreshToken` record in PostgreSQL (sets `revokedAt`).

**Error Responses:**
| Status | Error Code | Condition |
|--------|-----------|-----------|
| `401` | `UNAUTHORIZED` | No valid access token cookie present |

---

## [2026-07-26] — Initial MVP API (Actions 1–24)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |
| `POST` | `/api/auth/firebase/login` | Firebase Phone Auth login (deprecated 2026-07-27) |
| `POST` | `/api/auth/logout` | Session logout |
| `GET` | `/api/dashboard/summary` | Dashboard operational metrics |
| `GET` | `/api/dashboard/calendar` | Calendar view of deliveries |
| `POST` | `/api/orders` | Create new order |
| `GET` | `/api/orders` | Paginated order history |
| `GET` | `/api/orders/:orderNumber` | Order details |
| `PUT` | `/api/orders/:orderNumber` | Edit order |
| `PATCH` | `/api/orders/:orderNumber/status` | Update order status |
| `PATCH` | `/api/orders/:orderNumber/payment` | Record balance payment |
| `DELETE` | `/api/orders/:orderNumber` | Cancel/archive order |
| `GET` | `/api/customers` | Customer directory |
| `GET` | `/api/customers/:customerId` | Customer CRM profile |
| `PUT` | `/api/customers/:customerId` | Update customer profile |
| `GET` | `/api/billing/status` | Subscription status |
| `POST` | `/api/billing/create-subscription` | Create Razorpay subscription |
| `POST` | `/api/webhooks/razorpay` | Razorpay event webhook |
| `PUT` | `/api/baker/upi-settings` | Update UPI payment settings |
| `GET` | `/api/baker/profile` | Baker profile |
| `POST` | `/api/uploads/signed-url` | Generate Supabase upload URL |
| `POST` | `/api/uploads/confirm` | Confirm asset upload |
| `POST` | `/api/notifications/whatsapp` | Generate WhatsApp deep link |
| `POST` | `/api/support/chat` | Generate support WhatsApp link |
| `POST` | `/api/investments` | Log material investment |
| `GET` | `/api/investments` | List investments/expenses |
| `DELETE` | `/api/investments/:entryId` | Delete investment record |
