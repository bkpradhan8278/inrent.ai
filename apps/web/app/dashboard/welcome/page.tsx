import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { getWorkspace } from "@/lib/session";
import { site } from "@/lib/site";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const ws = await getWorkspace();
  const hasKey = (await prisma.apiKey.count({ where: { organizationId: ws.org.id, revokedAt: null } })) > 0;
  return <WelcomeFlow name={ws.user.name.split(" ")[0] ?? ws.user.name} projectId={ws.project.id} projectName={ws.project.name} canCreateKey={ws.can("keys:write")} hasKey={hasKey} apiBase={site.apiBaseUrl} />;
}
