"use client";

import { ArrowRight, Bot, Check, Database, MessagesSquare, Sparkles, Wand2 } from "lucide-react";
import Link from "@/components/ui/link";
import * as React from "react";
import { PlainCode, SecretReveal, useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createApiKeyAction } from "../actions";

const USE_CASES = [
  { id: "chat", label: "Chat & assistants", icon: MessagesSquare, model: "inrent/auto" },
  { id: "agents", label: "Agents & tool use", icon: Bot, model: "inrent/auto" },
  { id: "rag", label: "RAG & embeddings", icon: Database, model: "inrent/auto" },
  { id: "eval", label: "Model evaluation", icon: Wand2, model: "inrent/auto" },
];

export function WelcomeFlow({ name, projectId, projectName, canCreateKey, hasKey, apiBase }: { name: string; projectId: string; projectName: string; canCreateKey: boolean; hasKey: boolean; apiBase: string }) {
  const [step, setStep] = React.useState(0);
  const [useCase, setUseCase] = React.useState<string | null>(null);
  const [keyName, setKeyName] = React.useState("my-first-key");
  const [secret, setSecret] = React.useState<string | null>(null);
  const { pending, run } = useAction();
  const keyRef = secret ?? "$INRENT_API_KEY";
  const steps = ["Your use case", "Create a key", "First request"];

  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl border border-accent/35 bg-accent-soft">
          <Sparkles className="size-5 text-accent" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">Welcome to INRENT, {name}</h1>
        <p className="mt-2 text-sm text-fg-muted">Three quick steps to your first request. You can skip any of them.</p>
      </div>

      <ol className="mb-6 flex items-center justify-center gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold", i < step ? "border-accent bg-accent text-accent-fg" : i === step ? "border-accent text-accent" : "border-border-strong text-fg-subtle")} aria-current={i === step ? "step" : undefined}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-[13px] sm:inline", i === step ? "text-fg" : "text-fg-subtle")}>{s}</span>
            {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border-strong sm:w-10" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <div className="panel hairline-top rounded-2xl p-6 sm:p-8">
        {step === 0 ? (
          <>
            <h2 className="text-lg font-semibold text-fg">What are you building?</h2>
            <p className="mt-1 text-sm text-fg-muted">We&apos;ll tailor the snippets. Nothing is shared.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {USE_CASES.map((u) => (
                <button key={u.id} type="button" onClick={() => setUseCase(u.id)} aria-pressed={useCase === u.id} className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition-colors", useCase === u.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong")}>
                  <u.icon className={cn("size-5", useCase === u.id ? "text-accent" : "text-fg-muted")} />
                  <span className="text-sm font-medium text-fg">{u.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Skip
              </Button>
              <Button onClick={() => setStep(1)} disabled={!useCase}>
                Continue <ArrowRight />
              </Button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h2 className="text-lg font-semibold text-fg">Create your first API key</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Development key for <span className="text-fg">{projectName}</span> with inference permission.
            </p>
            {secret ? (
              <div className="mt-5">
                <SecretReveal secret={secret} label="API key" />
              </div>
            ) : canCreateKey ? (
              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = await run(() => createApiKeyAction({ name: keyName, projectId, environment: "DEVELOPMENT", permissions: ["inference", "usage:read", "logs:read"], allowedModels: "", spendLimitUsd: "", rpmLimit: "", tpmLimit: "", expiresAt: "" }), { refresh: false });
                  if (data) setSecret(data.secret);
                }}
              >
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="welcome-key">Key name</Label>
                  <Input id="welcome-key" value={keyName} onChange={(e) => setKeyName(e.target.value)} required maxLength={64} />
                </div>
                <Button type="submit" disabled={pending}>
                  Create key
                </Button>
              </form>
            ) : (
              <p className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">Your role can&apos;t create keys. Ask an admin of this organization for one.</p>
            )}
            {hasKey && !secret ? <p className="mt-3 text-xs text-fg-subtle">You already have a key — you can skip this step.</p> : null}
            <div className="mt-6 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                {secret ? "Continue" : "Skip"} <ArrowRight />
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="text-lg font-semibold text-fg">Send your first request</h2>
            <p className="mt-1 text-sm text-fg-muted">INRENT speaks the OpenAI API — keep your SDK, change the base URL.</p>
            <div className="mt-5 grid gap-3">
              <PlainCode
                code={`curl ${apiBase}/chat/completions \\
  -H "Authorization: Bearer ${keyRef}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "inrent/auto", "messages": [{"role": "user", "content": "Say hello"}]}'`}
              />
              <PlainCode
                code={`from openai import OpenAI

client = OpenAI(base_url="${apiBase}", api_key="${secret ?? "YOUR_INRENT_API_KEY"}")
r = client.chat.completions.create(model="inrent/auto", messages=[{"role": "user", "content": "Say hello"}])
print(r.choices[0].message.content)`}
              />
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Requests draw on credits for platform models. Add credits in Billing, or connect your own provider key under BYOK.
            </p>
            <div className="mt-6 flex flex-col-reverse justify-between gap-2 sm:flex-row">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="secondary">
                  <Link href="/dashboard/playground">Try the playground</Link>
                </Button>
                <Button asChild>
                  <Link href="/dashboard">
                    Go to dashboard <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
