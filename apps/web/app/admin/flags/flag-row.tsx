"use client";

import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { setFlagAction } from "../actions";

export function FlagRow({ flagKey, description, enabled, allowlist, envOverride, canWrite }: { flagKey: string; description: string; enabled: boolean; allowlist: string[]; envOverride: string | null; canWrite: boolean }) {
  const { pending, run } = useAction();
  const [list, setList] = React.useState(allowlist.join(", "));
  const parsed = list.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const invalid = parsed.some((s) => !/^[0-9a-f-]{36}$/i.test(s));
  return (
    <li className="panel rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-fg">{flagKey}</span>
            {envOverride !== null ? <Badge variant="amber">env override: {envOverride}</Badge> : null}
          </div>
          {description !== flagKey ? <p className="mt-0.5 text-[12.5px] text-fg-muted">{description}</p> : null}
        </div>
        <span className="text-[12px] text-fg-subtle">Global</span>
        <Switch aria-label={`${flagKey} global`} checked={enabled} disabled={!canWrite || pending} onCheckedChange={(c) => run(() => setFlagAction(flagKey, { enabled: c }), { success: `${flagKey} ${c ? "enabled" : "disabled"}` })} />
      </div>
      {canWrite ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => setFlagAction(flagKey, { orgAllowlist: parsed }), { success: "Allowlist saved" });
          }}
        >
          <Input aria-label={`${flagKey} organization allowlist`} value={list} onChange={(e) => setList(e.target.value)} placeholder="Organization IDs allowed even when globally off (comma-separated)" className="font-mono text-[12px]" aria-invalid={invalid} />
          <Button type="submit" variant="secondary" disabled={pending || invalid || list === allowlist.join(", ")}>
            Save allowlist
          </Button>
        </form>
      ) : allowlist.length ? (
        <p className="mt-2 text-[12px] text-fg-subtle">{allowlist.length} organization(s) allowlisted</p>
      ) : null}
    </li>
  );
}
