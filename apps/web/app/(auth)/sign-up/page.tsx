import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { redirect } from "next/navigation";
import { isFeatureEnabled } from "@inrent/services";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/auth-forms";
import { enabledSocialProviders } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { hrefFor } from "@/lib/hosts";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUpPage() {
  if (await getSession()) redirect(hrefFor("/dashboard"));
  const open = await isFeatureEnabled("SIGNUPS_ENABLED").catch(() => true);
  const requireVerification = process.env.INRENT_ENV === "production" || process.env.NODE_ENV === "production";
  return (
    <AuthCard
      title="Start building with INRENT"
      description="Create an account, generate a key, make your first request."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {open ? <SignUpForm providers={enabledSocialProviders} requireVerification={requireVerification} /> : <p className="text-sm text-fg-muted">New sign-ups are temporarily paused. Please check back soon.</p>}
    </AuthCard>
  );
}
