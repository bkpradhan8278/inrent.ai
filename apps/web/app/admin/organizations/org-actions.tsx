"use client";

import { Ban, CircleDollarSign, MoreHorizontal, RotateCcw, Tag } from "lucide-react";
import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { adjustCreditsAction, setOrgPlanAction, setOrgSuspendedAction } from "../actions";

export function OrgActions({ org, plans, canWrite, canRefund }: { org: { id: string; name: string; plan: string; suspended: boolean }; plans: Array<{ slug: string; name: string }>; canWrite: boolean; canRefund: boolean }) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = React.useState<"suspend" | "plan" | "credits" | null>(null);
  const [reason, setReason] = React.useState("");
  const [plan, setPlan] = React.useState(org.plan);
  const [credit, setCredit] = React.useState({ amountUsd: "", reason: "", type: "ADJUSTMENT" as "ADJUSTMENT" | "REFUND" | "PROMO" });
  const [idem, setIdem] = React.useState("");
  if (!canWrite && !canRefund) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Actions for ${org.name}`}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <>
              <DropdownMenuItem onSelect={() => setDialog("plan")}>
                <Tag /> Change plan
              </DropdownMenuItem>
              {org.suspended ? (
                <DropdownMenuItem onSelect={() => run(() => setOrgSuspendedAction(org.id, false, ""), { success: "Organization reinstated" })}>
                  <RotateCcw /> Reinstate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setDialog("suspend")} className="text-danger data-[highlighted]:text-danger">
                  <Ban /> Suspend
                </DropdownMenuItem>
              )}
            </>
          ) : null}
          {canRefund ? (
            <DropdownMenuItem
              onSelect={() => {
                setIdem(crypto.randomUUID());
                setDialog("credits");
              }}
            >
              <CircleDollarSign /> Adjust credits
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "suspend"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {org.name}?</DialogTitle>
            <DialogDescription>All API keys stop working. Members can still sign in and see billing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="sus-reason">Reason (shown to the customer)</Label>
            <Textarea id="sus-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
          </div>
          <DialogFooter>
            <Button
              variant="danger"
              disabled={pending || reason.trim().length < 3}
              onClick={async () => {
                const ok = await run(() => setOrgSuspendedAction(org.id, true, reason), { success: "Organization suspended" });
                if (ok !== undefined) setDialog(null);
              }}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "plan"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan for {org.name}</DialogTitle>
          </DialogHeader>
          <NativeSelect aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button
              disabled={pending || plan === org.plan}
              onClick={async () => {
                const ok = await run(() => setOrgPlanAction(org.id, plan), { success: "Plan updated" });
                if (ok !== undefined) setDialog(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "credits"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust credits — {org.name}</DialogTitle>
            <DialogDescription>Writes a ledger entry and an audit record. Use a negative amount to debit. Card refunds must also be issued in the payment provider.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => adjustCreditsAction({ orgId: org.id, ...credit, idempotencyKey: idem }), { success: "Ledger updated" });
              if (ok !== undefined) {
                setDialog(null);
                setCredit({ amountUsd: "", reason: "", type: "ADJUSTMENT" });
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="adj-amt">Amount (USD)</Label>
                <Input id="adj-amt" value={credit.amountUsd} onChange={(e) => setCredit({ ...credit, amountUsd: e.target.value })} pattern="^-?\d+(\.\d{1,6})?$" placeholder="e.g. 10 or -2.50" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adj-type">Type</Label>
                <NativeSelect id="adj-type" value={credit.type} onChange={(e) => setCredit({ ...credit, type: e.target.value as typeof credit.type })}>
                  <option value="ADJUSTMENT">Adjustment</option>
                  <option value="REFUND">Refund</option>
                  <option value="PROMO">Promotional</option>
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input id="adj-reason" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} required minLength={3} maxLength={200} />
              <FieldHint>Recorded in the customer&apos;s credit activity and the audit log.</FieldHint>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
