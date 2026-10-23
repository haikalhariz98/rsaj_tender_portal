import { w, type Words } from "@/lib/contract/labels";
import type { SettingsSection } from "@/lib/setup/types";

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
  /// Words, rendered through `say` (NFR-LNG-001, ADR 0040).
  label: Words;
  icon: string;
  /// False where the module has not been built yet. The item still appears — the
  /// shape of the portal is agreed — but it lands on a page that says so plainly.
  built?: boolean;
  /// Only a signed-in supplier can use it. Presentation only: the page itself still sends anyone else to sign in.
  needsSupplier?: boolean;
  /// Loaded as a whole document, never a client navigation: the register warns before it is left, and Back must be a real unload for the browser to ask (RSEC-7(2)).
  wholeDocument?: boolean;
}

/// Whether the sidebar draws an item inert: it needs a supplier and the visitor is not one.
export function navItemDisabled(item: Pick<NavItem, "needsSupplier">, supplierSignedIn: boolean): boolean {
  return item.needsSupplier === true && !supplierSignedIn;
}

export interface NavGroup {
  label: Words;
  items: NavItem[];
}

/// Grouped by where a matter is in its life (founder, 2026-10-04), not as the prototype grouped
/// them: what needs me, procuring, the contract after award, governance, records, set-up.
/// Reporting is not in this build (the founder removed it on 2026-10-04, 613A-C3), so the
/// sidebar promises no module that will not be built.
export const STAFF_NAV: NavGroup[] = [
  {
    label: w("Overview"),
    items: [
      { href: "/", label: w("Dashboard"), icon: "grid", built: true },
      // Not in the prototype (close-out ruling CO-7): the steps waiting for the person signed in, and every open approval's next step by the office
      // deciding it. The count beside it is the steps waiting for them (FR-APR-018).
      { href: "/approvals", label: w("My approvals"), icon: "clock", built: true },
      // The staff inbox (Phase 3c): notices shown in the portal, since email is not connected (INT-09). The count is the unread ones.
      { href: "/inbox", label: w("Inbox"), icon: "inbox", built: true },
    ],
  },
  {
    label: w("Procurement"),
    items: [
      // Not in the prototype, whose requisition screen no route renders. Above
      // Sourcing, not under it: a supervision-only matter never becomes sourcing (6.1).
      { href: "/requisitions", label: w("Requisitions"), icon: "clipboard", built: true },
      { href: "/sourcing", label: w("Sourcing"), icon: "globe", built: true },
      // AC-17 (C-1): Awards is not a menu; an award is the first stage of a case on the Contracts list.
    ],
  },
  {
    label: w("Contracts"),
    items: [
      // 6.12 (OD-6 A): the contracts after award, formed, signed and on their baseline.
      { href: "/projects", label: w("Contracts"), icon: "tools", built: true },
    ],
  },
  {
    label: w("Governance"),
    items: [
      // Not in the prototype, which shows committee votes only on each matter's own
      // record. Sittings run before those modules exist (ruling 5.1).
      { href: "/committees", label: w("Committee sittings"), icon: "users", built: true },
    ],
  },
  {
    label: w("Records"),
    items: [
      // 6.15a: the staff-side register (ADR 0019). The supplier's own workspace (bids, projects, company) waits for sign-in (6.15b); the public pages do not.
      { href: "/suppliers", label: w("Suppliers"), icon: "building", built: true },
      // MN-02 (AC-16): the Documents menu is gone; /documents redirects. Each contract holds its certificates, copies and submissions.
    ],
  },
  {
    label: w("Administration"),
    items: [{ href: "/configuration", label: w("Settings"), icon: "sliders", built: true }],
  },
];

