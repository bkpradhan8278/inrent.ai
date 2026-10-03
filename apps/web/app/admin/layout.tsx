import { ADMIN_PERMISSIONS, platformRoleCan } from "@inrent/core";
import { AdminShell } from "@/components/admin/shell";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: { default: "Admin", template: "%s · INRENT Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminShell role={admin.role} permissions={ADMIN_PERMISSIONS.filter((p) => platformRoleCan(admin.role, p))} user={{ name: admin.user.name, email: admin.user.email }}>
      {children}
    </AdminShell>
  );
}
