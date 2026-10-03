import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/auth-forms";
import { enabledSocialProviders } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage() {
  if (await getSession()) redirect("/dashboard");
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
        <SignInForm providers={enabledSocialProviders} />
      </Suspense>
    </AuthCard>
  );
}
