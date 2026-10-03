import { handlePaymentWebhook } from "@/lib/payment-webhook";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handlePaymentWebhook(req, "RAZORPAY");
}
