import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/auth-forms";
import { enabledSocialProviders, phoneSignInEnabled } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { hrefFor } from "@/lib/hosts";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage() {
  if (await getSession()) redirect(hrefFor("/dashboard"));
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your INRENT account."
      footer={
        <>
          New to INRENT?{" "}
          <Link href="/sign-up" className="text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <SignInForm providers={enabledSocialProviders} phone={phoneSignInEnabled} />
      </Suspense>
    </AuthCard>
  );
}
