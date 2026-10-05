"use client";

import { Loader2, Mail } from "lucide-react";
import Link from "@/components/ui/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GitHubIcon, GoogleIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/hosts";
import { navigate } from "@/lib/navigate";


function SocialButtons({ providers, next }: { providers: Array<"github" | "google">; next: string }) {
  const [pending, setPending] = useState<string | null>(null);
  if (!providers.length) return null;
  return (
    <div className="grid gap-2">
      {providers.map((p) => (
        <Button
          key={p}
          type="button"
          variant="secondary"
          disabled={pending !== null}
          onClick={async () => {
            setPending(p);
            await authClient.signIn.social({ provider: p, callbackURL: next });
            setPending(null);
          }}
        >
          {pending === p ? <Loader2 className="animate-spin" /> : p === "github" ? <GitHubIcon className="size-4" /> : <GoogleIcon className="size-4" />}
          Continue with {p === "github" ? "GitHub" : "Google"}
        </Button>
      ))}
      <div className="my-2 flex items-center gap-3 text-[11px] uppercase tracking-wider text-fg-subtle">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export function SignInForm({ providers }: { providers: Array<"github" | "google"> }) {
  const params = useSearchParams();
  // Same-site paths or URLs on our own section hosts only (no open redirects).
  const next = safeRedirect(params.get("next"));
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4">
      <SocialButtons providers={providers} next={next} />
      {sent ? (
        <div className="rounded-lg border border-accent/35 bg-accent-soft p-4 text-sm text-fg">
          <Mail className="mb-2 size-4 text-accent" />
          Check <strong>{email}</strong> for a sign-in link. It expires in 10 minutes.
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            if (mode === "magic") {
              const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
              setLoading(false);
              if (error) setError(error.message ?? "Could not send the link.");
              else setSent(true);
              return;
            }
            const { error } = await authClient.signIn.email({ email, password });
            setLoading(false);
            if (error) {
              setError(error.status === 403 ? "Verify your email first — we sent you a link when you signed up." : error.message ?? "Invalid email or password.");
              return;
            }
            navigate(router, next, { refresh: true });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode === "password" ? (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-fg-subtle hover:text-fg">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {mode === "password" ? "Sign in" : "Email me a sign-in link"}
          </Button>
          <button type="button" className="text-xs text-fg-subtle hover:text-fg" onClick={() => setMode(mode === "password" ? "magic" : "password")}>
            {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
          </button>
        </form>
      )}
    </div>
  );
}

export function SignUpForm({ providers, requireVerification }: { providers: Array<"github" | "google">; requireVerification: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-lg border border-accent/35 bg-accent-soft p-5 text-sm text-fg">
        <Mail className="mb-2 size-4 text-accent" />
        We sent a verification link to <strong>{email}</strong>. Open it to activate your account.
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <SocialButtons providers={providers} next="/dashboard/welcome" />
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 10) {
            setError("Use at least 10 characters.");
            return;
          }
          setLoading(true);
          const { error } = await authClient.signUp.email({ name: name.trim() || email.split("@")[0]!, email, password, callbackURL: safeRedirect("/dashboard/welcome") });
          setLoading(false);
          if (error) {
            setError(error.message ?? "Could not create your account.");
            return;
          }
          if (requireVerification) setDone(true);
          else {
            navigate(router, "/dashboard/welcome", { refresh: true });
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          <FieldHint>At least 10 characters.</FieldHint>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          Create account
        </Button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  if (sent) return <p className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">If an account exists for {email}, a reset link is on its way.</p>;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => undefined);
        setLoading(false);
        setSent(true);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : null} Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired." : null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!token) return setError("This reset link is invalid or has expired.");
        if (password.length < 10) return setError("Use at least 10 characters.");
        setLoading(true);
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        setLoading(false);
        if (error) setError(error.message ?? "Could not reset your password.");
        else router.push("/sign-in");
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" disabled={loading || !token}>
        {loading ? <Loader2 className="animate-spin" /> : null} Set new password
      </Button>
    </form>
  );
}
