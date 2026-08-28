import type { UserRole } from "@prisma/client";

/**
 * Sidebar navigation, keyed by role. Kept as data so the shell renders the
 * same way for every portal and a new section is one entry, not a new branch.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Lucide icon name, resolved in the sidebar component. */
  icon: string;
  /** Match nested routes as active (e.g. /admin/publishers/<id>). */
  prefix?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: Record<UserRole, NavSection[]> = {
  SUPER_ADMIN: [
    {
      label: "Network",
      items: [
        { href: "/admin", label: "Overview", icon: "LayoutDashboard" },
        { href: "/admin/leads", label: "Lead Stream", icon: "Radio", prefix: true },
        { href: "/admin/disputes", label: "Dispute Queue", icon: "Gavel", prefix: true },
      ],
    },
    {
      label: "Supply",
      items: [
        { href: "/admin/publishers", label: "Publishers", icon: "Users", prefix: true },
        { href: "/admin/publishers/vetting", label: "Vetting Queue", icon: "ShieldCheck" },
        { href: "/admin/batches", label: "CSV Batches", icon: "FileSpreadsheet", prefix: true },
      ],
    },
    {
      label: "Demand",
      items: [
        { href: "/admin/buyers", label: "Buyers", icon: "Building2", prefix: true },
        { href: "/admin/campaigns", label: "Campaigns", icon: "Target", prefix: true },
      ],
    },
    {
      label: "Compliance",
      items: [
        { href: "/admin/suppression", label: "Suppression Lists", icon: "PhoneOff" },
        { href: "/admin/audit", label: "Admin Audit Log", icon: "ScrollText" },
      ],
    },
  ],
  PUBLISHER: [
    {
      label: "Portal",
      items: [
        { href: "/publisher", label: "Overview", icon: "LayoutDashboard" },
        { href: "/publisher/leads", label: "My Leads", icon: "Radio", prefix: true },
        { href: "/publisher/upload", label: "CSV Intake", icon: "CloudUpload" },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/publisher/sources", label: "Sources & API", icon: "Plug" },
        { href: "/publisher/vetting", label: "Vetting Status", icon: "ShieldCheck" },
        { href: "/publisher/payouts", label: "Payouts", icon: "Wallet" },
      ],
    },
  ],
  BUYER: [
    {
      label: "Portal",
      items: [
        { href: "/buyer", label: "Overview", icon: "LayoutDashboard" },
        { href: "/buyer/leads", label: "Delivery Queue", icon: "Inbox", prefix: true },
        { href: "/buyer/campaigns", label: "Campaigns", icon: "Target", prefix: true },
        { href: "/buyer/performance", label: "Performance", icon: "TrendingUp" },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/buyer/billing", label: "Billing", icon: "CircleDollarSign" }],
    },
  ],
};

export const PORTAL_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Network Operations",
  PUBLISHER: "Publisher Portal",
  BUYER: "Buyer Portal",
};
