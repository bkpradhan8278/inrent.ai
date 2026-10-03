import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
