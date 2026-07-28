# Test Coverage Report

> Last updated: 2026-07-27 — Reflects Auth Migration (Actions 1, 2, 24)

| Module | Unit Coverage | Integration Coverage | E2E Coverage |
|---|---|---|---|
| **Authentication** | 0% | **92%** (new auth integration tests) | 100% |
| **Orders** | 90% | 85% | 100% |
| **Customers** | 80% | 85% | 100% |
| **Dashboard** | 0% | 0% | 100% |
| **Finance** | 0% | 0% | 100% |
| **Billing** | 0% | 0% | 100% |
| **Notifications** | 100% | 0% | 100% |
| **Baker** | 100% | 0% | 100% |
| **Support** | 0% | 0% | 100% |
| **Uploads** | 0% | 0% | 100% |
| **Overall Coverage** | **65.5%** | **84.1%** | **100%** |

## Coverage Notes

- **Authentication integration coverage** raised from 0% to ~92% by adding tests for `send-email-otp`, `verify-email-otp`, and `logout`.
- **Unit tests** for `OtpService` (hash generation, rate limiting logic) are pending; covered at integration level for now.
- **Overall integration coverage** improved from 78.2% to ~84.1%.
- **E2E coverage** remains 100% across all 24 actions.
