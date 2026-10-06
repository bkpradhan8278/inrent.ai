/**
 * Renders every email template with sample data into .preview/emails/ (gitignored) so a human
 * can open the files in a browser. No emails are sent.
 *
 *   pnpm exec tsx scripts/preview-emails.ts
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderEmail, escapeHtml, type TemplateEmail } from "../packages/services/src/email";
import {
  apiKeyCreatedEmail,
  paymentFailedEmail,
  paymentReceiptEmail,
  signInCodeEmail,
  welcomeEmail,
} from "../packages/services/src/emailTemplates";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", ".preview", "emails");
const now = new Date().toISOString();

const samples: Record<string, TemplateEmail> = {
  "welcome": welcomeEmail({ name: "Asha Patel", dashboardUrl: "https://app.inrent.ai", docsUrl: "https://docs.inrent.ai" }),
  "api-key-created": apiKeyCreatedEmail({ name: "Asha Patel", keyName: "Production backend", keyPrefix: "sk-inrent-live-ab12", workspaceName: "Acme Labs", createdAtIso: now, manageUrl: "https://app.inrent.ai/keys" }),
  "api-key-rotated": apiKeyCreatedEmail({ name: "Asha Patel", keyName: "Production backend", keyPrefix: "sk-inrent-live-cd34", workspaceName: "Acme Labs", createdAtIso: now, manageUrl: "https://app.inrent.ai/keys", rotated: true }),
  "payment-receipt": paymentReceiptEmail({ name: "Asha Patel", amountFormatted: "$25.00", creditsFormatted: "25,000 credits", method: "Visa ending 4242", reference: "pi_3Q9xSampleReference", paidAtIso: now, workspaceName: "Acme Labs", billingUrl: "https://app.inrent.ai/billing" }),
  "payment-failed": paymentFailedEmail({ name: "Asha Patel", amountFormatted: "$25.00", reason: "Your card was declined.", workspaceName: "Acme Labs", billingUrl: "https://app.inrent.ai/billing" }),
  "code-sign-in": signInCodeEmail({ code: "482913", expiresInMinutes: 5, purpose: "sign-in" }),
  "code-email-verification": signInCodeEmail({ code: "073156", expiresInMinutes: 10, purpose: "email-verification" }),
  "code-forget-password": signInCodeEmail({ code: "915204", expiresInMinutes: 10, purpose: "forget-password" }),
  // Legacy callers, to confirm they still look right in the new layout.
  "legacy-magic-link": {
    subject: "Your INRENT sign-in link",
    title: "Sign in to INRENT",
    intro: "Use the button below to sign in. The link expires in 10 minutes and can be used once.",
    action: { label: "Sign in", url: "https://auth.inrent.ai/magic?token=sample" },
  },
  "legacy-reset-password": {
    subject: "Reset your INRENT password",
    title: "Reset your password",
    intro: "Someone asked to reset the password for your INRENT account. If this was you, use the button below. The link expires in one hour.",
    action: { label: "Reset password", url: "https://auth.inrent.ai/reset-password?token=sample" },
    footer: "If you didn't request this, you can ignore this email. Your password won't change.",
  },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const rows: string[] = [];
for (const [name, template] of Object.entries(samples)) {
  const { html, text } = renderEmail(template);
  writeFileSync(join(outDir, `${name}.html`), html);
  writeFileSync(join(outDir, `${name}.txt`), `Subject: ${template.subject}\n\n${text}\n`);
  rows.push(`<li><a href="${name}.html">${escapeHtml(name)}</a> &middot; <a href="${name}.txt">text</a> &mdash; ${escapeHtml(template.subject)}</li>`);
}
writeFileSync(join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:system-ui;margin:40px"><h1>Email previews</h1><ul>${rows.join("")}</ul>`);

console.log(`Wrote ${rows.length} previews to ${outDir}`);
