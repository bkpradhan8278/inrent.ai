import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { acceptInvitation, getInvitationPreview, inviteMember } from "../../src/orgs";
import { closeQueues } from "../../src/queue";
import { closeRedis } from "../../src/redis";
import { createOrg, createUser, resetDatabase } from "../../src/testing";

beforeEach(resetDatabase);
afterAll(async () => {
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});

async function teamWithSeats(maxMembers: number) {
  const owner = await createUser();
  const { org } = await createOrg(owner.id);
  const plan = await prisma.plan.create({ data: { slug: `seats-${org.id.slice(0, 8)}`, name: "Seats", description: "Seats", rpmLimit: 600, tpmLimit: 1_000_000, maxProjects: 10, maxMembers, features: [] } });
  await prisma.organization.update({ where: { id: org.id }, data: { planId: plan.id } });
  return { owner, org };
}

describe("team seats", () => {
  it("counts pending invitations against the plan's seats", async () => {
    const { owner, org } = await teamWithSeats(2);
    await inviteMember(owner.id, org.id, "first@example.com", "DEVELOPER");
    await expect(inviteMember(owner.id, org.id, "second@example.com", "DEVELOPER")).rejects.toThrow(/plan allows 2 members/);
  });

  it("refuses to accept an invitation once the seats are taken", async () => {
    const { owner, org } = await teamWithSeats(2);
    const { token } = await inviteMember(owner.id, org.id, "late@example.com", "DEVELOPER");
    // Another member joins by another route before the invitee accepts.
    const other = await createUser();
    await prisma.membership.create({ data: { organizationId: org.id, userId: other.id, role: "DEVELOPER" } });
    const invitee = await createUser({ email: "late@example.com" });
    await expect(acceptInvitation(invitee, token)).rejects.toThrow(/no free seats/);
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("lets an invitee accept when a seat is free", async () => {
    const { owner, org } = await teamWithSeats(2);
    const { token } = await inviteMember(owner.id, org.id, "ok@example.com", "DEVELOPER");
    const invitee = await createUser({ email: "ok@example.com" });
    expect(await acceptInvitation(invitee, token)).toBe(org.id);
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(2);
  });
});

describe("invitations", () => {
  it("replaces a pending invitation when the same address is invited again", async () => {
    const { owner, org } = await teamWithSeats(2);
    const first = await inviteMember(owner.id, org.id, "Again@Example.com", "DEVELOPER");
    const second = await inviteMember(owner.id, org.id, "again@example.com", "ADMIN");
    const pending = await prisma.invitation.findMany({ where: { organizationId: org.id, revokedAt: null, acceptedAt: null } });
    expect(pending.map((i) => [i.email, i.role])).toEqual([["again@example.com", "ADMIN"]]);
    const invitee = await createUser({ email: "again@example.com" });
    await expect(acceptInvitation(invitee, first.token)).rejects.toThrow(/not found/i);
    expect(await acceptInvitation(invitee, second.token)).toBe(org.id);
  });

  it("retires the invitee's other pending invitations when one is accepted", async () => {
    const { owner, org } = await teamWithSeats(5);
    // Two pending invitations to the same address, as older versions could create.
    const { token } = await inviteMember(owner.id, org.id, "dup@example.com", "DEVELOPER");
    await prisma.invitation.create({ data: { organizationId: org.id, email: "dup@example.com", role: "DEVELOPER", tokenHash: "legacy-duplicate", invitedById: owner.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    await acceptInvitation(await createUser({ email: "dup@example.com" }), token);
    expect(await prisma.invitation.count({ where: { organizationId: org.id, acceptedAt: null, revokedAt: null } })).toBe(0);
  });

  it("does not invite someone who is already a member", async () => {
    const { owner, org } = await teamWithSeats(5);
    const member = await createUser({ email: "member@example.com" });
    await prisma.membership.create({ data: { organizationId: org.id, userId: member.id, role: "DEVELOPER" } });
    await expect(inviteMember(owner.id, org.id, "member@example.com", "ADMIN")).rejects.toThrow(/already a member/);
  });

  it("previews who invited whom, and the invitation's state", async () => {
    const { owner, org } = await teamWithSeats(5);
    await prisma.user.update({ where: { id: owner.id }, data: { name: "Asha" } });
    await prisma.organization.update({ where: { id: org.id }, data: { name: "Acme" } });
    const { token } = await inviteMember(owner.id, org.id, "new@example.com", "DEVELOPER");
    expect(await getInvitationPreview(token)).toMatchObject({ organizationId: org.id, organizationName: "Acme", invitedByName: "Asha", email: "new@example.com", status: "pending" });
    await acceptInvitation(await createUser({ email: "new@example.com" }), token);
    expect(await getInvitationPreview(token)).toMatchObject({ status: "accepted" });
    expect(await getInvitationPreview("not-a-real-token")).toBeNull();
  });
});
