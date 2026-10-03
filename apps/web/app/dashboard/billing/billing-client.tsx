"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { startCheckoutAction, updateSpendControlsAction } from "../actions";

type Provider = "STRIPE" | "RAZORPAY";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay checkout."));
    document.head.appendChild(s);
  });
}

export function BuyCredits({ presets, providers }: { presets: number[]; providers: Provider[] }) {
  const [amount, setAmount] = React.useState<number>(presets[2] ?? 25);
  const [custom, setCustom] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(providers[0] ?? "STRIPE");
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const value = custom ? Number(custom) : amount;
  const valid = Number.isFinite(value) && value >= 5 && value <= 10000 && Math.round(value * 100) === value * 100;

  if (!providers.length) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">
        <div className="font-medium text-fg">Payments aren&apos;t configured on this deployment.</div>
        <p className="mt-1">
          Set <code className="font-mono text-[12.5px]">STRIPE_SECRET_KEY</code> and <code className="font-mono text-[12.5px]">STRIPE_WEBHOOK_SECRET</code> (or the Razorpay equivalents) to enable checkout. No charges can be made until then.
        </p>
      </div>
    );
  }

  const checkout = async () => {
    setBusy(true);
    try {
      const r = await startCheckoutAction(value, provider);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.kind === "redirect") {
        window.location.assign(r.data.url);
        return;
      }
      await loadRazorpay();
      const rz = new window.Razorpay!({
        ...r.data.clientParams,
        theme: { color: "#5cebc0" },
        handler: () => {
          router.push("/dashboard/billing?payment=success");
          router.refresh();
        },
        modal: { ondismiss: () => toast("Checkout closed — you were not charged.") },
      });
      rz.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
            aria-pressed={!custom && amount === p}
            className={cn("h-11 rounded-lg border font-mono text-sm transition-colors", !custom && amount === p ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-fg hover:border-border-strong")}
          >
            ${p}
          </button>
        ))}
        <Input aria-label="Custom amount in USD" inputMode="decimal" placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} className={cn("h-11 text-center font-mono", custom && "border-accent")} />
      </div>
      {providers.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-fg-subtle">Pay with</span>
          {providers.map((p) => (
            <button key={p} type="button" onClick={() => setProvider(p)} aria-pressed={provider === p} className={cn("rounded-md border px-3 py-1.5", provider === p ? "border-accent text-fg" : "border-border text-fg-muted")}>
              {p === "STRIPE" ? "Card (Stripe)" : "UPI / Cards — India (Razorpay)"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-fg-muted">
          {valid ? (
            <>
              You&apos;ll receive <span className="font-mono text-fg">${value.toFixed(2)}</span> in credits. Taxes may apply at checkout.
            </>
          ) : (
            <span className="text-danger">Enter an amount between $5 and $10,000.</span>
          )}
        </p>
        <Button onClick={checkout} disabled={!valid || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Continue to checkout
        </Button>
      </div>
    </div>
  );
}

interface Controls {
  monthlyCapUsd: string;
  lowBalanceUsd: string;
  autoRecharge: boolean;
  thresholdUsd: string;
  amountUsd: string;
}

export function SpendControlsForm({ initial, disabled, autoRechargeAvailable }: { initial: Controls; disabled: boolean; autoRechargeAvailable: boolean }) {
  const [v, setV] = React.useState(initial);
  const { pending, run } = useAction();
  const money = "^\\d+(\\.\\d{1,6})?$";
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateSpendControlsAction(v), { success: "Spend controls saved" });
      }}
    >
      <fieldset disabled={disabled} className="grid gap-5 disabled:opacity-70">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cap">Monthly spend cap (USD)</Label>
            <Input id="cap" inputMode="decimal" pattern={money} value={v.monthlyCapUsd} onChange={(e) => setV({ ...v, monthlyCapUsd: e.target.value })} placeholder="No cap" />
            <FieldHint>Hard stop for the whole organization.</FieldHint>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="low">Low-balance alert (USD)</Label>
            <Input id="low" inputMode="decimal" pattern={money} value={v.lowBalanceUsd} onChange={(e) => setV({ ...v, lowBalanceUsd: e.target.value })} placeholder="Off" />
            <FieldHint>Email + in-app notification.</FieldHint>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="auto">Auto-recharge</Label>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">Charge your saved card when the balance drops below the threshold. Opt-in only; never more than one recharge in flight.</p>
            </div>
            <Switch id="auto" checked={v.autoRecharge} disabled={!autoRechargeAvailable} onCheckedChange={(c) => setV({ ...v, autoRecharge: c })} />
          </div>
          {!autoRechargeAvailable ? <p className="mt-2 text-[12px] text-fg-subtle">Requires Stripe to be configured.</p> : null}
          {v.autoRecharge ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="thr">When balance falls below</Label>
                <Input id="thr" inputMode="decimal" pattern={money} value={v.thresholdUsd} onChange={(e) => setV({ ...v, thresholdUsd: e.target.value })} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="amt">Add this amount</Label>
                <Input id="amt" inputMode="decimal" pattern={money} value={v.amountUsd} onChange={(e) => setV({ ...v, amountUsd: e.target.value })} required />
              </div>
              <p className="text-[12px] text-fg-subtle sm:col-span-2">A card is saved the next time you buy credits with auto-recharge on.</p>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            Save controls
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
