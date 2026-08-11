/**
 * Navigation, taken from the approved prototype rather than invented.
 *
 * Two workspaces: internal staff and the supplier-facing portal. The top bar
 * switches between them, which is why the supplier side lives under its own path
 * prefix — the workspace you are in is a property of where you are, not of a
 * setting held somewhere off-screen.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /// False where the module has not been built yet. The item still appears — the
  /// shape of the portal is agreed — but it lands on a page that says so plainly.
  built?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/// Grouping matches the prototype exactly — note that Documents sits under Supply
/// base, not Insight, and Insight holds Reports alone.
export const STAFF_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: "grid", built: true }],
  },
  {
    label: "Work",
    items: [
      { href: "/sourcing", label: "Sourcing", icon: "globe" },
      { href: "/projects", label: "Projects", icon: "tools" },
    ],
  },
  {
    label: "Supply base",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: "building" },
      { href: "/documents", label: "Documents", icon: "files" },
    ],
  },
  {
    label: "Insight",
    items: [{ href: "/reports", label: "Reports", icon: "chart" }],
  },
  {
    label: "Administration",
    items: [{ href: "/configuration", label: "Configuration", icon: "sliders", built: true }],
  },
];

export const SUPPLIER_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/supplier", label: "Home", icon: "grid" }],
  },
  {
    label: "Business",
    items: [
      { href: "/supplier/opportunities", label: "Opportunities", icon: "globe" },
      { href: "/supplier/bids", label: "My Bids", icon: "inbox" },
      { href: "/supplier/projects", label: "My Projects", icon: "tools" },
    ],
  },
  {
    label: "My company",
    items: [{ href: "/supplier/company", label: "Company", icon: "building" }],
  },
];

export type Workspace = "internal" | "supplier";

export function workspaceFor(pathname: string): Workspace {
  return pathname === "/supplier" || pathname.startsWith("/supplier/") ? "supplier" : "internal";
}

export function navFor(workspace: Workspace): NavGroup[] {
  return workspace === "supplier" ? SUPPLIER_NAV : STAFF_NAV;
}

/// Sections of the Configuration area, in the prototype's own grouping and order.
export const CONFIG_SECTIONS: {
  group: string;
  items: { href: string; label: string; description: string; icon: string; built?: boolean }[];
}[] = [
  {
    group: "Structure",
    items: [
      {
        href: "/configuration/organisation",
        label: "Organisation",
        description: "Companies, divisions, departments, sections, cost centres and sites.",
        icon: "building",
        built: true,
      },
      {
        href: "/configuration/committees",
        label: "Committees",
        description: "Membership, quorum and the decisions each body may take.",
        icon: "users",
        built: true,
      },
      {
        href: "/configuration/users",
        label: "Users & roles",
        description: "Officers, the offices they hold and what each may see.",
        icon: "user",
      },
    ],
  },
  {
    group: "Money and authority",
    items: [
      {
        href: "/configuration/budget",
        label: "Budget",
        description: "Allocations, commitments and the balance a requirement is checked against.",
        icon: "chart",
      },
      {
        href: "/configuration/approval-matrix",
        label: "Approval matrix",
        description: "Who proposes, who recommends and who approves, at every value.",
        icon: "sliders",
        built: true,
      },
    ],
  },
  {
    group: "Records",
    items: [
      {
        href: "/configuration/numbering",
        label: "Numbering",
        description: "How exercise, contract and certificate references are formed.",
        icon: "grid",
      },
      {
        href: "/configuration/documents",
        label: "Documents",
        description: "Classification, retention and controlled-copy rules.",
        icon: "files",
      },
      {
        href: "/configuration/templates",
        label: "Templates",
        description: "The certificates, letters and routing sheets the portal issues.",
        icon: "files",
      },
    ],
  },
  {
    group: "System",
    items: [
      {
        href: "/configuration/reference-data",
        label: "Reference data",
        description: "Sourcing methods, contract types, funding routes and code lists.",
        icon: "globe",
        built: true,
      },
      {
        href: "/configuration/notifications",
        label: "Notifications",
        description: "What the portal sends, to whom, and when it chases.",
        icon: "inbox",
      },
    ],
  },
];
