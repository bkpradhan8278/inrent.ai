"use server";

import { headers } from "next/headers";
import { joinWaitlist, createSupportTicket, ServiceError } from "@inrent/services";
import { getSession } from "@/lib/session";

export interface FormState {
  ok: boolean;
  message: string;
}

/** Simple per-IP throttle for public forms (Redis-backed sliding window). */
async function throttle(bucket: string, limit: number): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  try {
    const { RedisRateLimitStore } = await import("@inrent/services/redis");
    const r = await new RedisRateLimitStore().hit(`rl:form:${bucket}:${ip}`, limit, 3_600_000, 1, Date.now());
    return r.allowed;
  } catch {
    return true; // fail open if Redis is unavailable; validation still applies
  }
}

export async function joinWaitlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (form.get("company_website")) return { ok: true, message: "Thanks — you're on the list." }; // honeypot
  if (!(await throttle("waitlist", 10))) return { ok: false, message: "Too many submissions. Please try again later." };
  const session = await getSession();
  try {
    await joinWaitlist({
      email: String(form.get("email") ?? ""),
      product: "GPU_CLOUD",
      useCase: String(form.get("useCase") ?? ""),
      gpuType: String(form.get("gpuType") ?? ""),
      expectedHours: form.get("expectedHours") ? Number(form.get("expectedHours")) : null,
      company: String(form.get("company") ?? ""),
      userId: session?.user.id ?? null,
    });
    return { ok: true, message: "You're on the GPU Cloud waitlist. We'll email you before launch." };
  } catch (e) {
    return { ok: false, message: e instanceof ServiceError ? e.message : "Something went wrong. Please try again." };
  }
}

export async function contactAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (form.get("company_website")) return { ok: true, message: "Thanks — we'll be in touch." };
  if (!(await throttle("contact", 5))) return { ok: false, message: "Too many submissions. Please try again later." };
  const session = await getSession();
  try {
    const ticket = await createSupportTicket({
      email: String(form.get("email") ?? session?.user.email ?? ""),
      subject: String(form.get("subject") ?? ""),
      body: String(form.get("body") ?? ""),
      category: String(form.get("category") ?? "general"),
      userId: session?.user.id ?? null,
    });
    return { ok: true, message: `Thanks — your message was received (reference ${ticket.id.slice(0, 8)}). A person on our team will reply by email.` };
  } catch (e) {
    return { ok: false, message: e instanceof ServiceError ? e.message : "Something went wrong. Please try again." };
  }
}
