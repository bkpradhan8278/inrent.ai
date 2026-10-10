/** Phone numbers for sign-in codes. Pure helpers shared by the sign-in form and the server. */

const E164 = /^\+[1-9]\d{6,14}$/;

/** Strips spacing and punctuation people type ("+91 98765-43210" → "+919876543210"). Does not guess a country code. */
export function normalizePhoneNumber(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  return digits;
}

export function isE164(phoneNumber: string): boolean {
  return E164.test(phoneNumber);
}

/**
 * Accepts only E.164 numbers, optionally restricted to a comma-separated list of calling codes ("91,1").
 * An empty list allows every country.
 */
export function isAllowedPhoneNumber(phoneNumber: string, allowedCountryCodes = ""): boolean {
  if (!isE164(phoneNumber)) return false;
  const codes = allowedCountryCodes
    .split(",")
    .map((c) => c.trim().replace(/^\+/, ""))
    .filter(Boolean);
  // Calling codes are prefix-free, so a prefix match identifies the country code exactly.
  return codes.length === 0 || codes.some((c) => phoneNumber.startsWith(`+${c}`));
}
