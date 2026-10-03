import { describe, expect, it } from "vitest";
import { evaluateFlag } from "../src/flags";
import { platformRoleCan, roleCan } from "../src/rbac";

describe("rbac", () => {
  it("grants owners everything and viewers read-only access", () => {
    expect(roleCan("OWNER", "org:delete")).toBe(true);
    expect(roleCan("ADMIN", "org:delete")).toBe(false);
    expect(roleCan("VIEWER", "keys:read")).toBe(true);
    expect(roleCan("VIEWER", "keys:write")).toBe(false);
    expect(roleCan("VIEWER", "logs:read_payloads")).toBe(false);
    expect(roleCan("BILLING", "billing:manage")).toBe(true);
    expect(roleCan("BILLING", "keys:write")).toBe(false);
    expect(roleCan("DEVELOPER", "billing:manage")).toBe(false);
    expect(roleCan("DEVELOPER", "members:manage")).toBe(false);
  });

  it("restricts the admin console by platform role", () => {
    expect(platformRoleCan("USER", "admin:access")).toBe(false);
    expect(platformRoleCan("SUPPORT", "pricing:write")).toBe(false);
    expect(platformRoleCan("FINANCE", "refunds:write")).toBe(true);
    expect(platformRoleCan("ADMIN", "admin:roles")).toBe(false);
    expect(platformRoleCan("SUPER_ADMIN", "admin:roles")).toBe(true);
    expect(platformRoleCan("READ_ONLY", "providers:write")).toBe(false);
    expect(platformRoleCan("READ_ONLY", "providers:read")).toBe(true);
  });
});

describe("feature flags", () => {
  const record = { key: "MCP_ENABLED", enabled: false, orgAllowlist: ["org-1"] };
  it("resolves env override, allowlist, then stored value", () => {
    expect(evaluateFlag("MCP_ENABLED", record)).toBe(false);
    expect(evaluateFlag("MCP_ENABLED", record, { organizationId: "org-1" })).toBe(true);
    expect(evaluateFlag("MCP_ENABLED", record, { env: { INRENT_FLAG_MCP_ENABLED: "true" } })).toBe(true);
    expect(evaluateFlag("MCP_ENABLED", { ...record, enabled: true }, { env: { INRENT_FLAG_MCP_ENABLED: "false" } })).toBe(false);
    expect(evaluateFlag("GPU_CLOUD_ENABLED", undefined)).toBe(false);
  });
});