export const SUPPLIER_NAV: NavGroup[] = [
  {
    label: w("Overview"),
    items: [{ href: "/supplier", label: w("Home"), icon: "grid", built: true }],
  },
  {
    // Open to anyone: no sign-in (founder, 2026-10-06). Words are in src/lib/portal/labels.ts.
    label: w("Open to everyone"),
    items: [
      { href: "/supplier/opportunities", label: w("Opportunities"), icon: "globe", built: true },
      { href: "/supplier/results", label: w("Results"), icon: "award", built: true },
      { href: "/supplier/register", label: w("Register as a supplier"), icon: "building", built: true, wholeDocument: true },
    ],
  },
  {
    // Each of these needs to know who is asking, so it waits for sign-in and says so on its own page.
    label: w("With sign-in"),
    items: [
      // Phase 4d: built. It asks who is signed in, and sends a supplier who is not to the sign-in.
      { href: "/supplier/bids", label: w("My Bids"), icon: "inbox", built: true, needsSupplier: true },
      // Phase 4e: built. It asks who is signed in, and sends a supplier who is not to the sign-in.
      { href: "/supplier/projects", label: w("My Projects"), icon: "tools", built: true, needsSupplier: true },
      // Phase 4c: built. It asks who is signed in, and sends a supplier who is not to the sign-in.
      { href: "/supplier/company", label: w("Company"), icon: "building", built: true, needsSupplier: true },
      // Phase 4e (FR-VND-014): the announcements board, read by every signed-in supplier.
      { href: "/supplier/announcements", label: w("Announcements"), icon: "bell", built: true, needsSupplier: true },
    ],
  },
];

export type Workspace = "internal" | "supplier";

export function workspaceFor(pathname: string): Workspace {
  return pathname === "/supplier" || pathname.startsWith("/supplier/") ? "supplier" : "internal";
}

export function navFor(workspace: Workspace): NavGroup[] {
  return workspace === "supplier" ? SUPPLIER_NAV : STAFF_NAV;
}

/// Settings is six sections (simplification plan 5.1). The section a page belongs to is read from this table alone: the rail, the
/// breadcrumb, the section's own page and `config-nav.test.ts` all take it from here, so a folder cannot be placed twice or nowhere.
/// `advanced` lists the section's pages in full (a tab where the page has one); the essentials above them come from the checklist.
export interface SettingsSectionDef {
  slug: SettingsSection;
  label: Words;
  icon: string;
  /// One sentence for the info popover beside the section's title.
  about: string;
  /// The `src/app/configuration/<folder>` pages this section owns.
  folders: readonly string[];
  advanced: readonly { label: string; href: string }[];
}

export const SETTINGS_START: ConfigItem = { href: "/configuration", label: w("Getting started"), icon: "check", built: true };

