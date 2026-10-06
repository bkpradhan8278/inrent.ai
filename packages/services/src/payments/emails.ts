import { prisma, type Payment } from "@inrent/db";
import { formatUsd } from "@inrent/core";
import { dashboardUrl } from "../dashboardUrl";
import { isPlaceholderEmail } from "../email";
import { enqueueEmail } from "../queue";

/** Locale only picks digit grouping (₹1,00,000 vs $100,000); the currency always comes from the payment. */
const LOCALES: Record<string, string> = { INR: "en-IN" };

/** Formats provider minor units (cents, paise) for display, honouring the currency's own exponent. */
export function formatPaymentAmount(amountMinor: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    const fmt = new Intl.NumberFormat(LOCALES[code] ?? "en-US", { style: "currency", currency: code });
    return fmt.format(amountMinor / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    // Unknown currency code: show the raw figure rather than dropping the email.
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}

/**
 * Who hears about a payment: the user who started it, else the workspace billing contact, else an
 * owner. Phone-only accounts have no mailbox, so each step needs a real address to count.
 */
async function resolveRecipient(payment: Payment): Promise<{ to: string; name: string; workspaceName: string } | null> {
  const org = await prisma.organization.findUnique({ where: { id: payment.organizationId }, select: { name: true, billingEmail: true } });
  if (!org) return null;
  const reachable = (email: string | null | undefined): email is string => Boolean(email) && !isPlaceholderEmail(email!);
  if (payment.createdById) {
    const user = await prisma.user.findUnique({ where: { id: payment.createdById }, select: { name: true, email: true, deletedAt: true } });
    if (user && !user.deletedAt && reachable(user.email)) return { to: user.email, name: user.name, workspaceName: org.name };
  }
  if (reachable(org.billingEmail)) return { to: org.billingEmail, name: "", workspaceName: org.name };
  const owners = await prisma.membership.findMany({
    where: { organizationId: payment.organizationId, role: "OWNER", user: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { name: true, email: true } } },
  });
  const owner = owners.find((m) => reachable(m.user.email));
  return owner ? { to: owner.user.email, name: owner.user.name, workspaceName: org.name } : null;
}

/**
 * Queues the receipt or failure notice for a payment that has just changed state. Call it only on
 * the real transition (the webhook handler already filters replays); the deterministic job id is a
 * second guard. Never throws, so webhook handling and its 2xx response are unaffected.
 */
export async function queuePaymentEmail(payment: Payment, kind: "receipt" | "failed"): Promise<void> {
  try {
    // Amount mismatches are an integrity alarm for us, not a card problem the customer can fix.
    if (kind === "failed" && payment.failureReason?.startsWith("amount_mismatch")) return;
    const recipient = await resolveRecipient(payment);
    if (!recipient) return;
    const billingUrl = dashboardUrl("/billing");
    const amountFormatted = formatPaymentAmount(payment.amountCents, payment.currency);
    if (kind === "receipt") {
      await enqueueEmail(
        recipient.to,
        "payment_receipt",
        {
          name: recipient.name,
          amountFormatted,
          creditsFormatted: formatUsd(payment.creditsNano),
          method: payment.provider === "STRIPE" ? "Stripe" : "Razorpay",
          reference: payment.id,
          paidAtIso: payment.updatedAt.toISOString(),
          workspaceName: recipient.workspaceName,
          billingUrl,
        },
        { jobId: `email:payment_receipt:${payment.id}` },
      );
      return;
    }
    // Auto-recharge is retried on every sweep, so a dead card would otherwise send one email per
    // attempt. The user does need to act on it (the balance keeps draining), hence one per day.
    const jobId = payment.isAutoRecharge
      ? `email:payment_failed:ar-${payment.organizationId}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`
      : `email:payment_failed:${payment.id}`;
    await enqueueEmail(
      recipient.to,
      "payment_failed",
      { name: recipient.name, amountFormatted, reason: payment.failureReason ?? undefined, workspaceName: recipient.workspaceName, billingUrl },
      { jobId },
    );
  } catch (err) {
    console.error(`Could not prepare the payment ${kind} email: ${err instanceof Error ? err.message : String(err)}`);
  }
}
