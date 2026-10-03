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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal, accessible branded layout. Content is escaped; links are passed separately. */
export function renderEmail(opts: { title: string; intro: string; action?: { label: string; url: string }; footer?: string }): { html: string; text: string } {
  const action = opts.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(opts.action.url)}" style="background:#e8fff7;color:#05110d;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(opts.action.label)}</a></p><p style="color:#8a93a3;font-size:12px">Or paste this link into your browser:<br>${escapeHtml(opts.action.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#07080b;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8ebf0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d0f14;border:1px solid #1f232c;border-radius:12px">
<tr><td style="padding:28px 32px;border-bottom:1px solid #1f232c;font-weight:700;letter-spacing:.12em">INRENT</td></tr>
<tr><td style="padding:32px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.title)}</h1>
<p style="line-height:1.6;color:#b9c0cc;margin:0">${escapeHtml(opts.intro)}</p>${action}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #1f232c;color:#6b7383;font-size:12px">${escapeHtml(opts.footer ?? "You received this email because of activity on your INRENT account.")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.title}\n\n${opts.intro}\n${opts.action ? `\n${opts.action.label}: ${opts.action.url}\n` : ""}\n— INRENT`;
  return { html, text };
}

export async function sendTemplateEmail(to: string, opts: Parameters<typeof renderEmail>[0] & { subject: string }): Promise<void> {
  const { html, text } = renderEmail(opts);
  await getEmailProvider().send({ to, subject: opts.subject, html, text });
}
