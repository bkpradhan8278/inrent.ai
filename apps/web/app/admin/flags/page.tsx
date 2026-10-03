import type { Metadata } from "next";
import { FEATURE_FLAG_KEYS } from "@inrent/core";
import { prisma } from "@inrent/db";
import { PageHeader } from "@/components/dashboard/ui";
import { requireAdmin } from "@/lib/session";
import { FlagRow } from "./flag-row";

export const metadata: Metadata = { title: "Feature flags" };

export default async function AdminFlags() {
  const admin = await requireAdmin("flags:read");
  const flags = await prisma.featureFlag.findMany();
  return (
    <>
      <PageHeader title="Feature flags" description="Resolution order: environment override (INRENT_FLAG_<KEY>) → organization allowlist → global value. Changes apply within 15 seconds and are audit-logged." />
      <ul className="grid gap-3">
        {FEATURE_FLAG_KEYS.map((key) => {
          const f = flags.find((x) => x.key === key);
          const envOverride = process.env[`INRENT_FLAG_${key}`];
          return <FlagRow key={key} flagKey={key} description={f?.description ?? key} enabled={f?.enabled ?? false} allowlist={f?.orgAllowlist ?? []} envOverride={envOverride ?? null} canWrite={admin.can("flags:write")} />;
        })}
      </ul>
    </>
  );
}
