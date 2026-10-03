"use server";

import { revalidatePath } from "next/cache";
import { usdToNano, type AdminPermission } from "@inrent/core";
import type { HealthStatus, IntegrationMode, ModelStatus, PlatformRole, VerificationStatus } from "@inrent/db";
import {
  adjustCredits,
  createIncident,
  ServiceError,
  setEndpointPrice,
  setFeatureFlag,
  setOrganizationPlan,
  setOrganizationSuspended,
  setPlatformRole,
  updateEndpoint,
  updateIncident,
  updateModel,
  updateProvider,
  updateTicketStatus,
  type PriceInput,
} from "@inrent/services";
import { requireAdmin } from "@/lib/session";

export type AdminResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Every admin action re-checks the platform role server-side; services check again. */
async function run<T>(permission: AdminPermission, fn: (adminId: string) => Promise<T>, revalidate: string): Promise<AdminResult<T>> {
  const admin = await requireAdmin(permission);
  try {
    const data = await fn(admin.user.id);
    revalidatePath(revalidate);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    console.error("[admin action]", e);
    return { ok: false, error: "Something went wrong." };
  }
}

export async function updateProviderAction(
  id: string,
  input: { enabled?: boolean; priority?: number; integrationMode?: IntegrationMode; resaleVerified?: boolean; termsUrl?: string | null; termsNotes?: string | null; baseUrl?: string; credentialRef?: string | null; costMultiplier?: string; byokSupported?: boolean; healthStatus?: HealthStatus },
) {
  return run("providers:write", async (adminId) => {
    await updateProvider(adminId, id, input);
  }, "/admin/providers");
}

export async function updateModelAction(
  id: string,
  input: { status?: ModelStatus; verificationStatus?: VerificationStatus; verificationNotes?: string | null; license?: string | null; licenseUrl?: string | null; commercialUse?: boolean | null; resaleAllowed?: boolean | null; featured?: boolean; isPublic?: boolean; qualityTier?: number },
) {
  return run("models:write", async (adminId) => {
    await updateModel(adminId, id, input);
  }, "/admin/models");
}

export async function updateEndpointAction(id: string, input: { enabled?: boolean; priority?: number; providerModelId?: string }) {
  return run("models:write", async (adminId) => {
    await updateEndpoint(adminId, id, input);
  }, "/admin/models");
}

export async function setEndpointPriceAction(endpointId: string, input: PriceInput) {
  return run("pricing:write", async (adminId) => {
    await setEndpointPrice(adminId, endpointId, input);
  }, "/admin/models");
}

export async function setPlatformRoleAction(userId: string, role: PlatformRole) {
  return run("admin:roles", (adminId) => setPlatformRole(adminId, userId, role), "/admin/users");
}

export async function setOrgSuspendedAction(orgId: string, suspended: boolean, reason: string) {
  return run("orgs:write", (adminId) => setOrganizationSuspended(adminId, orgId, suspended, reason), "/admin/organizations");
}

export async function setOrgPlanAction(orgId: string, plan: string) {
  return run("orgs:write", (adminId) => setOrganizationPlan(adminId, orgId, plan), "/admin/organizations");
}

/** Credit adjustments carry a client-generated idempotency key so a double submit can't apply twice. */
export async function adjustCreditsAction(input: { orgId: string; amountUsd: string; reason: string; type: "ADJUSTMENT" | "REFUND" | "PROMO"; idempotencyKey: string }) {
  return run("refunds:write", async (adminId) => {
    if (!/^[A-Za-z0-9-]{16,64}$/.test(input.idempotencyKey)) throw new ServiceError("validation_error", "Invalid idempotency key.");
    const negative = input.amountUsd.trim().startsWith("-");
    let magnitude: bigint;
    try {
      magnitude = usdToNano(input.amountUsd.trim().replace(/^-/, ""));
    } catch {
      throw new ServiceError("validation_error", "Enter a valid USD amount, e.g. 10 or -2.50.");
    }
    await adjustCredits(adminId, { organizationId: input.orgId, amountNano: negative ? -magnitude : magnitude, reason: input.reason, type: input.type, idempotencyKey: `admin:${input.idempotencyKey}` });
  }, "/admin/organizations");
}

export async function setFlagAction(key: string, input: { enabled?: boolean; orgAllowlist?: string[] }) {
  return run("flags:write", async (adminId) => {
    await setFeatureFlag(adminId, key, input);
  }, "/admin/flags");
}

export async function updateTicketAction(id: string, status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED") {
  return run("tickets:write", (adminId) => updateTicketStatus(adminId, id, status), "/admin/support");
}

export async function createIncidentAction(input: { title: string; body: string; impact: "NONE" | "MINOR" | "MAJOR" | "CRITICAL"; components: string[] }) {
  return run("incidents:write", async (adminId) => {
    await createIncident(adminId, input);
  }, "/admin/system");
}

export async function updateIncidentAction(id: string, input: { status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED"; body?: string }) {
  return run("incidents:write", (adminId) => updateIncident(adminId, id, input), "/admin/system");
}
