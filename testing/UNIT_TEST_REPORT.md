# Unit Test Report

## Run History

### 2026-07-26 (Latest Run)
- **Passed**: 17
- **Failed**: 0
- **Skipped**: 0
- **Coverage**: ~85% (Targeted Modules)
- **Execution Time**: 292ms
- **Modules Tested**: Pricing Engine, Status Transition Rules, WhatsApp Message Formatters, Baker Profile Mapper

## Test Suite Details

### 1. Pricing & Status Validation (`tests/unit/pricing.test.ts`)
- **Status Machine validation rules**:
  - Validates allowed transitions (e.g. `PENDING` -> `CONFIRMED` -> `IN_PROGRESS` -> `READY` -> `DELIVERED`).
  - Prevents transitions into immutable terminal states (`CANCELLED`, `DELIVERED`).
  - Throws correct conflict error on identical status transition.
  - Rejects illegal non-linear skips (e.g., `PENDING` to `DELIVERED` directly).
- **Pricing and Balance Due math**:
  - Validates balance calculations under `UNPAID`, `PARTIALLY_PAID`, and `PAID` statuses.

### 2. Helpers and Mappers (`tests/unit/helpers.test.ts`)
- **MessageFormatter Utility Class**:
  - Formats currency (paise to INR).
  - Formats dates to Indian locale.
  - Formats order summary message blocks.
  - Formats UPI collection payment prompts.
- **WhatsAppTemplateEngine**:
  - Generates pre-filled text templates for `ORDER_CONFIRMATION`, `PAYMENT_REMINDER`, `READY_FOR_PICKUP`, `RECEIPT`, and `THANK_YOU`.
- **BakerProfileMapper**:
  - Converts database models to clean customer-facing DTOs.
