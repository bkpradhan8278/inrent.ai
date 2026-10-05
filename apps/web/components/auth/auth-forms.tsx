"use client";

import { ArrowLeft, Loader2, Mail, Smartphone } from "lucide-react";
import Link from "@/components/ui/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { isE164, normalizePhoneNumber } from "@inrent/core";
import { BrandLogo, GitHubIcon, GoogleIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import type { SocialProviderId } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/hosts";
import { navigate } from "@/lib/navigate";

const PROVIDERS: Record<SocialProviderId, { label: string; icon: ReactNode }> = {
  google: { label: "Google", icon: <GoogleIcon className="size-4" /> },
  github: { label: "GitHub", icon: <GitHubIcon className="size-4" /> },
  chatgpt: { label: "ChatGPT", icon: <BrandLogo brand="openai" size={16} /> },
};

function SocialButtons({ providers, next, onPhone }: { providers: SocialProviderId[]; next: string; onPhone?: () => void }) {
  const [pending, setPending] = useState<string | null>(null);
  if (!providers.length && !onPhone) return null;
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
          {pending === p ? <Loader2 className="animate-spin" /> : PROVIDERS[p].icon}
          Continue with {PROVIDERS[p].label}
        </Button>
      ))}
      {onPhone ? (
        <Button type="button" variant="secondary" disabled={pending !== null} onClick={onPhone}>
          <Smartphone />
          Continue with phone
        </Button>
      ) : null}
      <div className="my-2 flex items-center gap-3 text-[11px] uppercase tracking-wider text-fg-subtle">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** One-time code by SMS. The first verified code creates the account, so sign-in and sign-up share this flow. */
function PhoneForm({ next, onUseEmail }: { next: string; onUseEmail: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(phoneNumber: string) {
    setError(null);
    setLoading(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
    setLoading(false);
    if (error) {
      setError(error.status === 429 ? "Too many codes requested. Try again later." : error.code === "INVALID_PHONE_NUMBER" ? "We can't send codes to this number. Check the country code." : "Could not send the code. Try again.");
      return false;
    }
    setSentTo(phoneNumber);
    return true;
  }

  if (!sentTo) {
    return (
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const phoneNumber = normalizePhoneNumber(phone);
          if (!isE164(phoneNumber)) return setError("Enter your number with its country code, for example +91 98765 43210.");
          await sendCode(phoneNumber);
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          <FieldHint>Include your country code. We&apos;ll text you a 6-digit code.</FieldHint>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          Text me a code
        </Button>
        <button type="button" className="text-xs text-fg-subtle hover:text-fg" onClick={onUseEmail}>
          Use email instead
        </button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const { error } = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code });
        setLoading(false);
        if (error) {
          if (error.status === 429 || error.code === "TOO_MANY_ATTEMPTS") setError("Too many attempts. Request a new code.");
          else if (error.code === "OTP_EXPIRED" || error.code === "OTP_NOT_FOUND") setError("This code has expired. Request a new one.");
          else if (error.code === "INVALID_OTP") setError("That code isn't right. Check the SMS and try again.");
          // The sign-up hook refuses new accounts while SIGNUPS_ENABLED is off.
          else if (error.code === "FAILED_TO_CREATE_USER") setError("New sign-ups are paused, so we can't create an account for this number right now.");
          else setError("Could not sign you in. Try again.");
          return;
        }
        navigate(router, next, { refresh: true });
      }}
    >
      <p className="text-sm text-fg-muted">
        Enter the code we sent to <strong className="text-fg">{sentTo}</strong>. It expires in 5 minutes.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="font-mono tracking-[0.3em]"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" disabled={loading || code.length !== 6}>
        {loading ? <Loader2 className="animate-spin" /> : null}
        Verify and continue
      </Button>
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-fg"
          onClick={() => {
            setSentTo(null);
            setCode("");
            setError(null);
          }}
        >
          <ArrowLeft className="size-3" /> Change number
        </button>
        <button
          type="button"
          className="hover:text-fg disabled:opacity-50"
          disabled={loading}
          onClick={async () => {
            if (await sendCode(sentTo)) setCode("");
          }}
        >
          Resend code
        </button>
      </div>
    </form>
  );
}

export function SignInForm({ providers, phone }: { providers: SocialProviderId[]; phone: boolean }) {
  const params = useSearchParams();
  // Same-site paths or URLs on our own section hosts only (no open redirects).
  const next = safeRedirect(params.get("next"));
  const router = useRouter();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4">
      <SocialButtons providers={providers} next={next} onPhone={phone && method === "email" ? () => setMethod("phone") : undefined} />
      {method === "phone" ? (
        <PhoneForm next={next} onUseEmail={() => setMethod("email")} />
      ) : sent ? (
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

export function SignUpForm({ providers, phone, requireVerification }: { providers: SocialProviderId[]; phone: boolean; requireVerification: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState<"email" | "phone">("email");
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
      <SocialButtons providers={providers} next="/dashboard/welcome" onPhone={phone && method === "email" ? () => setMethod("phone") : undefined} />
      {method === "phone" ? (
        <PhoneForm next="/dashboard/welcome" onUseEmail={() => setMethod("email")} />
      ) : (
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
      )}
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
