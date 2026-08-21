// Strips whitespace/formatting artifacts (spaces, dashes, a leading +91/91
// country code) from a raw phone string and validates the result against
// the same 10-digit Indian mobile format the API's own request schemas
// enforce (^[6-9]\d{9}$ - see orders.schemas.ts). Returns null for
// anything that doesn't clean up to a valid number, rather than throwing -
// callers decide whether a null phone is acceptable (e.g. a historical
// import row with no phone on file) or a hard validation failure.
//
// Built for the historical-order import script, which calls
// upsertCustomer directly and so bypasses the HTTP request-schema layer
// that would otherwise reject/reformat a malformed phone automatically.
// Should ideally run ahead of upsertCustomer's own lookup for any future
// direct-script caller too - inconsistent formatting of what's actually
// the same number (e.g. "74076 51722" vs "7407651722") defeats
// phone-based customer matching just as surely as a missing phone does,
// silently fragmenting one real customer into two.
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const digitsOnly = raw.replace(/\D/g, '');
  const withoutCountryCode =
    digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;

  return /^[6-9]\d{9}$/.test(withoutCountryCode) ? withoutCountryCode : null;
}
