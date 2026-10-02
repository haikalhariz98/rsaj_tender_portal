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
      // Not in the prototype, whose requisition screen no route renders. Above
      // Sourcing, not under it: a supervision-only matter never becomes sourcing (6.1).
      { href: "/requisitions", label: "Requisitions", icon: "clipboard", built: true },
      // Not in the prototype (close-out ruling CO-7): every open approval's next step, by
      // the office deciding it. Shown to everyone until sign-in; nobody is notified.
      { href: "/approvals", label: "Awaiting decision", icon: "inbox", built: true },
      { href: "/sourcing", label: "Sourcing", icon: "globe", built: true },
      // Not in the prototype, which has the award only as a tab of the exercise (6.11 plan §6).
      // Cross-exercise work lists: what awaits approval, issue, return or a commitment number.
      { href: "/awards", label: "Awards", icon: "award", built: true },
      { href: "/securities", label: "Securities", icon: "shield", built: true },
      // 6.12 (OD-6 A): the contracts after award, formed, signed and on their baseline.
      { href: "/projects", label: "Projects", icon: "tools", built: true },
      // Not in the prototype, which shows committee votes only on each matter's own
      // record. Sittings run before those modules exist (ruling 5.1).
      { href: "/committees", label: "Committee sittings", icon: "users", built: true },
    ],
  },
  {
    label: "Supply base",
    items: [
      // 6.15a: the staff-side register (ADR 0019). The vendor workspace below stays not built until sign-in (6.15b).
      { href: "/suppliers", label: "Suppliers", icon: "building", built: true },
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
        built: true,
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
        built: true,
      },
      {
        href: "/configuration/approval-matrix",
        label: "Approval matrix",
        description: "Who proposes, who recommends and who approves, at every value.",
        icon: "sliders",
        built: true,
      },
      {
        href: "/configuration/awards",
        label: "Award controls",
        description: "Instruments, signatories' templates, distribution, letter variants, conditions, insurance and liability bands.",
        icon: "award",
        built: true,
      },
      {
        href: "/configuration/contracts",
        label: "Contract controls",
        description: "The legal office, the contract agreement's signatory rows, controlled copies and the Contract Document's parts.",
        icon: "file",
        built: true,
      },
      {
        href: "/configuration/scope",
        label: "Scope and estimate",
        description: "The standard bills follow, who may prepare them, specification panels and the company estimate's lead time.",
        icon: "tools",
        built: true,
      },
      {
        href: "/configuration/tender-documents",
        label: "Tender documents",
        description: "The parts each pack assembles, the wording it carries and the figures it is judged by.",
        icon: "files",
        built: true,
      },
      {
        href: "/configuration/invitation",
        label: "Invitation controls",
        description: "The window's date rules, publication channels, least fees and holiday calendars.",
        icon: "globe",
        built: true,
      },
      {
        href: "/configuration/evaluation",
        label: "Evaluation models",
        description: "How bids are evaluated: stages, weights, pass marks, bands and aspects, and the report's policy.",
        icon: "sliders",
        built: true,
      },
      {
        href: "/configuration/requisitions",
        label: "Requisition controls",
        description: "Endorsement tiers, the splitting check, budget re-checks and registration.",
        icon: "clipboard",
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
        built: true,
      },
      {
        href: "/configuration/documents",
        label: "Documents",
        description: "Classification, retention and controlled-copy rules.",
        icon: "files",
        built: true,
      },
      {
        href: "/configuration/audit",
        label: "Audit trail",
        description: "Every change on record, and its export with a digest for an outside auditor.",
        icon: "clock",
        built: true,
      },
      {
        href: "/configuration/templates",
        label: "Templates",
        description: "The certificates, letters and routing sheets the portal issues.",
        icon: "files",
        built: true,
      },
      {
        href: "/configuration/routing-sheets",
        label: "Routing sheets",
        description: "The CPD/DFA routing sheets: their checks and the targets elapsed days are judged against.",
        icon: "clock",
        built: true,
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
      // 6.15a: the prototype keeps CIDB grades and MOF codes on Reference data; here every registration
      // body's values sit with the register, per body, never as regulator columns (FR-VND-003).
      {
        href: "/configuration/suppliers",
        label: "Supplier register",
        description: "Registration bodies' values, statutory document types, entity types and countries, and the verification notice.",
        icon: "building",
        built: true,
      },
      {
        href: "/configuration/notifications",
        label: "Notifications",
        description: "What the portal sends, to whom, and when reminders are issued.",
        icon: "inbox",
        built: true,
      },
    ],
  },
];
