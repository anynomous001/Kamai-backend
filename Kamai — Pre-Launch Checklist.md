# Kamai — Pre-Launch Checklist

Items in this file are **hard gates**, not nice-to-haves. Nothing here gets
skipped by momentum or forgotten in a chat thread. Each item must be
explicitly checked off — with a note on who verified it and how — before
Kamai onboards its first real, paying, or non-test baker.

Do not delete completed items — mark them done with date + verifier so
there's a record this was actually checked, not just assumed.

---

## Security / Data Isolation

- [ ] **Wire real Row-Level Security enforcement.**
  Context: Prisma currently connects via the `postgres` role, which
  bypasses RLS entirely. Auth is a custom JWT, not Supabase Auth, so
  Supabase's default RLS/auth integration doesn't apply out of the box.
  Required before real launch:
  - Create a non-`BYPASSRLS` application DB role.
  - Add Prisma middleware that sets a per-request session variable
    (e.g. `SET LOCAL app.baker_id`) inside a transaction for every query.
  - Write RLS policies on every tenant-scoped table keyed to that session
    variable.
  - Verify with an actual cross-tenant test query that a baker cannot
    read another baker's rows — not just that the policy exists.
  - Owner: _______  Verified by: _______  Date: _______

- [ ] **Full query-path audit for `baker_id` scoping.**
  Compensating control while RLS enforcement above is pending. Every
  read/write across `orders`, `customers`, `investments`,
  `payment_events`, `inventory_items` must explicitly filter/scope by
  `baker_id` derived from verified JWT claims — no exceptions, no
  endpoints that trust a client-supplied tenant ID.
  - Owner: _______  Verified by: _______  Date: _______

- [ ] **All test/seed data is identifiable and removable.**
  Every seeded row lives under clearly-tagged test baker(s). A teardown
  script exists and has been run at least once successfully before any
  real baker account is created, so test data never gets mixed into
  real analytics, LTV, or dashboards.
  - Owner: _______  Verified by: _______  Date: _______

## Financial / Payments

- [ ] **No fabricated Razorpay IDs in any environment that could touch
  production.** Confirm test billing records use Razorpay's actual test
  mode, not hand-invented IDs that look real.
  - Owner: _______  Verified by: _______  Date: _______

- [ ] **`balance_due` computation is identical across API, seed scripts,
  and any reporting/dashboard queries.** One formula, one source of
  truth: `total_price - advance_paid`, always server-computed.
  - Owner: _______  Verified by: _______  Date: _______

## Data Model Consistency

- [ ] **Order status vocabulary reconciled.** Confirm which status set
  actually shipped — `Pending/Confirmed/In Progress/Ready/
  Delivered/Cancelled` per the domain-model doc, vs. any other set
  (`Draft/In Production/...`) that may exist elsewhere. A discrepancy
  here was flagged but never independently confirmed — resolve before
  it's baked into real customer-facing UI copy.
  - Owner: _______  Verified by: _______  Date: _______

## Code Quality / Tech Debt

- [ ] **Remaining lint errors are known debt, not silently ignored.**
  Fixed the broken import resolver config (858→302 problems) and ran
  `--fix` plus targeted fixes for `no-explicit-any`/unsafe-member-access
  in payment webhook + upload handling (302→190 problems, 138 errors).
  What's left is mostly `strict-boolean-expressions` nullable-string
  checks, `import/order` spacing, and missing return types — style/debt,
  not correctness bugs. Do a full cleanup pass before this scales beyond
  solo-founder testing.
  - Owner: _______  Verified by: _______  Date: _______

---

*Add new items here as they come up — the point of this file is that a
tradeoff made "for now" in a chat or a PR comment doesn't quietly become
permanent. If in doubt about whether something belongs here, add it; it's
cheaper to remove a stale item later than to lose a real one.*
