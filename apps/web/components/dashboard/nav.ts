import {
  BarChart3,
  Bell,
  Bot,
  Boxes,
  CreditCard,
  FolderKanban,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MessagesSquare,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Users,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface DashNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export const DASH_NAV: Array<{ title?: string; items: DashNavItem[] }> = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Playground", href: "/dashboard/playground", icon: MessagesSquare },
      { label: "Models", href: "/dashboard/models", icon: Boxes },
    ],
  },
  {
    title: "Build",
    items: [
      { label: "API Keys", href: "/dashboard/keys", icon: KeyRound },
      { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
      { label: "BYOK", href: "/dashboard/byok", icon: Plug },
      { label: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
      { label: "MCP", href: "/dashboard/mcp", icon: Wrench, badge: "Preview" },
      { label: "Agents", href: "/dashboard/agents", icon: Bot, badge: "Preview" },
    ],
  },
  {
    title: "Observe",
    items: [
      { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
      { label: "Logs", href: "/dashboard/logs", icon: ScrollText },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Limits", href: "/dashboard/limits", icon: Gauge },
      { label: "Team", href: "/dashboard/team", icon: Users },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
      { label: "Support", href: "/dashboard/support", icon: LifeBuoy },
    ],
  },
];

export const ADMIN_LINK: DashNavItem = { label: "Admin Console", href: "/admin", icon: Shield };
export { Bell };
