/**
 * Typed builders for INRENT's transactional emails. Each returns the subject plus render options,
 * so the result goes straight to sendTemplateEmail. Dynamic values are escaped by renderEmail.
 */
import type { TemplateEmail } from "./email";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "6 Oct 2026, 14:05 UTC". Hand-rolled so the output does not depend on the runtime's ICU data. Unparseable input is returned as-is. */
export function formatDateTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function greeting(name: string): string {
  return `Hi ${name.trim() || "there"},`;
}

export function welcomeEmail(p: { name: string; dashboardUrl: string; docsUrl: string }): TemplateEmail {
  return {
    subject: "Welcome to INRENT",
    title: "Welcome to INRENT",
    preheader: "Your account is ready. Create an API key and send your first request in minutes.",
    intro: `${greeting(p.name)} your INRENT account is ready. One API key gives you every model behind a single, OpenAI-compatible gateway, with usage and billing in one place.`,
    body: ["Here is the quickest way to get going:"],
    steps: [
      { title: "Create an API key", body: "Open the dashboard, go to API keys, and create a key for your workspace." },
      { title: "Point your SDK at the gateway", body: "Set your OpenAI-compatible SDK's base URL to the INRENT gateway and use your new key. The docs have copy-paste examples." },
      { title: "Track usage and billing", body: "Watch requests, spend and credits in the dashboard as traffic starts to flow." },
    ],
    action: { label: "Open dashboard", url: p.dashboardUrl },
    links: [
      { label: "Docs", url: p.docsUrl },
      { label: "Dashboard", url: p.dashboardUrl },
    ],
  };
}

/** Takes only the key's display prefix: the full secret is shown once in the dashboard and must never be emailed. */
export function apiKeyCreatedEmail(p: {
  name: string;
  keyName: string;
  keyPrefix: string;
  workspaceName: string;
  createdAtIso: string;
  manageUrl: string;
  rotated?: boolean;
}): TemplateEmail {
  const verb = p.rotated ? "rotated" : "created";
  return {
    subject: p.rotated ? "An INRENT API key was rotated" : "A new INRENT API key was created",
    title: p.rotated ? "An API key was rotated" : "A new API key was created",
    preheader: `The key "${p.keyName}" was ${verb} in ${p.workspaceName}.`,
    intro: `${greeting(p.name)} the API key "${p.keyName}" was ${verb} in ${p.workspaceName}.`,
    details: [
      { label: "Key name", value: p.keyName },
      // Hard cap in case a caller hands over more than a display prefix.
      { label: "Key", value: `${p.keyPrefix.slice(0, 20)}…`, mono: true },
      { label: "Workspace", value: p.workspaceName },
      { label: p.rotated ? "Rotated" : "Created", value: formatDateTimeUtc(p.createdAtIso) },
    ],
    action: { label: "Not you? Revoke it now", url: p.manageUrl },
    note: "For your security, we never email the full key: it is shown only once, when it is created.\nIf you did not do this, revoke the key right away and review recent activity in your workspace.",
  };
}

export function paymentReceiptEmail(p: {
  name: string;
  amountFormatted: string;
  creditsFormatted?: string;
  method?: string;
  reference: string;
  paidAtIso: string;
  workspaceName: string;
  billingUrl: string;
}): TemplateEmail {
  return {
    subject: `Receipt for your ${p.amountFormatted} INRENT payment`,
    title: "Payment received",
    preheader: `${p.amountFormatted} paid for ${p.workspaceName}. Thank you.`,
    intro: `${greeting(p.name)} thank you. We received your payment for ${p.workspaceName}.`,
    details: [
      { label: "Amount paid", value: p.amountFormatted },
      ...(p.creditsFormatted ? [{ label: "Credits added", value: p.creditsFormatted }] : []),
      ...(p.method ? [{ label: "Payment method", value: p.method }] : []),
      { label: "Workspace", value: p.workspaceName },
      { label: "Date", value: formatDateTimeUtc(p.paidAtIso) },
      { label: "Reference", value: p.reference, mono: true },
    ],
    action: { label: "View billing", url: p.billingUrl },
    note: "Keep this email for your records. You can review every payment and balance under Billing in your dashboard.",
  };
}

export function paymentFailedEmail(p: {
  name: string;
  amountFormatted?: string;
  reason?: string;
  workspaceName: string;
  billingUrl: string;
}): TemplateEmail {
  return {
    subject: "Your INRENT payment didn't go through",
    title: "We couldn't process your payment",
    preheader: `Your payment for ${p.workspaceName} did not go through. It usually takes a minute to fix.`,
    intro: `${greeting(p.name)} we couldn't process ${p.amountFormatted ? `your ${p.amountFormatted} payment` : "your payment"} for ${p.workspaceName}.`,
    body: [
      ...(p.reason ? [`Reason from the payment provider: ${p.reason}`] : []),
      "This is usually a card or bank issue and is quick to fix. Check your payment details or try another method from Billing.",
    ],
    action: { label: "Review billing", url: p.billingUrl },
    note: "If you have already sorted this out, you can ignore this email.",
  };
}

const CODE_PURPOSES = {
  "sign-in": { subject: "Your INRENT sign-in code", title: "Your sign-in code", intro: "Use this code to sign in to INRENT." },
  "email-verification": { subject: "Verify your email for INRENT", title: "Verify your email", intro: "Use this code to verify your email address for INRENT." },
  "forget-password": { subject: "Your INRENT password reset code", title: "Reset your password", intro: "Use this code to reset your INRENT password." },
} as const;

export function signInCodeEmail(p: {
  code: string;
  expiresInMinutes: number;
  purpose: keyof typeof CODE_PURPOSES;
}): TemplateEmail {
  const copy = CODE_PURPOSES[p.purpose];
  const minutes = Math.max(1, Math.round(p.expiresInMinutes));
  const expiry = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return {
    subject: copy.subject,
    title: copy.title,
    preheader: `Your code is ${p.code}. It expires in ${expiry}.`,
    intro: `${copy.intro} It expires in ${expiry}.`,
    code: { value: p.code, label: "One-time code" },
    body: ["Never share this code with anyone. INRENT will never ask you for it."],
    note: "If you didn't request this code, you can safely ignore this email. Your account stays secure.",
  };
}
