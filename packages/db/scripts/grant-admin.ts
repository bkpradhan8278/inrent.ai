/**
 * Grants a platform (admin console) role to an existing user.
 *   pnpm admin:grant --email you@company.com --role SUPER_ADMIN
 * Roles: USER, READ_ONLY, DEVELOPER, SUPPORT, FINANCE, ADMIN, SUPER_ADMIN
 * Writes an audit log entry. There is intentionally no self-service path to admin roles.
 */
import { PrismaClient, type PlatformRole } from "@prisma/client";

const ROLES: PlatformRole[] = ["USER", "READ_ONLY", "DEVELOPER", "SUPPORT", "FINANCE", "ADMIN", "SUPER_ADMIN"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const role = (arg("role") ?? "SUPER_ADMIN").toUpperCase() as PlatformRole;
  if (!email || !ROLES.includes(role)) {
    console.error(`Usage: pnpm admin:grant --email <email> --role <${ROLES.join("|")}>`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new Error(`No user with email ${email}. Sign up first.`);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { platformRole: role } }),
      prisma.auditLog.create({
        data: {
          actorType: "SYSTEM",
          actorId: "cli:admin:grant",
          action: "admin.role_granted",
          targetType: "user",
          targetId: user.id,
          metadata: { from: user.platformRole, to: role },
        },
      }),
    ]);
    console.log(`Granted ${role} to ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
