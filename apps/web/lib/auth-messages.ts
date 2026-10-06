/** Email-code settings shared by lib/auth.ts and the sign-in form, plus the form's pure helpers. Safe to import from client code. */

export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_TTL_SECONDS = 600;
export const EMAIL_CODE_ALLOWED_ATTEMPTS = 3;
export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 30;

export interface AuthClientError {
  status?: number;
  code?: string;
  message?: string;
}

/** Keeps digits only and caps the length, so a pasted "123 456" or "123-456" fills the field. */
export function normalizeCodeInput(raw: string, length = EMAIL_CODE_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, length);
}

export function emailCodeSendError(error: AuthClientError): string {
  if (error.status === 429) return "Too many codes requested. Try again later.";
  if (error.code === "INVALID_EMAIL") return "Enter a valid email address.";
  return "Could not send the code. Try again.";
}

export function emailCodeVerifyError(error: AuthClientError): string {
  if (error.status === 429 || error.code === "TOO_MANY_ATTEMPTS") return "Too many attempts. Request a new code.";
  if (error.code === "OTP_EXPIRED") return "This code has expired. Request a new one.";
  if (error.code === "INVALID_OTP") return "That code isn't right. Check your email and try again.";
  // The sign-up hook refuses new accounts while SIGNUPS_ENABLED is off; Better Auth reports that as a server error.
  if (error.status !== undefined && error.status >= 500) return "Could not sign you in. If you are new here, sign-ups may be paused right now.";
  return "Could not sign you in. Try again.";
}

/** "Resend code" while ready, "Resend in 24s" during the cooldown. */
export function resendLabel(secondsLeft: number): string {
  return secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code";
}
