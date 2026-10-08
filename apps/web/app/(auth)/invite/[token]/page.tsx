import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvitation, ForbiddenError, getInvitationPreview, ServiceError, ValidationError } from "@inrent/services";
import { isPlaceholderEmail } from "@inrent/services/email";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { getSession, ORG_COOKIE } from "@/lib/session";
import { hrefFor } from "@/lib/hosts";

export const metadata: Metadata = { title: "Join organization", robots: { index: false } };

const ERRORS = {
  wrong_account: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  no_seats: "This organization has no free seats. Ask an admin to upgrade the plan or remove a member.",
  invalid: "This invitation is no longer valid. Ask an admin to send a new one.",
} as const;

const CLOSED = { accepted: "This invitation has already been accepted.", revoked: "This invitation was withdrawn or replaced by a newer one.", expired: "This invitation has expired. Ask an admin to send a new one." } as const;

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const session = await getSession();
  if (!session) redirect(hrefFor(`/sign-in?next=${encodeURIComponent(hrefFor(`/invite/${token}`))}`));
  const invite = await getInvitationPreview(token);

  async function accept() {
    "use server";
    const s = await getSession();
    if (!s) redirect(hrefFor("/sign-in"));
    let organizationId: string;
    try {
      organizationId = await acceptInvitation({ id: s.user.id, email: s.user.email }, token);
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
      redirect(hrefFor(`/invite/${token}?error=${e instanceof ForbiddenError ? "wrong_account" : e instanceof ValidationError ? "no_seats" : "invalid"}`));
    }
    // Open the organization just joined rather than the user's own workspace.
    (await cookies()).set(ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    redirect(hrefFor("/dashboard?joined=1"));
  }

  const unavailable = !invite ? ERRORS.invalid : invite.status === "pending" ? null : CLOSED[invite.status];
  if (!invite || unavailable) {
    return (
      <AuthCard title="Invitation unavailable" description={unavailable ?? ERRORS.invalid} footer={<Link href="/dashboard">Go to dashboard</Link>}>
        {null}
      </AuthCard>
    );
  }

  const signedInAs = isPlaceholderEmail(session.user.email) ? "an account without an email address" : session.user.email;
  return (
    <AuthCard
      title={`Join ${invite.organizationName}`}
      description={`${invite.invitedByName ?? "A team admin"} invited ${invite.email} as ${invite.role.toLowerCase().replace("_", " ")}. You're signed in as ${signedInAs}.`}
      footer={<Link href="/dashboard">Not now</Link>}
    >
      <form action={accept} className="grid gap-3">
        {error && error in ERRORS ? <FieldError>{ERRORS[error as keyof typeof ERRORS]}</FieldError> : null}
        <Button type="submit" className="w-full">
          Accept invitation
        </Button>
      </form>
    </AuthCard>
  );
}
