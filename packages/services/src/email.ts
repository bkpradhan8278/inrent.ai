/**
 * Transactional email abstraction. Providers: console (development), Resend, SendGrid.
 * AWS SES can be added by implementing EmailProvider (SigV4-signed SendEmail).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    console.warn(`\n[email:console] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: this.from },
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`SendGrid responded ${res.status}`);
  }
}

let provider: EmailProvider | null = null;

/** Domain of the stand-in address given to phone-only accounts. `.invalid` never resolves (RFC 2606). */
export const PLACEHOLDER_EMAIL_DOMAIN = "phone.inrent.invalid";

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** For tests. */
export function resetEmailProviderForTests(): void {
  provider = null;
}

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const from = process.env.EMAIL_FROM ?? "INRENT <no-reply@inrent.ai>";
  switch (process.env.EMAIL_PROVIDER) {
    case "resend":
      if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required for EMAIL_PROVIDER=resend");
      provider = new ResendEmailProvider(process.env.RESEND_API_KEY, from);
      break;
    case "sendgrid":
      if (!process.env.SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY is required for EMAIL_PROVIDER=sendgrid");
      provider = new SendGridEmailProvider(process.env.SENDGRID_API_KEY, from);
      break;
    default:
      if (process.env.INRENT_ENV === "production") throw new Error("Configure EMAIL_PROVIDER in production");
      provider = new ConsoleEmailProvider();
  }
  return provider;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Every field is optional except title and intro, so older callers (magic link, verify, reset, invite) keep working. */
export interface EmailContent {
  title: string;
  intro: string;
  /** Hidden inbox-preview text. Defaults to the start of `intro`. */
  preheader?: string;
  /** Extra paragraphs after the intro. */
  body?: string[];
  /** One-time code, shown large and boxed. */
  code?: { value: string; label?: string };
  /** Label/value rows (receipts, key metadata). `mono` renders the value in a monospace face. */
  details?: Array<{ label: string; value: string; mono?: boolean }>;
  /** Numbered quick-start steps. */
  steps?: Array<{ title: string; body: string }>;
  action?: { label: string; url: string };
  /** Secondary note under the button, e.g. "if this wasn't you". */
  note?: string;
  /** Replaces the default "why you received this" footer line. */
  footer?: string;
  /** Footer links. Defaults to the website and docs derived from APP_URL. */
  links?: Array<{ label: string; url: string }>;
}

export type TemplateEmail = EmailContent & { subject: string };

/** Returns the URL unchanged when it is a plain http(s) URL, otherwise null. Never normalizes: signed links must stay byte-exact. */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || [...url].some((c) => c.charCodeAt(0) <= 0x20 || c.charCodeAt(0) === 0x7f)) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function appOrigin(): string {
  const configured = safeUrl(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
  return (configured ?? "https://inrent.ai").replace(/\/+$/, "");
}

function defaultLinks(): Array<{ label: string; url: string }> {
  const origin = appOrigin();
  return [
    { label: "Website", url: origin },
    { label: "Docs", url: `${origin}/docs` },
  ];
}

/**
 * The mark as a hosted PNG (apps/web/public/brand/email-logo.png, 96px so it stays sharp on retina).
 * Absolute URL because mail clients resolve nothing relative; PNG because Gmail and Outlook drop SVG
 * and data: URIs. The text wordmark beside it keeps the header readable when images are blocked.
 */
function logoImg(size: number, alt: string): string {
  const src = escapeHtml(`${appOrigin()}/brand/email-logo.png`);
  return `<img src="${src}" width="${size}" height="${size}" alt="${escapeHtml(alt)}" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;border-radius:${size / 4}px">`;
}

const DEFAULT_FOOTER = "You received this email because of activity on your INRENT account.";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

// Light colors are inline so every client renders a sane email; the dark palette is layered on
// with classes for clients that honor prefers-color-scheme. Clients that force-invert colors
// (Outlook, Gmail) still get readable contrast because nothing is pure black text on pure white.
const STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.em-bg{background-color:#0b0d12!important}
.em-card{background-color:#12151c!important;border-color:#252b36!important}
.em-text{color:#e8ebf0!important}
.em-muted{color:#aab2c0!important}
.em-subtle{color:#7d8696!important}
.em-line{border-color:#252b36!important}
.em-box{background-color:#1a1e27!important;border-color:#2e3542!important}
.em-btn{background-color:#e8fff7!important}
.em-btn a{color:#05110d!important}
.em-link{color:#8fe9cd!important}
.em-step{background-color:#1f3a31!important;color:#8fe9cd!important}
}
@media only screen and (max-width:620px){
.em-pad{padding-left:20px!important;padding-right:20px!important}
.em-code{font-size:26px!important;letter-spacing:6px!important}
.em-stack{display:block!important;width:100%!important}
}
</style>`;

function paragraph(text: string): string {
  return `<p class="em-muted" style="margin:0 0 16px;font-size:16px;line-height:26px;color:#4a5465">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

function renderCode(code: { value: string; label?: string }): string {
  const label = code.label
    ? `<div class="em-subtle" style="font-size:12px;line-height:16px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#7b8494;margin:0 0 10px">${escapeHtml(code.label)}</div>`
    : "";
  // padding-left offsets the trailing letter-spacing so the digits look centred.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td align="center" class="em-box" bgcolor="#f4f6f8" style="background-color:#f4f6f8;border:1px solid #dde2e9;border-radius:10px;padding:22px 16px">${label}<div class="em-code em-text" style="font-family:${MONO};font-size:34px;line-height:40px;font-weight:700;letter-spacing:10px;color:#0d1117;padding-left:10px">${escapeHtml(code.value)}</div></td></tr></table>`;
}

function renderDetails(rows: NonNullable<EmailContent["details"]>): string {
  const cells = rows
    .map((row, i) => {
      const line = i === rows.length - 1 ? "" : "border-bottom:1px solid #e4e8ee;";
      const mono = row.mono ? `font-family:${MONO};font-weight:500;` : "";
      return `<tr><td class="em-line em-subtle em-stack" valign="top" width="38%" style="${line}padding:12px 16px;font-size:13px;line-height:20px;color:#7b8494">${escapeHtml(row.label)}</td><td class="em-line em-text em-stack" valign="top" style="${line}padding:12px 16px;font-size:14px;line-height:20px;color:#1d2433;font-weight:600;word-break:break-word;${mono}">${escapeHtml(row.value)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-line" style="margin:8px 0 24px;border:1px solid #e4e8ee;border-radius:10px;border-collapse:separate">${cells}</table>`;
}

function renderSteps(steps: NonNullable<EmailContent["steps"]>): string {
  const rows = steps
    .map(
      (step, i) =>
        `<tr><td valign="top" width="40" style="padding:0 0 18px"><div class="em-step" style="width:28px;height:28px;line-height:28px;border-radius:14px;background-color:#e6f7f0;color:#0b6b4d;font-size:13px;font-weight:700;text-align:center">${i + 1}</div></td><td valign="top" style="padding:0 0 18px"><div class="em-text" style="font-size:15px;line-height:22px;font-weight:600;color:#1d2433">${escapeHtml(step.title)}</div><div class="em-muted" style="font-size:14px;line-height:22px;color:#4a5465">${escapeHtml(step.body)}</div></td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 8px">${rows}</table>`;
}

function renderAction(action: { label: string; url: string }): string {
  const url = escapeHtml(action.url);
  // The button is a bgcolor table cell, which Outlook honors where CSS-only buttons lose their fill.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 0"><tr><td align="center" class="em-btn" bgcolor="#0d1117" style="background-color:#0d1117;border-radius:8px"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(action.label)}</a></td></tr></table>
<p class="em-subtle" style="margin:16px 0 0;font-size:12px;line-height:18px;color:#7b8494">Button not working? Paste this link into your browser:<br><a class="em-link" href="${url}" target="_blank" style="color:#0b6b4d;word-break:break-all">${url}</a></p>`;
}

/** Table-based, inline-CSS transactional layout (600px max). Content is escaped; URLs must be http(s). */
export function renderEmail(opts: EmailContent): { html: string; text: string } {
  const action = opts.action;
  if (action && !safeUrl(action.url)) throw new Error("Email action URL must be an http(s) URL");
  const links = (opts.links ?? defaultLinks()).filter((l) => safeUrl(l.url) !== null);
  const footer = opts.footer ?? DEFAULT_FOOTER;
  const preheader = (opts.preheader ?? opts.intro).replace(/\s+/g, " ").trim().slice(0, 140);

  const blocks = [
    `<h1 class="em-text" style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:#0d1117">${escapeHtml(opts.title)}</h1>`,
    paragraph(opts.intro),
    ...(opts.body ?? []).map(paragraph),
    opts.code ? renderCode(opts.code) : "",
    opts.details?.length ? renderDetails(opts.details) : "",
    opts.steps?.length ? renderSteps(opts.steps) : "",
    action ? renderAction(action) : "",
    opts.note
      ? `<div class="em-box em-muted" style="margin:28px 0 0;padding:14px 16px;background-color:#f7f8fa;border-left:3px solid #c3cad6;border-radius:4px;font-size:13px;line-height:20px;color:#4a5465">${escapeHtml(opts.note).replace(/\n/g, "<br>")}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const footerLinks = links
    .map((l) => `<a class="em-link" href="${escapeHtml(l.url)}" target="_blank" style="color:#0b6b4d;text-decoration:underline">${escapeHtml(l.label)}</a>`)
    .join(' <span style="color:#b3bac6">&middot;</span> ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(opts.title)}</title>
${STYLE}
</head>
<body class="em-bg" bgcolor="#f4f5f7" style="margin:0;padding:0;background-color:#f4f5f7;font-family:${SANS};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" bgcolor="#f4f5f7" style="background-color:#f4f5f7"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td class="em-pad" style="padding:0 4px 20px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" width="32" style="padding:0 12px 0 0">${logoImg(32, "INRENT")}</td><td valign="middle"><span class="em-text" style="font-size:18px;line-height:24px;font-weight:800;letter-spacing:4px;color:#0d1117">INRENT</span></td></tr></table></td></tr>
<tr><td class="em-card" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e4e8ee;border-top:3px solid #34d399;border-radius:12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="em-pad" style="padding:36px 40px 40px;font-family:${SANS}">
${blocks}
</td></tr></table>
</td></tr>
<tr><td class="em-pad" style="padding:24px 4px 0;font-family:${SANS}">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr><td valign="middle" width="20" style="padding:0 8px 0 0">${logoImg(20, "")}</td><td valign="middle" class="em-text" style="font-family:${SANS};font-size:13px;line-height:18px;font-weight:800;letter-spacing:3px;color:#0d1117">INRENT</td></tr></table>
<p class="em-subtle" style="margin:0 0 8px;font-size:12px;line-height:18px;color:#7b8494">${escapeHtml(footer)}</p>${footerLinks ? `\n<p class="em-subtle" style="margin:0;font-size:12px;line-height:18px;color:#7b8494">${footerLinks}</p>` : ""}
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const text = [
    opts.title,
    opts.intro,
    ...(opts.body ?? []),
    opts.code ? `${opts.code.label ?? "Your code"}: ${opts.code.value}` : "",
    opts.details?.length ? opts.details.map((d) => `${d.label}: ${d.value}`).join("\n") : "",
    opts.steps?.length ? opts.steps.map((s, i) => `${i + 1}. ${s.title} - ${s.body}`).join("\n") : "",
    action ? `${action.label}: ${action.url}` : "",
    opts.note ?? "",
    ["--", "INRENT", footer, ...links.map((l) => `${l.label}: ${l.url}`)].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}

export async function sendTemplateEmail(to: string, opts: TemplateEmail): Promise<void> {
  // Phone-only accounts have no mailbox; skip rather than bounce through the provider.
  if (isPlaceholderEmail(to)) return;
  const { html, text } = renderEmail(opts);
  // Subjects may one day include user-controlled names: never let them carry header-breaking line breaks.
  await getEmailProvider().send({ to, subject: opts.subject.replace(/[\r\n]+/g, " ").trim(), html, text });
}