export interface ConfigItem {
  href: string;
  label: Words;
  icon: string;
  built?: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  {
    slug: "people",
    label: w("Organisation & people"),
    icon: "users",
    about: "Who the organisation is and who works in it: details, structure, people, roles and what each may do.",
    folders: ["organisation", "users", "accounts"],
    advanced: [
      { label: "Organisation, sites and branding", href: "/configuration/organisation" },
      { label: "People and roles", href: "/configuration/users?tab=people" },
      { label: "Permissions", href: "/configuration/users?tab=permissions" },
      { label: "Reporting lines", href: "/configuration/users?tab=lines" },
      { label: "Delegations", href: "/configuration/users?tab=delegation" },
      { label: "Sign-in accounts", href: "/configuration/accounts" },
    ],
  },
  {
    slug: "approvals",
    label: w("Approvals"),
    icon: "award",
    about: "Who approves what, by value, and the committees that recommend.",
    folders: ["approval-matrix", "committees", "routing-sheets"],
    advanced: [
      { label: "Value bands and approval routes", href: "/configuration/approval-matrix" },
      { label: "Committees", href: "/configuration/committees" },
      { label: "Routing sheets", href: "/configuration/routing-sheets" },
    ],
  },
  {
    slug: "purchasing",
    label: w("Purchasing & tenders"),
    icon: "clipboard",
    about: "How requisitions, tenders and quotations are run, from scope to evaluation.",
    folders: ["reference-data", "requisitions", "scope", "tender-documents", "invitation", "evaluation"],
    advanced: [
      { label: "Reference lists", href: "/configuration/reference-data" },
      { label: "Requisition checks", href: "/configuration/requisitions" },
      { label: "Scope and estimate", href: "/configuration/scope" },
      { label: "Tender documents", href: "/configuration/tender-documents" },
      { label: "Invitation and opening", href: "/configuration/invitation" },
      { label: "Evaluation models", href: "/configuration/evaluation" },
    ],
  },
  {
    slug: "contracts-payments",
    label: w("Contracts & payments"),
    icon: "files",
    about: "How awards become contracts, and how contracts are supervised and paid.",
    folders: ["awards", "contracts", "post-award", "budget"],
    advanced: [
      { label: "Awards", href: "/configuration/awards" },
      { label: "Contracts", href: "/configuration/contracts" },
      { label: "Supervision and payment", href: "/configuration/post-award" },
      { label: "Budget", href: "/configuration/budget" },
    ],
  },
  {
    slug: "suppliers-portal",
    label: w("Suppliers & portal"),
    icon: "globe",
    about: "What suppliers see and give when they register, and how the public portal behaves.",
    folders: ["suppliers"],
    advanced: [{ label: "Supplier register and portal", href: "/configuration/suppliers" }],
  },
  {
    slug: "system",
    label: w("System"),
    icon: "sliders",
    about: "Notifications, numbering, templates, sign-in and the audit trail.",
    folders: ["notifications", "numbering", "templates", "documents", "security", "bid-sealing", "audit", "changes"],
    advanced: [
      { label: "Notifications", href: "/configuration/notifications" },
      { label: "Numbering", href: "/configuration/numbering" },
      { label: "Templates", href: "/configuration/templates" },
      { label: "Documents", href: "/configuration/documents" },
      { label: "Sign-in settings", href: "/configuration/security" },
      { label: "Bid sealing", href: "/configuration/bid-sealing" },
      { label: "Audit trail", href: "/configuration/audit" },
      { label: "Settings changes to approve", href: "/configuration/changes" },
    ],
  },
];

/// The rail: Getting started, then the six sections.
export const SETTINGS_RAIL: ConfigItem[] = [
  SETTINGS_START,
  ...SETTINGS_SECTIONS.map((s) => ({ href: `/configuration/${s.slug}`, label: s.label, icon: s.icon, built: true })),
];

/// A page folder's section. The section's own page is its own entry: `people` maps to `people`.
export const FOLDER_SECTION: Readonly<Record<string, SettingsSection>> = Object.fromEntries(
  SETTINGS_SECTIONS.flatMap((s) => [[s.slug, s.slug], ...s.folders.map((f) => [f, s.slug])]),
);

/// The section a path under Settings lights in the rail, or null for Getting started.
export const sectionOfPath = (pathname: string): SettingsSection | null => FOLDER_SECTION[pathname.split("/")[2] ?? ""] ?? null;

/// Each page's own name, for its breadcrumb (the section's is its rail label).
const PAGE_LABELS: Record<string, Words> = {
  organisation: w("Organisation"),
  users: w("Users & roles"),
  accounts: w("Sign-in accounts"),
  "approval-matrix": w("Approval matrix"),
  committees: w("Committees"),
  "routing-sheets": w("Routing sheets"),
  "reference-data": w("Reference data"),
  requisitions: w("Requisition controls"),
  scope: w("Scope and estimate"),
  "tender-documents": w("Tender documents"),
  invitation: w("Invitation controls"),
  evaluation: w("Evaluation models"),
  awards: w("Award controls"),
  contracts: w("Contract controls"),
  "post-award": w("Post-award controls"),
  budget: w("Budget"),
  suppliers: w("Supplier register"),
  notifications: w("Notifications"),
  numbering: w("Numbering"),
  templates: w("Templates"),
  documents: w("Documents"),
  security: w("Sign-in settings"),
  "bid-sealing": w("Bid sealing"),
  audit: w("Audit trail"),
  changes: w("Settings changes to approve"),
};

/// A folder's name to its label, for the breadcrumb: the pages above and the six sections.
export const CONFIG_LABELS: Record<string, Words> = {
  ...PAGE_LABELS,
  ...Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.slug, s.label])),
};
