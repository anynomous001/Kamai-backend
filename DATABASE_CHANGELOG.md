# DATABASE_CHANGELOG.md — Kamai Backend OMS

> Documents all Prisma schema changes and migrations in chronological order.

---

## [v0.6.0] — 2026-07-27 — Email OTP Auth Migration

### Changes

#### `Baker` model — Modified

```diff
model Baker {
  id          String   @id @default(uuid())

- firebaseUid String   @unique     // Was required; identity key for Firebase Auth
+ firebaseUid String?  @unique     // Now optional; retained for data compatibility

+ email       String?  @unique     // New primary identity field for Email OTP auth

+ @@index([email])                 // New index for email-based lookups
}
```

**Reason:** Firebase Phone Auth removed. Email is now the primary identity. `firebaseUid` retained as optional for backward compatibility with any existing bakers.

---

#### `EmailVerification` model — New

```prisma
model EmailVerification {
  id         String    @id @default(uuid())
  email      String
  otpHash    String                    // SHA-256 hash of 6-digit OTP; raw OTP never stored
  expiresAt  DateTime                  // 5 minutes from creation
  attempts   Int       @default(0)     // Incremented on each failed verification; max 5
  verifiedAt DateTime?                 // Stamped on successful verification; prevents re-use
  consumedAt DateTime?                 // Single-use timestamp
  lastSentAt DateTime?                 // Cooldown timestamp
  ipAddress  String?                   // Client IP address
  userAgent  String?                   // Client user agent
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([email, createdAt])          // For rate limit queries (count sends within 1 hour)
  @@index([email, expiresAt])          // For verification lookup with expiry check
}
```

**Purpose:** Stores hashed OTPs for the email verification flow. Replaces Redis (previously used in an alternate design). Enables rate limiting, expiry, and audit trail entirely in PostgreSQL.

---

### Migration Notes

- Migration name: `add_email_verification_and_baker_email`
- Applied to: Supabase (via `DIRECT_URL`)
- No data loss: Existing baker records retain their `firebaseUid`; `email` defaults to `null`
- The `email` field must be populated for any new bakers created via the Email OTP flow

---

## [v0.5.0] — 2026-07-26 — UPI Settings, Billing, Investments, Uploads

### `Baker` model — Extended

Added UPI payment settings fields:
- `upiId String?`
- `merchantName String?`
- `preferredApps String[] @default([])`
- `defaultCollectionMethod CollectionMethod @default(UPI)`
- `dynamicQrEnabled Boolean @default(true)`

Added billing and subscription tracking fields:
- `trialStartDate DateTime?`
- `trialEndDate DateTime?`
- `razorpaySubscriptionId String? @unique`
- `razorpayPlanId String?`
- `nextBillingDate DateTime?`
- `subscriptionPlan SubscriptionPlan?`

Added indexes:
- `@@index([trialEndDate])`
- `@@index([upiId])`
- `@@index([subscriptionStatus])`

---

### New Enums

- `CollectionMethod` — `UPI | QR`
- `SubscriptionStatus` — `TRIAL | PENDING | ACTIVE | PAUSED | CANCELLED | EXPIRED`
- `SubscriptionPlan` — `EARLY_ADOPTER`
- `WebhookProcessingStatus` — `SUCCESS | FAILED`

---

### New Models (v0.5.0)

#### `Investment`

```prisma
model Investment {
  id           String    @id @default(uuid())
  bakerId      String
  materialName String
  quantity     Decimal
  unit         String
  pricePerUnit Int
  totalCost    Int       // Pre-computed on write for read efficiency
  supplier     String?
  purchaseDate DateTime
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime? // Soft delete
  @@index([bakerId, purchaseDate])
  @@index([bakerId, materialName])
  @@index([purchaseDate])
}
```

#### `WebhookEvent`

```prisma
model WebhookEvent {
  id           String                  @id @default(uuid())
  eventId      String                  @unique
  eventType    String
  status       WebhookProcessingStatus
  processedAt  DateTime                @default(now())
  errorMessage String?
}
```

#### `BillingHistory`

```prisma
model BillingHistory {
  id             String   @id @default(uuid())
  bakerId        String
  subscriptionId String
  paymentId      String?
  eventType      String
  amount         Int
  currency       String
  status         String
  processedAt    DateTime
  createdAt      DateTime @default(now())
  @@index([bakerId])
  @@index([subscriptionId])
  @@index([processedAt])
}
```

---

## [v0.4.0] — 2026-07-26 — Finance & Payments

### New Models

#### `PaymentLedger`

```prisma
model PaymentLedger {
  id                   String          @id @default(uuid())
  bakerId              String
  orderId              String?
  orderNumber          String?
  amount               Int
  type                 TransactionType
  paymentMode          PaymentMode
  transactionReference String?
  transactionDate      DateTime        @default(now())
  createdAt            DateTime        @default(now())
  @@index([bakerId, transactionDate])
  @@index([orderId])
}
```

### New Enums

- `PaymentStatus` — `UNPAID | PARTIALLY_PAID | PAID`
- `TransactionType` — `CREDIT | DEBIT`
- `PaymentMode` — `CASH | UPI | CARD | BANK_TRANSFER`

### `Order` model — Extended

Added: `paymentStatus PaymentStatus @default(UNPAID)`

---

## [v0.3.0] — 2026-07-26 — Customers & CRM

### New Model: `Customer`

```prisma
model Customer {
  id                    String   @id @default(uuid())
  bakerId               String
  name                  String
  phone                 String
  address               String?
  notes                 String?
  preferredDeliveryTime String?
  totalOrders           Int      @default(0)
  lifetimeValue         Int      @default(0)
  lastOrderDate         DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  @@unique([bakerId, phone])
  @@index([bakerId])
  @@index([phone])
  @@index([bakerId, name])
}
```

---

## [v0.2.0] — 2026-07-26 — Orders

### New Model: `Order`

```prisma
model Order {
  id            String      @id @default(uuid())
  orderNumber   String      @unique
  bakerId       String
  customerId    String
  category      String
  weight        String
  flavour       String
  referencePhoto String?
  deliveryDate  DateTime
  status        OrderStatus @default(PENDING)
  totalPrice    Int
  advancePaid   Int
  balanceDue    Int
  paymentStatus PaymentStatus @default(UNPAID)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  deletedAt     DateTime?
  @@index([bakerId])
  @@index([deliveryDate])
  @@index([status])
  // ... compound indexes
}
```

### New Enum: `OrderStatus`

`PENDING | CONFIRMED | IN_PROGRESS | READY | DELIVERED | CANCELLED`

---

## [v0.1.0] — 2026-07-25 — Authentication Foundation

### New Models

#### `Baker`

```prisma
model Baker {
  id                 String             @id @default(uuid())
  firebaseUid        String             @unique  // Firebase UID (now optional as of v0.6.0)
  phoneNumber        String?
  subscriptionStatus SubscriptionStatus @default(TRIAL)
  businessName       String?
  ownerName          String?
  status             BakerStatus        @default(PENDING_ONBOARDING)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
}
```

#### `RefreshToken`

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique   // SHA-256 hash — raw token never stored
  bakerId   String
  expiresAt DateTime
  createdAt DateTime  @default(now())
  revokedAt DateTime?            // Non-null = revoked
  @@index([bakerId])
}
```

### New Enums

- `BakerStatus` — `PENDING_ONBOARDING | ACTIVE | SUSPENDED`
- `SubscriptionStatus` — `TRIAL | ACTIVE | EXPIRED | CANCELLED`

### Migration

- Applied: `20260725175131_add_baker_and_refresh_token`
