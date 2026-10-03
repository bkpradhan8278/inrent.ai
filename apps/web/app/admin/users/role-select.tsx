"use client";

import { useAction } from "@/components/dashboard/client-kit";
import { NativeSelect } from "@/components/ui/input";
import { setPlatformRoleAction } from "../actions";

const ROLES = ["USER", "READ_ONLY", "DEVELOPER", "SUPPORT", "FINANCE", "ADMIN", "SUPER_ADMIN"] as const;

export function RoleSelect({ userId, role }: { userId: string; role: (typeof ROLES)[number] }) {
  const { pending, run } = useAction();
  return (
    <NativeSelect
      aria-label="Platform role"
      value={role}
      disabled={pending}
      className="h-8 w-40 text-[13px]"
      onChange={(e) => {
        const next = e.target.value as (typeof ROLES)[number];
        if (next !== "USER" && !window.confirm(`Grant ${next.replace("_", " ").toLowerCase()} access to the admin console?`)) {
          e.target.value = role;
          return;
        }
        void run(() => setPlatformRoleAction(userId, next), { success: "Role updated" });
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r.toLowerCase().replace("_", " ")}
        </option>
      ))}
    </NativeSelect>
  );
}
