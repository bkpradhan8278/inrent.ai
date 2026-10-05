import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We'll email you a link to choose a new password." footer={<Link href="/sign-in" className="text-accent hover:underline">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
