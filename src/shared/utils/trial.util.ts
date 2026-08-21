// Shared by billing.service.ts's getBillingStatus() and
// baker-profile.mapper.ts's toProfileResponse() - both computed this
// independently before (identical logic, duplicated), which meant a
// future edit to one could silently desync it from the other. trialEndsAt
// is a fixed timestamp once set, so flooring at 0 here is what makes this
// reach 0 (and stay 0) for a churned paying customer too, not just during
// an actual trial - see write-access.ts's isReadOnly, which relies on
// exactly that property.
export function getTrialDaysRemaining(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) {
    return 0;
  }
  const diffTime = trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}
