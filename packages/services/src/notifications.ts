import { Prisma, prisma } from "@inrent/db";

export interface NotifyInput {
  organizationId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string;
  /** Prevents duplicate notifications for the same underlying event. */
  dedupeKey?: string;
}

export async function notify(input: NotifyInput): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 500),
        link: input.link,
        dedupeKey: input.dedupeKey,
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function listNotifications(userId: string, organizationId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { organizationId, OR: [{ userId: null }, { userId }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationsRead(userId: string, organizationId: string) {
  await prisma.notification.updateMany({
    where: { organizationId, readAt: null, OR: [{ userId: null }, { userId }] },
    data: { readAt: new Date() },
  });
}
