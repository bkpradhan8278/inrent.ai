/**
 * Authorization model.
 * - Organization roles (Membership.role) govern customer-facing resources.
 * - Platform roles (User.platformRole) govern the INRENT admin console.
 * Every server action checks a permission from these tables; there is no implicit access.
 */

export type MemberRole = "OWNER" | "ADMIN" | "DEVELOPER" | "BILLING" | "VIEWER";

export const ORG_PERMISSIONS = [
  "org:manage",
  "org:delete",
  "members:manage",
  "billing:read",
  "billing:manage",
  "keys:read",
  "keys:write",
  "projects:read",
  "projects:write",
  "usage:read",
  "logs:read",
  "logs:read_payloads",
  "webhooks:read",
  "webhooks:write",
  "byok:read",
  "byok:write",
  "mcp:read",
  "mcp:write",
  "agents:read",
  "agents:write",
  "settings:write",
  "playground:use",
  "audit:read",
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

const READ_ONLY: OrgPermission[] = [
  "keys:read",
  "projects:read",
  "usage:read",
  "logs:read",
  "webhooks:read",
  "byok:read",
  "mcp:read",
  "agents:read",
];

const ROLE_PERMISSIONS: Record<MemberRole, ReadonlySet<OrgPermission>> = {
  OWNER: new Set(ORG_PERMISSIONS),
  ADMIN: new Set(ORG_PERMISSIONS.filter((p) => p !== "org:delete")),
  DEVELOPER: new Set<OrgPermission>([
    ...READ_ONLY,
    "keys:write",
    "projects:write",
    "logs:read_payloads",
    "webhooks:write",
    "mcp:write",
    "agents:write",
    "playground:use",
  ]),
  BILLING: new Set<OrgPermission>(["billing:read", "billing:manage", "usage:read", "projects:read", "audit:read"]),
  VIEWER: new Set<OrgPermission>(READ_ONLY),
};

export function roleCan(role: MemberRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const MEMBER_ROLE_INFO: Record<MemberRole, string> = {
  OWNER: "Full control, including billing and deleting the organization.",
  ADMIN: "Manage members, projects, keys, billing and settings.",
  DEVELOPER: "Create keys, use the playground, read logs, manage webhooks.",
  BILLING: "Manage payment methods, credits and invoices.",
  VIEWER: "Read-only access to projects, usage and logs.",
};

export type PlatformRole = "USER" | "READ_ONLY" | "DEVELOPER" | "SUPPORT" | "FINANCE" | "ADMIN" | "SUPER_ADMIN";

export const ADMIN_PERMISSIONS = [
  "admin:access",
  "admin:roles",
  "users:read",
  "users:write",
  "orgs:read",
  "orgs:write",
  "providers:read",
  "providers:write",
  "models:read",
  "models:write",
  "pricing:write",
  "requests:read",
  "revenue:read",
  "billing:read",
  "refunds:write",
  "flags:read",
  "flags:write",
  "audit:read",
  "tickets:read",
  "tickets:write",
  "health:read",
  "gpu:read",
  "waitlist:read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ADMIN_READ: AdminPermission[] = ADMIN_PERMISSIONS.filter((p) => p.endsWith(":read") || p === "admin:access");

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<AdminPermission>> = {
  USER: new Set(),
  READ_ONLY: new Set(ADMIN_READ),
  DEVELOPER: new Set<AdminPermission>(["admin:access", "providers:read", "models:read", "health:read", "flags:read", "requests:read", "gpu:read"]),
  SUPPORT: new Set<AdminPermission>(["admin:access", "users:read", "orgs:read", "requests:read", "tickets:read", "tickets:write", "health:read", "waitlist:read"]),
  FINANCE: new Set<AdminPermission>(["admin:access", "orgs:read", "billing:read", "refunds:write", "revenue:read", "models:read", "providers:read"]),
  ADMIN: new Set(ADMIN_PERMISSIONS.filter((p) => p !== "admin:roles")),
  SUPER_ADMIN: new Set(ADMIN_PERMISSIONS),
};

export function platformRoleCan(role: PlatformRole, permission: AdminPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role].has(permission);
}

export const API_KEY_PERMISSIONS = ["inference", "keys:read", "keys:write", "usage:read", "logs:read"] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];
