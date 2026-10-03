/**
 * Test fixtures shared by integration suites (services, gateway). Never import from app code.
 */
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@inrent/db";

const TABLES_TO_KEEP = new Set(["_prisma_migrations"]);

export async function resetDatabase(): Promise<void> {
  if (!/_test\b|_test\?|inrent_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing to reset a database whose name does not contain '_test'");
  }
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const names = tables.map((t) => t.tablename).filter((t) => !TABLES_TO_KEEP.has(t));
  if (names.length) await prisma.$executeRawUnsafe(`TRUNCATE ${names.map((n) => `"${n}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function createUser(overrides: Partial<{ email: string; name: string; platformRole: "USER" | "ADMIN" | "SUPER_ADMIN" | "SUPPORT" | "FINANCE" | "READ_ONLY" | "DEVELOPER" }> = {}) {
  const id = randomUUID();
  return prisma.user.create({
    data: { id, email: overrides.email ?? `${id}@test.local`, name: overrides.name ?? "Test User", emailVerified: true, platformRole: overrides.platformRole ?? "USER" },
  });
}

export async function createPlan(slug = "developer") {
  return prisma.plan.upsert({
    where: { slug },
    create: { slug, name: slug, description: slug, rpmLimit: 600, tpmLimit: 1_000_000, maxProjects: 10, maxMembers: 10, features: [] },
    update: {},
  });
}

export async function createOrg(ownerId: string, opts: { balanceNano?: bigint; rpm?: number; tpm?: number; type?: "PERSONAL" | "TEAM" } = {}) {
  const plan = await prisma.plan.upsert({
    where: { slug: `test-${opts.rpm ?? 600}-${opts.tpm ?? 1_000_000}` },
    create: { slug: `test-${opts.rpm ?? 600}-${opts.tpm ?? 1_000_000}`, name: "Test", description: "Test", rpmLimit: opts.rpm ?? 600, tpmLimit: opts.tpm ?? 1_000_000, maxProjects: 10, maxMembers: 10, features: [] },
    update: {},
  });
  const org = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-${randomUUID().slice(0, 8)}`,
      type: opts.type ?? "TEAM",
      planId: plan.id,
      memberships: { create: { userId: ownerId, role: "OWNER" } },
      creditBalance: { create: { balanceNano: opts.balanceNano ?? 0n } },
      projects: { create: { name: "Default", slug: "default", isDefault: true } },
    },
    include: { projects: true },
  });
  return { org, project: org.projects[0]! };
}

export interface MockCatalogOptions {
  primaryFail?: "never" | "always" | "rate_limit" | "bad_request";
  backupFail?: "never" | "always";
  providerEnabled?: boolean;
  markupPct?: string;
  integrationMode?: "SELF_HOSTED" | "BYOK" | "DIRECT_RESALE";
  verification?: "VERIFIED" | "NEEDS_REVIEW";
}

/** Creates a two-provider mock catalog for "test/echo" so routing and fallback can be exercised. */
export async function createMockCatalog(opts: MockCatalogOptions = {}) {
  const mk = (slug: string, fail: string, priority: number) =>
    prisma.provider.create({
      data: {
        slug,
        name: slug,
        adapter: "MOCK",
        baseUrl: `mock://local?fail=${fail}&delay=0`,
        integrationMode: opts.integrationMode ?? "SELF_HOSTED",
        resaleVerified: true,
        byokSupported: opts.integrationMode === "BYOK",
        enabled: opts.providerEnabled ?? true,
        priority,
        healthStatus: "HEALTHY",
      },
    });
  const primary = await mk("mock-primary", opts.primaryFail ?? "never", 1);
  const backup = await mk("mock-backup", opts.backupFail ?? "never", 2);
  const model = await prisma.model.create({
    data: {
      slug: "test/echo",
      displayName: "Test Echo",
      vendor: "test",
      description: "Mock",
      capabilities: ["chat", "streaming", "embedding"],
      modalitiesOut: ["text"],
      contextLength: 32_000,
      license: "test",
      commercialUse: true,
      resaleAllowed: true,
      status: "ACTIVE",
      verificationStatus: opts.verification ?? "VERIFIED",
      isDevOnly: true,
    },
  });
  for (const [i, p] of [primary, backup].entries()) {
    await prisma.modelProvider.create({
      data: {
        modelId: model.id,
        providerId: p.id,
        providerModelId: "echo",
        enabled: true,
        priority: 100 + i,
        supportsTools: true,
        supportsJsonMode: true,
        healthStatus: "HEALTHY",
        latencyP50Ms: 100 + i * 100,
        prices: {
          create: {
            inputPerMTok: new Prisma.Decimal("1"),
            outputPerMTok: new Prisma.Decimal("2"),
            platformMarkupPct: new Prisma.Decimal(opts.markupPct ?? "10"),
            pricingSource: "test",
            active: true,
          },
        },
      },
    });
  }
  return { model, primary, backup };
}
