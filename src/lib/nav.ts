/**
 * Navigation, taken from the approved prototype rather than invented.
 *
 * Two workspaces: Ranhill SAJ staff and the supplier-facing portal. The top bar
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
    items: [{ href: "/suppliers", label: "Suppliers", icon: "building" }],
  },
  {
    label: "Insight",
    items: [
      { href: "/documents", label: "Documents", icon: "files" },
      { href: "/reports", label: "Reports", icon: "chart" },
    ],
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

/// Sections of the Configuration area, grouped as the prototype groups them.
export const CONFIG_SECTIONS = [
  {
    group: "Money and authority",
    items: [
      {
        href: "/configuration/approval-matrix",
        label: "Approval matrix",
        description: "Who proposes, who recommends and who approves, at every value.",
        built: true,
      },
      {
        href: "/configuration/committees",
        label: "Committees",
        description: "Membership, quorum and the decisions each body may take.",
        built: true,
      },
      {
        href: "/configuration/value-bands",
        label: "Value bands",
        description: "The thresholds that separate quotation from tender.",
        built: false,
      },
    ],
  },
  {
    group: "Structure",
    items: [
      {
        href: "/configuration/organisation",
        label: "Organisation",
        description: "Divisions, departments and the offices that hold authority.",
        built: false,
      },
      {
        href: "/configuration/people",
        label: "People and roles",
        description: "Officers, the offices they hold and when they held them.",
        built: false,
      },
    ],
  },
  {
    group: "Records",
    items: [
      {
        href: "/configuration/forms",
        label: "Forms and certificates",
        description: "Templates for the certificates and routing sheets the portal issues.",
        built: false,
      },
      {
        href: "/configuration/numbering",
        label: "Reference numbering",
        description: "How exercise, contract and certificate references are formed.",
        built: false,
      },
    ],
  },
] as const;
