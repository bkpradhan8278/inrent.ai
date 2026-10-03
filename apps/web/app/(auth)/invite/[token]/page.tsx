import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvitation, ServiceError } from "@inrent/services";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Join organization", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  async function accept() {
    "use server";
    const s = await getSession();
    if (!s) redirect("/sign-in");
    let ok = true;
    try {
      await acceptInvitation({ id: s.user.id, email: s.user.email }, token);
    } catch (e) {
      ok = false;
      if (!(e instanceof ServiceError)) throw e;
    }
    redirect(ok ? "/dashboard?joined=1" : `/invite/${token}?error=1`);
  }

  return (
    <AuthCard title="You've been invited" description={`Accept to join the organization as ${session.user.email}.`} footer={<Link href="/dashboard">Not now</Link>}>
      <form action={accept}>
        <Button type="submit" className="w-full">
          Accept invitation
        </Button>
      </form>
    </AuthCard>
  );
}
