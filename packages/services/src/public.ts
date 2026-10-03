import { prisma, type WaitlistProduct } from "@inrent/db";
import { ValidationError } from "./errors";

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/;

/** Idempotent waitlist signup — re-joining updates details instead of creating duplicates. */
export async function joinWaitlist(input: {
  email: string;
  product?: WaitlistProduct;
  useCase?: string;
  gpuType?: string;
  expectedHours?: number | null;
  company?: string;
  userId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.");
  if (input.expectedHours != null && (!Number.isInteger(input.expectedHours) || input.expectedHours < 0 || input.expectedHours > 1_000_000)) {
    throw new ValidationError("Expected hours must be a whole number.");
  }
  const product = input.product ?? "GPU_CLOUD";
  const data = {
    useCase: input.useCase?.slice(0, 1000) || null,
    gpuType: input.gpuType?.slice(0, 64) || null,
    expectedHours: input.expectedHours ?? null,
    company: input.company?.slice(0, 128) || null,
    userId: input.userId ?? null,
  };
  await prisma.waitlistEntry.upsert({
    where: { email_product: { email, product } },
    create: { email, product, ...data },
    update: data,
  });
}

export async function createSupportTicket(input: { email: string; subject: string; body: string; category?: string; userId?: string | null; organizationId?: string | null }) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3 || subject.length > 160) throw new ValidationError("Subject must be 3–160 characters.");
  if (body.length < 10 || body.length > 10_000) throw new ValidationError("Please describe the issue (10–10,000 characters).");
  const category = ["general", "billing", "technical", "security", "abuse", "sales"].includes(input.category ?? "") ? input.category! : "general";
  return prisma.supportTicket.create({
    data: { email, subject, body, category, userId: input.userId ?? null, organizationId: input.organizationId ?? null, priority: category === "security" ? "high" : "normal" },
    select: { id: true, createdAt: true },
  });
}
