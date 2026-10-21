import { w, type Words } from "@/lib/contract/labels";

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
    items: [{ href: "/configuration", label: w("Configuration"), icon: "sliders", built: true }],
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
      { href: "/supplier/register", label: w("Register as a supplier"), icon: "building", built: true },
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

export interface ConfigItem {
  href: string;
  label: Words;
  icon: string;
  built?: boolean;
}

/// The groups of Configuration's navigator, as a fixed set: adding a group is a deliberate edit here, not a new string in a list.
export type ConfigGroup =
  | "People and access"
  | "Governance"
  | "Across every stage"
  | "Requisitions"
  | "Sourcing and award"
  | "Contracts"
  | "Records";

/// The groups' own words (NFR-LNG-001). The union above stays the identifier that the placement rule and its test read; this is what the rail shows.
export const CONFIG_GROUP_WORDS: Readonly<Record<ConfigGroup, Words>> = {
  "People and access": w("People and access"),
  Governance: w("Governance"),
  "Across every stage": w("Across every stage"),
  Requisitions: w("Requisitions"),
  "Sourcing and award": w("Sourcing and award"),
  Contracts: w("Contracts"),
  Records: w("Records"),
};

/// Pinned above the groups, with no header (founder, 2026-10-08): Organisation, which everything else hangs from and where Configuration
/// opens, and the changes waiting on a second person. The second one is shown to everyone; its page says who may decide. Its count is the
/// viewer's own "waiting for you" number and never an organisation-wide one, so it arrives with the actor in `staffCounts`, not here.
export const CONFIG_PINNED: ConfigItem[] = [
  { href: "/configuration/organisation", label: w("Organisation"), icon: "building", built: true },
  { href: "/configuration/changes", label: w("Changes awaiting a second person"), icon: "clipboard", built: true },
];

/**
 * Sections of the Configuration area (founder, 2026-10-08), grouped by where a setting acts and named by stage, following the main
 * navigation's modules. A grouping by owner was rejected: every owner would be a guess, it would build one customer's split of work
 * into the product, and several sections have more than one owner.
 *
 * Where a new section goes: take the first line that applies.
 *   1. Who someone is, or how they sign in                  -> People and access
 *   2. Who may decide, or how a body decides                -> Governance
 *   3. The screens of one main-navigation module            -> that module's group (Requisitions; Sourcing and award; Contracts)
 *   4. The paper the portal issues or keeps                 -> Records
 *   5. Two or more modules equally                          -> Across every stage
 * No group of one section, no "Other" or "General" group; a group past seven sections splits along module lines; once the rail nears
 * forty sections it gets a filter field, never collapsing groups. No rail item points at a tab inside another section (the active
 * item matches on the path, so two would light at once). A label never holds a code and reads on its own in a breadcrumb.
 * `config-nav.test.ts` fails when a section folder has no entry here, a group is outside two to seven, or a label differs from its crumb.
 */
export const CONFIG_SECTIONS: { group: ConfigGroup; items: ConfigItem[] }[] = [
  {
    group: "People and access",
    items: [
      { href: "/configuration/users", label: w("Users & roles"), icon: "user", built: true },
      // Phase 1b: the administrator's screen for who can sign in. Staff reach it by the link; the page itself says so to anyone who is not an administrator.
      { href: "/configuration/accounts", label: w("Sign-in accounts"), icon: "shield", built: true },
      // Phase 2c: the sign-in settings.
      { href: "/configuration/security", label: w("Sign-in settings"), icon: "sliders", built: true },
    ],
  },
  {
    group: "Governance",
    items: [
      { href: "/configuration/approval-matrix", label: w("Approval matrix"), icon: "sliders", built: true },
      { href: "/configuration/committees", label: w("Committees"), icon: "users", built: true },
    ],
  },
  {
    group: "Across every stage",
    items: [
      { href: "/configuration/reference-data", label: w("Reference data"), icon: "globe", built: true },
      { href: "/configuration/notifications", label: w("Notifications"), icon: "inbox", built: true },
    ],
  },
  {
    group: "Requisitions",
    items: [
      { href: "/configuration/requisitions", label: w("Requisition controls"), icon: "clipboard", built: true },
      { href: "/configuration/budget", label: w("Budget"), icon: "chart", built: true },
    ],
  },
  {
    // In the order a matter takes them: scope, the pack, the invitation, evaluation, the award.
    group: "Sourcing and award",
    items: [
      { href: "/configuration/scope", label: w("Scope and estimate"), icon: "tools", built: true },
      { href: "/configuration/tender-documents", label: w("Tender documents"), icon: "files", built: true },
      { href: "/configuration/invitation", label: w("Invitation controls"), icon: "globe", built: true },
      { href: "/configuration/bid-sealing", label: w("Bid sealing"), icon: "shield", built: true },
      { href: "/configuration/evaluation", label: w("Evaluation models"), icon: "sliders", built: true },
      { href: "/configuration/awards", label: w("Award controls"), icon: "award", built: true },
    ],
  },
  {
    group: "Contracts",
    items: [
      { href: "/configuration/contracts", label: w("Contract controls"), icon: "file", built: true },
      { href: "/configuration/post-award", label: w("Post-award controls"), icon: "tools", built: true },
    ],
  },
  {
    // Routing sheets stay here, not under Contracts: the Documents register's Routing sheets tab and awards use them too.
    group: "Records",
    items: [
      // 6.15a: the prototype keeps CIDB grades and MOF codes on Reference data; here every registration
      // body's values sit with the register, per body, never as regulator columns (FR-VND-003).
      { href: "/configuration/suppliers", label: w("Supplier register"), icon: "building", built: true },
      { href: "/configuration/documents", label: w("Documents"), icon: "files", built: true },
      { href: "/configuration/templates", label: w("Templates"), icon: "files", built: true },
      { href: "/configuration/routing-sheets", label: w("Routing sheets"), icon: "clock", built: true },
      { href: "/configuration/numbering", label: w("Numbering"), icon: "grid", built: true },
      { href: "/configuration/audit", label: w("Audit trail"), icon: "clock", built: true },
    ],
  },
];

/// A section's folder name to its label, from the rail itself, so the breadcrumb and the rail cannot split.
export const CONFIG_LABELS: Record<string, Words> = Object.fromEntries(
  [...CONFIG_PINNED, ...CONFIG_SECTIONS.flatMap((g) => g.items)].map((item) => [item.href.slice("/configuration/".length), item.label]),
);
