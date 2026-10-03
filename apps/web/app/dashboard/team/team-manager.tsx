"use client";

import { Mail, UserPlus, Users, X } from "lucide-react";
import * as React from "react";
import { ConfirmDialog, PlainCode, useAction } from "@/components/dashboard/client-kit";
import { EmptyState, Section } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { formatDate, formatRelative } from "@/lib/format";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction, updateMemberRoleAction } from "../actions";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "BILLING" | "VIEWER";
const ROLES: Role[] = ["OWNER", "ADMIN", "DEVELOPER", "BILLING", "VIEWER"];

interface Member {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  joinedAt: string;
}

export function TeamManager({ isPersonal, canManage, currentUserId, roles, members, invitations, maxMembers }: { isPersonal: boolean; canManage: boolean; currentUserId: string; roles: Record<Role, string>; members: Member[]; invitations: Array<{ id: string; email: string; role: Role; expiresAt: string }>; maxMembers: number | null }) {
  const { pending, run } = useAction();
  const [inviting, setInviting] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("DEVELOPER");
  const [link, setLink] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Member | null>(null);
  const seatsLeft = maxMembers !== null ? maxMembers - members.length - invitations.length : null;

  return (
    <div className="grid gap-6">
      <Section
        title="Members"
        description={maxMembers !== null ? `${members.length} of ${maxMembers} seats used` : undefined}
        contentClassName="p-0"
        actions={
          canManage && !isPersonal ? (
            <Button size="sm" onClick={() => setInviting(true)} disabled={seatsLeft !== null && seatsLeft <= 0}>
              <UserPlus /> Invite
            </Button>
          ) : null
        }
      >
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-2 text-sm font-medium text-fg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.image ? <img src={m.image} alt="" className="size-full object-cover" /> : m.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">
                  {m.name} {m.userId === currentUserId ? <span className="text-fg-subtle">(you)</span> : null}
                </div>
                <div className="truncate text-[12.5px] text-fg-subtle">
                  {m.email} · joined {formatDate(m.joinedAt)}
                </div>
              </div>
              {canManage && m.userId !== currentUserId && !isPersonal ? (
                <div className="flex items-center gap-2">
                  <NativeSelect aria-label={`Role for ${m.name}`} value={m.role} disabled={pending} onChange={(e) => run(() => updateMemberRoleAction(m.userId, e.target.value as Role), { success: "Role updated" })} className="h-8 w-36 text-[13px]">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0) + r.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}>
                    <X />
                  </Button>
                </div>
              ) : (
                <Badge variant={m.role === "OWNER" ? "accent" : "neutral"}>{m.role.toLowerCase()}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {!isPersonal ? (
        <Section title="Pending invitations" contentClassName={invitations.length ? "p-0" : undefined}>
          {invitations.length ? (
            <ul className="divide-y divide-border">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Mail className="size-4 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{i.email}</span>
                  <Badge>{i.role.toLowerCase()}</Badge>
                  <span className="text-[12px] text-fg-subtle">expires {formatRelative(i.expiresAt)}</span>
                  {canManage ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInvitationAction(i.id), { success: "Invitation revoked" })}>
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No pending invitations" className="border-0 py-4" />
          )}
        </Section>
      ) : null}

      <Section title="Roles">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-border bg-surface p-3">
              <dt className="text-sm font-medium text-fg">{r.charAt(0) + r.slice(1).toLowerCase()}</dt>
              <dd className="mt-1 text-[12.5px] text-fg-muted">{roles[r]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Dialog
        open={inviting}
        onOpenChange={(o) => {
          setInviting(o);
          if (!o) {
            setLink(null);
            setEmail("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>They&apos;ll get an email with a link that expires in 7 days.</DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="grid gap-3">
              <p className="text-sm text-fg-muted">Invitation sent. You can also share this link directly — it only works for {email}.</p>
              <PlainCode code={link} />
              <DialogFooter>
                <Button onClick={() => setInviting(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const data = await run(() => inviteMemberAction(email, role));
                if (data) setLink(data.link);
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inv-role">Role</Label>
                <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.filter((r) => r !== "OWNER").map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0) + r.slice(1).toLowerCase()}
                    </option>
                  ))}
                </NativeSelect>
                <FieldHint>{roles[role]}</FieldHint>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They lose access to this organization immediately. Keys they created keep working until revoked."
        confirmLabel="Remove member"
        pending={pending}
        onConfirm={async () => {
          await run(() => removeMemberAction(removing!.userId), { success: "Member removed" });
          setRemoving(null);
        }}
      />
    </div>
  );
}
