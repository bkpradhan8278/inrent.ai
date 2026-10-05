import { CircleCheck, FileSearch, Lock, ScrollText, ShieldAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { SectionHeading } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "MCP — connect AI models to tools",
  description: "Register Model Context Protocol servers with least-privilege permissions, explicit approvals and audit logs.",
  alternates: { canonical: "/mcp" },
};

const SERVERS = ["GitHub", "Slack", "Notion", "Google Drive", "Postgres", "Filesystem", "Custom MCP"];

export default function McpPage() {
  return (
    <>
      <PageHero eyebrow="MCP · preview" title="Connect AI models to tools." description="Register Model Context Protocol servers for your organization, decide exactly which tools are allowed, and keep an audit trail of every change. Tool execution through the gateway is on the roadmap.">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/mcp">Open MCP console</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/docs/mcp">Read the docs</Link>
          </Button>
        </div>
      </PageHero>
      <section className="container-page grid gap-12 py-20 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading eyebrow="Guardrails first" title="Least privilege, by default." />
          <ul className="flex flex-col gap-4">
            {[
              { icon: Lock, t: "Read, write, admin", d: "Every server has a maximum permission level; every tool sits at or below it." },
              { icon: CircleCheck, t: "Nothing auto-enabled", d: "Tools start disabled. Write, admin and destructive tools need an owner or admin to approve." },
              { icon: ShieldAlert, t: "SSRF-safe connections", d: "Server URLs are validated and private-network destinations are rejected." },
              { icon: ScrollText, t: "Audit logs", d: "Server changes, approvals and revocations are recorded with who and when." },
              { icon: FileSearch, t: "Encrypted credentials", d: "Server tokens are stored with AES-256-GCM and never shown again." },
            ].map((x) => (
              <li key={x.t} className="flex gap-3">
                <x.icon className="mt-0.5 size-4 shrink-0 text-accent" />
                <div>
                  <div className="text-sm font-medium text-fg">{x.t}</div>
                  <div className="text-sm text-fg-muted">{x.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <div className="panel rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <Wrench className="size-4 text-accent" /> Supported server templates
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SERVERS.map((s) => (
                <Badge key={s} variant="neutral" className="px-2.5 py-1 text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <CodeBlock
            title="tool permission model"
            lang="json"
            code={`{
  "server": "github",
  "max_permission": "read",
  "tools": [
    { "name": "search_issues", "permission": "read",  "enabled": true,  "approved_by": "owner" },
    { "name": "create_issue",  "permission": "write", "enabled": false, "requires": "admin approval" }
  ]
}`}
          />
        </div>
      </section>
    </>
  );
}
