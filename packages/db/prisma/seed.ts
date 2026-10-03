/**
 * Seed script — idempotent.
 *
 * Always seeds: plans, feature flags, provider/model catalog placeholders, GPU provider placeholders.
 * Development only (INRENT_ENV != production and SEED_DEMO_DATA != "false"):
 *   - development mock providers/models (clearly labelled, refused by the gateway in production)
 *   - a demo user/organization with demo credits and DEMO usage history
 *
 * Admin decisions (enabled flags, integration modes, prices, verification) are never
 * overwritten on re-seed.
 */
import { randomUUID } from "node:crypto";
import { generateApiKey, hashApiKey } from "@inrent/core/server";
import { hashPassword } from "better-auth/crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { FEATURE_FLAGS, MODELS, PLANS, PROVIDERS } from "./catalog";

const prisma = new PrismaClient();
const env = process.env.INRENT_ENV ?? process.env.NODE_ENV ?? "development";
const isProduction = env === "production";
const seedDemo = !isProduction && process.env.SEED_DEMO_DATA !== "false";

async function seedPlans() {
  for (const plan of PLANS) {
    const data = {
      name: plan.name,
      description: plan.description,
      isPayAsYouGo: plan.isPayAsYouGo,
      rpmLimit: plan.rpmLimit,
      tpmLimit: plan.tpmLimit,
      maxProjects: plan.maxProjects,
      maxMembers: plan.maxMembers,
      logRetentionDays: plan.logRetentionDays,
      features: [...plan.features],
      highlighted: "highlighted" in plan ? plan.highlighted : false,
      available: "available" in plan ? plan.available : true,
      contactSales: "contactSales" in plan ? plan.contactSales : false,
      sortOrder: plan.sortOrder,
    };
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: { slug: plan.slug, priceMonthlyCents: plan.priceMonthlyCents, ...data },
      update: {},
    });
  }
}

async function seedFlags() {
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { key: flag.key, description: flag.description, enabled: flag.enabled },
      update: { description: flag.description },
    });
  }
}

async function seedCatalog() {
  const providerIds = new Map<string, string>();
  for (const p of PROVIDERS) {
    const provider = await prisma.provider.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        websiteUrl: p.websiteUrl,
        adapter: p.adapter,
        baseUrl: p.baseUrl,
        credentialRef: p.credentialRef,
        integrationMode: p.integrationMode,
        termsUrl: p.termsUrl,
        termsNotes: p.termsNotes,
        supportedEndpoints: p.supportedEndpoints,
        priority: p.priority,
        byokSupported: p.byokSupported ?? true,
        enabled: false,
      },
      update: { name: p.name, description: p.description, websiteUrl: p.websiteUrl, supportedEndpoints: p.supportedEndpoints },
    });
    providerIds.set(p.slug, provider.id);
  }

  for (const m of MODELS) {
    const model = await prisma.model.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        displayName: m.displayName,
        vendor: m.vendor,
        family: m.family,
        description: m.description,
        modalitiesIn: m.modalitiesIn,
        modalitiesOut: m.modalitiesOut,
        capabilities: m.capabilities,
        contextLength: m.contextLength ?? null,
        openWeights: m.openWeights ?? false,
        documentationUrl: m.documentationUrl,
        featured: m.featured ?? false,
        qualityTier: m.qualityTier ?? 2,
        status: "PREVIEW",
        verificationStatus: "NEEDS_REVIEW",
        verificationNotes: "Seeded placeholder. Verify license, provider terms, context length and pricing before enabling.",
      },
      update: { description: m.description, documentationUrl: m.documentationUrl },
    });
    for (const [index, e] of m.endpoints.entries()) {
      const providerId = providerIds.get(e.provider);
      if (!providerId) throw new Error(`Unknown provider ${e.provider} for ${m.slug}`);
      const endpoint = await prisma.modelProvider.upsert({
        where: { modelId_providerId_providerModelId: { modelId: model.id, providerId, providerModelId: e.providerModelId } },
        create: {
          modelId: model.id,
          providerId,
          providerModelId: e.providerModelId,
          enabled: false,
          priority: 100 + index,
          supportsTools: e.supportsTools ?? false,
          supportsJsonMode: e.supportsJsonMode ?? false,
          supportsStructuredOutput: e.supportsStructuredOutput ?? false,
          supportsVision: e.supportsVision ?? false,
          contextLength: m.contextLength ?? null,
        },
        update: {},
      });
      // Record where the price must be verified from — without inventing a price.
      if (e.pricingSource) {
        const existing = await prisma.modelPrice.findFirst({ where: { modelProviderId: endpoint.id } });
        if (!existing) {
          await prisma.modelPrice.create({
            data: {
              modelProviderId: endpoint.id,
              pricingSource: e.pricingSource,
              active: false,
              platformMarkupPct: new Prisma.Decimal(process.env.DEFAULT_PLATFORM_MARKUP_PCT ?? "0"),
            },
          });
        }
      }
    }
  }
}

