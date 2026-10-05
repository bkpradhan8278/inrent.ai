import { isAllowedPhoneNumber } from "@inrent/core";
import { PLACEHOLDER_EMAIL_DOMAIN } from "./email";

/**
 * SMS abstraction for phone-number sign-in codes. Providers: console (development), Twilio.
 * Phone sign-in is offered only while SMS_PROVIDER is set.
 */

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  async send(message: SmsMessage): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    console.warn(`\n[sms:console] to=${message.to}\n${message.body}\n`);
  }
}

class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    /** A sender number ("+1555…") or a Messaging Service SID ("MG…"). */
    private readonly from: string,
  ) {}
  async send(message: SmsMessage): Promise<void> {
    const form = new URLSearchParams({ To: message.to, Body: message.body });
    form.set(this.from.startsWith("MG") ? "MessagingServiceSid" : "From", this.from);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
  }
}

let provider: SmsProvider | null | undefined;

/** The configured SMS provider, or null when SMS_PROVIDER is unset (phone sign-in off). Throws on misconfiguration. */
export function getSmsProvider(): SmsProvider | null {
  if (provider !== undefined) return provider;
  switch (process.env.SMS_PROVIDER || undefined) {
    case undefined:
      provider = null;
      break;
    case "twilio": {
      const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
      if (!sid || !token || !from) throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are required for SMS_PROVIDER=twilio");
      provider = new TwilioSmsProvider(sid, token, from);
      break;
    }
    case "console":
      if (process.env.INRENT_ENV === "production") throw new Error("SMS_PROVIDER=console cannot be used in production");
      provider = new ConsoleSmsProvider();
      break;
    default:
      throw new Error(`Unknown SMS_PROVIDER "${process.env.SMS_PROVIDER}" (expected console or twilio)`);
  }
  return provider;
}

/** For tests. */
export function resetSmsProviderCache(): void {
  provider = undefined;
}

/** E.164 numbers in the countries listed in SMS_ALLOWED_COUNTRY_CODES — the main defence against SMS-pumping fraud. */
export function isAllowedSignInPhoneNumber(phoneNumber: string): boolean {
  return isAllowedPhoneNumber(phoneNumber, process.env.SMS_ALLOWED_COUNTRY_CODES);
}

/** Better Auth requires an email on every user; phone-only accounts get an undeliverable placeholder. */
export function placeholderEmailForPhone(phoneNumber: string): string {
  return `${phoneNumber.replace(/\D/g, "")}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Display name for a new phone-only account; avoids showing the full number to teammates. */
export function placeholderNameForPhone(phoneNumber: string): string {
  return `User ${phoneNumber.slice(-4)}`;
}

export async function sendSignInCodeSms(to: string, code: string): Promise<void> {
  const sms = getSmsProvider();
  if (!sms) throw new Error("Phone sign-in is not configured (set SMS_PROVIDER)");
  await sms.send({ to, body: `${code} is your INRENT sign-in code. It expires in 5 minutes. Don't share it with anyone.` });
}
