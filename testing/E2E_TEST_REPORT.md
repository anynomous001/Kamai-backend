# End-to-End Test Report

## Run History

### 2026-07-27 (Latest Run)
- **Environment**: test (Supabase connection)
- **Passed**: 31
- **Failed**: 0
- **Execution Time**: ~210 seconds (fully sequential runner)
- **Success Rate**: 100%
- **Executed Workflows**: Action 1 through Action 24
- **Auth Architecture**: Email OTP via Resend (Firebase removed)

## Detailed Action Execution Results

| Action | Workflow Description | Status | Verification Detail |
|---|---|---|---|
| **Action 1** | Send Email Verification OTP | **PASS** | OTP stored (hashed) in `EmailVerification` table; 200 response with `expiresIn: 300` |
| **Action 2** | Verify Email OTP & Tenant Provisioning | **PASS** | Baker provisioned; 8 materials seeded; HttpOnly JWT cookies set; `isNew: true` |
| **Action 3** | Summary Dashboard operational stats | **PASS** | Returns activeOrders count, todayDeliveries, and totalRevenue |
| **Action 4** | Create Order (Baker / Customer) | **PASS** | Creates order and automatically links new customer |
| **Action 5** | Paginated Order History query | **PASS** | Supports page limits, sort keys, and order options |
| **Action 6** | Detailed Order view | **PASS** | Retrieves full cake flavour, category, and date-time properties |
| **Action 7** | Update Order Status | **PASS** | Transition state lifecycle rules validation CONFIRMED |
| **Action 8** | Record Balance Payment | **PASS** | Automatically computes balanceDue reduction |
| **Action 9** | Edit Order | **PASS** | Handles cake flavour modification and customer replacement |
| **Action 10** | Cancel / Archive Order | **PASS** | Soft-deletes order via deletedAt flag |
| **Action 11** | Customer Upsertion | **PASS** | Updates LTV on consecutive orders |
| **Action 12** | Customer Directory search | **PASS** | Performs filter queries matching name/phone |
| **Action 13** | Customer Profile CRM history | **PASS** | Returns detailed profile details with order history |
| **Action 14** | Update Customer notes/address | **PASS** | Edits customer profile attributes correctly |
| **Action 15** | Calendar aggregation dashboard | **PASS** | Aggregates daily counts for YYYY-MM queries |
| **Action 16** | Investment Ledger creation/listing | **PASS** | Records materials cost and lists ledger entries |
| **Action 17** | Razorpay subscription initiation | **PASS** | Creates early adopter plan mock subscriptions |
| **Action 18** | Webhook Subscription Updates | **PASS** | Idempotently updates baker status to ACTIVE |
| **Action 19** | UPI Settings modification | **PASS** | Saves collection method details |
| **Action 20** | Upload signed URL generator | **PASS** | Mocks storage upload paths correctly |
| **Action 21** | WhatsApp reminder links | **PASS** | Prefills text links using template content |
| **Action 22** | Baker profile settings | **PASS** | Returns current baker details |
| **Action 23** | Support Deep link generation | **PASS** | Prefills message string using issue type |
| **Action 24** | Logout / Revoke Session | **PASS** | Revokes tokens in database and clears HTTP cookies |