async function seedGpuProviders() {
  const gpu: Array<{ slug: string; name: string; adapter: "VAST" | "RUNPOD" | "LAMBDA" | "COREWEAVE" | "INRENT" | "MOCK"; credentialRef: string | null }> = [
    { slug: "vast", name: "Vast.ai", adapter: "VAST", credentialRef: "env:VAST_API_KEY" },
    { slug: "runpod", name: "RunPod", adapter: "RUNPOD", credentialRef: "env:RUNPOD_API_KEY" },
    { slug: "lambda", name: "Lambda", adapter: "LAMBDA", credentialRef: "env:LAMBDA_API_KEY" },
    { slug: "coreweave", name: "CoreWeave", adapter: "COREWEAVE", credentialRef: "env:COREWEAVE_API_KEY" },
    { slug: "inrent", name: "INRENT GPU Cloud", adapter: "INRENT", credentialRef: null },
  ];
  if (!isProduction) gpu.push({ slug: "mock-gpu", name: "Mock GPU provider (development)", adapter: "MOCK", credentialRef: null });
  for (const g of gpu) {
    await prisma.gpuProvider.upsert({
      where: { slug: g.slug },
      create: { ...g, enabled: false },
      update: { name: g.name },
    });
  }
}

/** Deterministic PRNG so demo data is identical on every seed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedDevMocks() {
  const mockProviders = [
    { slug: "inrent-mock", name: "Development mock", priority: 1, latency: 180 },
    { slug: "inrent-mock-backup", name: "Development mock (backup)", priority: 2, latency: 320 },
  ];
  const ids: string[] = [];
  for (const p of mockProviders) {
    const provider = await prisma.provider.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        description: "Deterministic local mock used for development and tests. Never available in production.",
        adapter: "MOCK",
        baseUrl: "mock://local",
        credentialRef: null,
        integrationMode: "SELF_HOSTED",
        resaleVerified: true,
        byokSupported: false,
        enabled: true,
        priority: p.priority,
        supportedEndpoints: ["chat", "embeddings", "responses"],
        healthStatus: "HEALTHY",
        latencyP50Ms: p.latency,
      },
      update: {},
    });
    ids.push(provider.id);
  }

  const mocks = [
    {
      slug: "inrent/mock-echo",
      displayName: "Mock Echo (dev)",
      description: "Development-only mock chat model. Echoes your prompt deterministically. Not a real model.",
      capabilities: ["chat", "streaming", "tools", "json_mode"],
      modalitiesOut: ["text"],
      price: { input: "0.50", output: "1.50" },
    },
    {
      slug: "inrent/mock-embed",
      displayName: "Mock Embeddings (dev)",
      description: "Development-only mock embedding model returning deterministic vectors. Not a real model.",
      capabilities: ["embedding"],
      modalitiesOut: ["embedding"],
      price: { input: "0.02", output: "0" },
    },
  ];
  for (const m of mocks) {
    const model = await prisma.model.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        displayName: m.displayName,
        vendor: "inrent",
        family: "mock",
        description: m.description,
        modalitiesIn: ["text"],
        modalitiesOut: m.modalitiesOut,
        capabilities: m.capabilities,
        contextLength: 32768,
        license: "Development mock",
        commercialUse: true,
        resaleAllowed: true,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        verificationNotes: "Development mock — refused by the gateway in production.",
        isDevOnly: true,
        qualityTier: 1,
      },
      update: {},
    });
    for (const [i, providerId] of ids.entries()) {
      const endpoint = await prisma.modelProvider.upsert({
        where: { modelId_providerId_providerModelId: { modelId: model.id, providerId, providerModelId: m.slug.split("/")[1]! } },
        create: {
          modelId: model.id,
          providerId,
          providerModelId: m.slug.split("/")[1]!,
          enabled: true,
          priority: 100 + i,
          supportsTools: m.capabilities.includes("tools"),
          supportsJsonMode: m.capabilities.includes("json_mode"),
          contextLength: 32768,
          healthStatus: "HEALTHY",
          latencyP50Ms: i === 0 ? 180 : 320,
          ttftP50Ms: i === 0 ? 60 : 110,
        },
        update: {},
      });
      const hasPrice = await prisma.modelPrice.findFirst({ where: { modelProviderId: endpoint.id, active: true } });
      if (!hasPrice) {
        await prisma.modelPrice.create({
          data: {
            modelProviderId: endpoint.id,
            inputPerMTok: new Prisma.Decimal(m.price.input),
            outputPerMTok: new Prisma.Decimal(m.price.output),
            platformMarkupPct: new Prisma.Decimal("5.5"),
            pricingSource: "development-demo (not a real price)",
            active: true,
          },
        });
      }
    }
  }
}

async function seedDemoOrganization() {
  const email = "demo@inrent.local";
  const password = process.env.SEED_DEMO_PASSWORD ?? "inrent-demo-password";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const id = randomUUID();
    user = await prisma.user.create({
      data: {
        id,
        email,
        name: "Demo Developer",
        emailVerified: true,
        platformRole: "SUPER_ADMIN",
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) },
        },
      },
    });
  }

  const developerPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: "developer" } });
  let org = await prisma.organization.findUnique({ where: { slug: "demo-workspace" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Demo Workspace",
        slug: "demo-workspace",
        type: "TEAM",
        isDemo: true,
        planId: developerPlan.id,
        memberships: { create: { userId: user.id, role: "OWNER" } },
        creditBalance: { create: { balanceNano: 0n } },
        projects: {
          create: [
            { name: "Demo App", slug: "demo-app", isDefault: true, description: "Default project (demo data)" },
            { name: "Production", slug: "production", description: "Demo production project" },
          ],
        },
      },
    });
    const grant = 25_000_000_000n;
    await prisma.$transaction([
      prisma.creditBalance.update({ where: { organizationId: org.id }, data: { balanceNano: grant } }),
      prisma.creditTransaction.create({
        data: {
          organizationId: org.id,
          type: "PROMO",
          amountNano: grant,
          balanceAfterNano: grant,
          description: "Development demo credits (not purchasable value)",
          idempotencyKey: `seed:demo-credits:${org.id}`,
        },
      }),
    ]);
  }

  const project = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id, isDefault: true } });
  const pepper = process.env.API_KEY_PEPPER;
  const existingKey = await prisma.apiKey.findFirst({ where: { organizationId: org.id, name: "Demo key" } });
  if (!existingKey && pepper) {
    const key = generateApiKey("DEVELOPMENT");
    await prisma.apiKey.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        createdById: user.id,
        name: "Demo key",
        displayPrefix: key.displayPrefix,
        lastFour: key.lastFour,
        keyHash: hashApiKey(key.secret, pepper),
        environment: "DEVELOPMENT",
        permissions: ["inference", "keys:read", "keys:write", "usage:read", "logs:read"],
      },
    });
    console.log(`\n  Demo API key (shown once): ${key.secret}\n`);
  }

  const already = await prisma.request.count({ where: { organizationId: org.id, isDemo: true } });
  if (already === 0) await seedDemoUsage(org.id, project.id);

  console.log(`  Demo login: ${email} / ${password}  (development only, SUPER_ADMIN for exploring the admin console)`);
}

async function seedDemoUsage(organizationId: string, projectId: string) {
  const rand = mulberry32(42);
  const endpoints = await prisma.modelProvider.findMany({
    where: { model: { slug: "inrent/mock-echo" } },
    include: { provider: true, prices: { where: { active: true } } },
  });
  const primary = endpoints.find((e) => e.provider.slug === "inrent-mock");
  const backup = endpoints.find((e) => e.provider.slug === "inrent-mock-backup");
  if (!primary || !backup) return;
  const day = 24 * 60 * 60 * 1000;
  // Spread over the 30 days ending now — never in the future.
  const now = Date.now();
  const rows: Prisma.RequestCreateManyInput[] = [];
  for (let d = 29; d >= 0; d--) {
    const count = 20 + Math.floor(rand() * 40) + (29 - d);
    for (let i = 0; i < count; i++) {
      const useBackup = rand() < 0.12;
      const failed = rand() < 0.03;
      const ep = useBackup ? backup : primary;
      const input = 200 + Math.floor(rand() * 1800);
      const output = failed ? 0 : 50 + Math.floor(rand() * 900);
      // Demo prices $0.50 / $1.50 per 1M tokens → 500 / 1500 nano-USD per token, 5.5% markup.
      const providerCost = BigInt(input * 500 + output * 1500);
      const userCharge = (providerCost * 1055n + 999n) / 1000n;
      const createdAt = new Date(now - d * day - Math.floor(rand() * day));
      rows.push({
        requestId: `req_demo_${d}_${i}`,
        organizationId,
        projectId,
        endpoint: "chat.completions",
        modelRequested: "inrent/mock-echo",
        modelSlug: "inrent/mock-echo",
        providerSlug: ep.provider.slug,
        modelProviderId: ep.id,
        providerModelId: ep.providerModelId,
        billingMode: "PLATFORM",
        status: failed ? "ERROR" : "SUCCESS",
        httpStatus: failed ? 502 : 200,
        errorType: failed ? "provider_error" : null,
        errorCode: failed ? "provider_error" : null,
        errorMessage: failed ? "Demo: simulated upstream failure" : null,
        stream: rand() < 0.5,
        finishReason: failed ? null : "stop",
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        providerCostNano: failed ? 0n : providerCost,
        userChargeNano: failed ? 0n : userCharge,
        marginNano: failed ? 0n : userCharge - providerCost,
        latencyMs: (useBackup ? 300 : 150) + Math.floor(rand() * 900),
        ttftMs: (useBackup ? 90 : 40) + Math.floor(rand() * 200),
        fallbackCount: useBackup ? 1 : 0,
        isDemo: true,
        source: "demo",
        createdAt,
      });
    }
  }
  await prisma.request.createMany({ data: rows });

  // Roll up into UsageDaily (same logic the worker uses for real traffic).
  const byKey = new Map<string, Prisma.UsageDailyCreateManyInput>();
  for (const r of rows) {
    const date = new Date(r.createdAt as Date);
    date.setUTCHours(0, 0, 0, 0);
    const key = `${date.toISOString()}|${r.providerSlug}`;
    const agg = byKey.get(key) ?? {
      date,
      organizationId,
      projectId,
      apiKeyId: "",
      modelSlug: r.modelSlug!,
      providerSlug: r.providerSlug!,
      billingMode: "PLATFORM" as const,
      requests: 0,
      errors: 0,
      inputTokens: 0n,
      outputTokens: 0n,
      cachedTokens: 0n,
      providerCostNano: 0n,
      userChargeNano: 0n,
      latencyMsSum: 0n,
      isDemo: true,
    };
    agg.requests = (agg.requests ?? 0) + 1;
    agg.errors = (agg.errors ?? 0) + (r.status === "ERROR" ? 1 : 0);
    agg.inputTokens = BigInt(agg.inputTokens ?? 0) + BigInt(r.inputTokens ?? 0);
    agg.outputTokens = BigInt(agg.outputTokens ?? 0) + BigInt(r.outputTokens ?? 0);
    agg.providerCostNano = BigInt(agg.providerCostNano ?? 0) + BigInt(r.providerCostNano ?? 0);
    agg.userChargeNano = BigInt(agg.userChargeNano ?? 0) + BigInt(r.userChargeNano ?? 0);
    agg.latencyMsSum = BigInt(agg.latencyMsSum ?? 0) + BigInt(r.latencyMs ?? 0);
    byKey.set(key, agg);
  }
  await prisma.usageDaily.createMany({ data: [...byKey.values()], skipDuplicates: true });
}

async function main() {
  console.log(`Seeding INRENT (${env})…`);
  await seedPlans();
  await seedFlags();
  await seedCatalog();
  await seedGpuProviders();
  if (seedDemo) {
    await seedDevMocks();
    await seedDemoOrganization();
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
