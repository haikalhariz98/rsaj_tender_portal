"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BellIcon,
  ChevronRight,
  HelpCircle,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import { ButtonLink, iconButtonClass } from "@/components/ui/button";
import { CONFIG_LABELS, workspaceFor } from "@/lib/nav";
import type { ShellUser } from "@/lib/shell";

import { useRecordCrumb, useRecordParentCrumb } from "./record-crumb";
import { UserMenu } from "./user-menu";

/// Path segment to the label the breadcrumb should read. A segment that only names a Configuration section takes its word from the rail
/// (`CONFIG_LABELS`), so the two cannot split; the key is still needed here, because a key is how a known section word is told from a record's key.
const SEGMENT_LABEL: Record<string, string> = {
  configuration: "Configuration",
  "approval-matrix": CONFIG_LABELS["approval-matrix"],
  committees: "Committees",
  organisation: CONFIG_LABELS["organisation"],
  users: CONFIG_LABELS["users"],
  budget: CONFIG_LABELS["budget"],
  numbering: CONFIG_LABELS["numbering"],
  templates: CONFIG_LABELS["templates"],
  "routing-sheets": CONFIG_LABELS["routing-sheets"],
  "reference-data": CONFIG_LABELS["reference-data"],
  "tender-documents": CONFIG_LABELS["tender-documents"],
  invitation: CONFIG_LABELS["invitation"],
  appendix: "Appendix",
  notifications: CONFIG_LABELS["notifications"],
  accounts: CONFIG_LABELS["accounts"],
  security: CONFIG_LABELS["security"],
  changes: CONFIG_LABELS["changes"],
  sourcing: "Sourcing",
  projects: "Contracts",
  suppliers: "Suppliers",
  documents: "Documents",
  requisitions: "Requisitions",
  awards: "Awards",
  securities: "Securities",
  approvals: "My approvals",
  inbox: "Inbox",
  account: "Your account",
  welcome: "Welcome",
  "sign-in": "Sign in",
  audit: CONFIG_LABELS["audit"],
  print: "Print",
  // Short: the crumb shares the bar with search. The page title says the rest.
  receive: "Receive",
  supplier: "Supplier portal",
  opportunities: "Opportunities",
  bids: "My Bids",
  company: "Company",
  // Phase 4d: the Tender Table Document a supplier inspects, under one exercise of My Bids.
  "table-document": "Tender Table Document",
};

/// What a record under a section is called, for its breadcrumb.
const RECORD_LABEL: Record<string, string> = {
  committees: "Committee",
  requisitions: "Requisition",
  awards: "Award",
  // 6.15a: a supplier on the register; the page names it (RecordCrumb).
  suppliers: "Supplier",
  // 6.14: a contract, a certificate under it, a form and a routing sheet type; each page names its record.
  projects: "Contract",
  certificates: "Certificate",
  // 6.13 Part A step 4: a variation under its contract.
  variations: "Variation",
  templates: "Template",
  "routing-sheets": "Routing sheet type",
  sourcing: "Exercise",
  // The public portal: an advertised opportunity; the page names it by its reference (RecordCrumb).
  opportunities: "Opportunity",
  // Phase 4d: one exercise in My Bids; the page names it by its reference (RecordCrumb).
  bids: "Exercise",
  online: "Online application",
  evaluation: "Evaluation model",
  label: "Sale label",
};

/// Segments whose label depends on where they sit.
const NESTED_LABEL: Record<string, string> = {
  // Every Configuration section, named as the rail names it. Under Configuration "requisitions" is Requisition controls, not the requisitions list.
  ...Object.fromEntries(Object.entries(CONFIG_LABELS).map(([slug, label]) => [`configuration/${slug}`, label])),
  // The sign-in screens, shown without the frame but named for the breadcrumb test.
  "sign-in/code": "Use a code",
  "requisitions/new": "New requisition",
  "awards/new": "New award",
  // 6.15a: the register's configuration, and recording a paper application.
  "suppliers/new": "New application",
  // Online applications waiting for an officer: the list is the Online tab, one application sits under it.
  "suppliers/online": "Online applications",
  // 6.14 residual: every page names its crumbs (crumbs.test.ts walks every page).
  "sourcing/new": "New exercise",
  "evaluation/report": "Evaluation report",
  "evaluation/proposal": "Kertas Cadangan",
  // The supplier portal's own words, where a segment is also a staff section's name ("projects" is Contracts there).
  "supplier/projects": "My Projects",
  "supplier/results": "Results",
  "supplier/register": "Register as a supplier",
  // Phase 4b: a signed-in supplier completing its registration.
  "supplier/registration": "Registration",
  // Phase 4a: a supplier activating the account an officer opened, and setting a new password with a reset code.
  "supplier/activate": "Activate your account",
  "supplier/reset": "Set a new password",
};

/**
 * The breadcrumb's crumbs for a path, given the names the page gave its record (and the record it sits
 * under). Pure, so a test can hold every crumb to a page that exists.
 */
export function crumbTrail(segments: readonly string[], recordName: string | null, parentName: string | null): { label: string; href: string }[] {
  // A printable document sits under its record: "Awards › AW/1 › Print", the document's
  // own slug left off (the page names it).
  const printAt = segments.indexOf("print");
  const crumbs = segments.slice(0, printAt > 0 ? printAt + 1 : segments.length).map((segment, i) => ({
    // An unmapped segment is a record's key — a committee's code, say. Codes never
    // reach a screen; the page's own header names the record, so the crumb says what
    // kind of record it is.
    // "committees" at the top is the running of sittings; under Configuration it is
    // the setup of the bodies. Same word, two screens.
    label:
      segments[0] === "committees"
        ? i === 0
          ? "Committee sittings"
          : "Sitting"
        : (NESTED_LABEL[`${segments[i - 1] ?? ""}/${segment}`] ??
          (segment === "edit" ? "Edit" : undefined) ??
          SEGMENT_LABEL[segment] ??
          RECORD_LABEL[segments[i - 1] ?? ""] ??
          "Details"),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));
  // The last crumb names the record where the page has said which one it is.
  const last = crumbs[crumbs.length - 1];
  const lastSegment = segments[segments.length - 1];
  if (recordName && last && printAt < 0 && !SEGMENT_LABEL[lastSegment] && lastSegment !== "edit" && lastSegment !== "new") last.label = recordName;
  // A record's own crumb, where the page names it and a sub-page sits under it.
  if (recordName && lastSegment === "edit" && crumbs.length >= 2) crumbs[crumbs.length - 2].label = recordName;
  // A page under a record (an exercise's Appendix) names the record, not "Details": the crumb before a
  // known section word is the record's key.
  if (recordName && printAt < 0 && lastSegment !== "edit" && SEGMENT_LABEL[lastSegment] && crumbs.length >= 3) {
    const keyAt = crumbs.length - 2;
    if (!SEGMENT_LABEL[segments[keyAt]]) crumbs[keyAt].label = recordName;
  }
  if (recordName && printAt > 0) {
    // The record's key is the crumb that names it; a section between it and the print ("Documents") keeps its own word.
    const keyAt = segments.findIndex((sg, i) => i > 0 && !SEGMENT_LABEL[sg]);
    crumbs[keyAt > 0 && keyAt < printAt ? keyAt : printAt - 1].label = recordName;
    crumbs[printAt].label = "Print";
  }
  // The print crumb is the page itself (the document's own slug left off): it links to the page, never to a bare …/print.
  if (printAt > 0) crumbs[printAt].href = "/" + segments.join("/");

  // An exercise's documents are the Tender documents tab, not the register of documents: named so, and linked to the tab (no page of its own sits at that path).
  if (segments[0] === "sourcing") {
    segments.forEach((sg, i) => {
      if (sg === "documents" && i >= 2) {
        crumbs[i].label = "Tender documents";
        crumbs[i].href = `/sourcing/${segments[1]}?tab=documents`;
      }
    });
  }

  // A page under an exercise names the exercise (its reference, from the page) at the exercise's crumb, never at its
  // own; a section with no page of its own is the exercise's tab that holds it.
  if (segments[0] === "sourcing" && segments.length >= 3 && segments[1] !== "new") {
    const id = segments[1];
    crumbs[1].label = recordName ?? "Exercise";
    const SECTION: Record<string, [string, string]> = { evaluation: ["Evaluation", "?tab=evaluation&section=report"], label: ["Sales", "?tab=invitation&section=sales"], opening: ["Bid opening", "?tab=bids&section=schedule"] };
    const section = SECTION[segments[2]];
    if (section) crumbs[2] = { label: section[0], href: `/sourcing/${id}${section[1]}` };
    const last = crumbs.length - 1;
    if (last >= 3) crumbs[last].label = segments[2] === "label" ? "Sale label" : printAt > 0 ? "Print" : (NESTED_LABEL[`${segments[last - 1]}/${segments[last]}`] ?? SEGMENT_LABEL[segments[last]] ?? crumbs[last].label);
    if (last === 2 && recordName && crumbs[2].label === recordName) crumbs[2].label = SEGMENT_LABEL[segments[2]] ?? (segments[2] === "edit" ? "Edit" : crumbs[2].label);
  }

  // A certificate sits on its contract's Documents tab: "Projects › <contract> › Documents › <certificate>"; no page
  // of its own sits at …/certificates, so that crumb is the tab.
  if (segments[0] === "projects" && segments[2] === "certificates" && crumbs.length >= 3) {
    if (parentName) crumbs[1].label = parentName;
    crumbs[2].label = "Documents";
    crumbs[2].href = `/projects/${segments[1]}?tab=documents`;
  }
  // 6.13 Part A step 4: a variation sits on its contract's Variations tab: "Projects › <contract> › Variations › <variation>".
  if (segments[0] === "projects" && segments[2] === "variations" && crumbs.length >= 3) {
    if (parentName) crumbs[1].label = parentName;
    crumbs[2].label = "Variations";
    crumbs[2].href = `/projects/${segments[1]}?tab=variations`;
  }

  return crumbs;
}

export function Topbar({
  organisation,
  user,
  hasAlerts,
  onMenu,
  signOut,
  signInHref = "/sign-in",
}: {
  organisation: string;
  /// Null until authentication exists. Rendered as "not signed in", never as a person.
  user: ShellUser | null;
  /// Whether anything is waiting. The bell's dot claims there is; it must not lie.
  hasAlerts: boolean;
  onMenu: () => void;
  /// The sign-out action, from the layout.
  signOut: (data: FormData) => Promise<void>;
  /// Where "Sign in" leads when nobody is signed in: the staff's page, or on the public copy the supplier portal's own (Phase 4a).
  signInHref?: string;
}) {
  const pathname = usePathname();
  const workspace = workspaceFor(pathname);

  const segments = pathname.split("/").filter(Boolean);
  const recordName = useRecordCrumb();
  const parentName = useRecordParentCrumb();
  const crumbs = crumbTrail(segments, recordName, parentName);

  const rootLabel = workspace === "supplier" ? "Supplier portal" : organisation;
  const rootHref = workspace === "supplier" ? "/supplier" : "/";
  const trail = workspace === "supplier" ? crumbs.slice(1) : crumbs;
  const all = [
    { label: rootLabel, href: rootHref },
    ...(trail.length === 0
      ? [{ label: workspace === "supplier" ? "Home" : "Dashboard", href: pathname }]
      : trail),
  ];

  return (
    <header className="sticky top-0 z-20 flex print:hidden h-16 items-center gap-2 border-b border-line/60 bg-canvas/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className={iconButtonClass("md", false, "-ml-2 lg:hidden")}
      >
        <MenuIcon size={20} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5 text-[13.5px]">
        {all.map((crumb, i) => {
          const last = i === all.length - 1;
          return (
            <span
              key={crumb.href + i}
              // The organisation's crumb gives way below 2xl, so the record and its section keep their width beside the search box.
              className={i === 0 && workspace !== "supplier" && all.length > 2 ? "hidden min-w-0 items-center gap-1.5 2xl:flex" : i < all.length - 1 ? "hidden shrink-0 items-center gap-1.5 whitespace-nowrap sm:flex" : "flex min-w-0 items-center gap-1.5"}
            >
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-ink">
                  {crumb.label}
                </span>
              ) : (
                <>
                  <Link
                    href={crumb.href}
                    className="truncate text-ink-3 no-underline hover:text-ink hover:no-underline"
                  >
                    {crumb.label}
                  </Link>
                  <ChevronRight size={14} className="shrink-0 text-ink-4" />
                </>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        disabled
        aria-label="Search"
        title="Search is not built yet"
        className="hidden h-10 w-56 shrink-0 2xl:w-64 cursor-not-allowed items-center gap-2.5 overflow-hidden rounded-full border border-line bg-surface px-4 text-[13.5px] text-ink-4 md:flex"
      >
        <SearchIcon size={16} />
        <span className="flex-1 truncate text-left">Search</span>
      </button>

      {workspace === "supplier" ? (
        <button type="button" disabled aria-label="Notifications" title="Notices to suppliers are not built yet" className={iconButtonClass()}>
          <BellIcon size={19} />
        </button>
      ) : (
        <Link href="/inbox" aria-label={hasAlerts ? "Inbox, with unread notices" : "Inbox"} title={hasAlerts ? "You have unread notices" : "Your inbox"} className={iconButtonClass()}>
          <BellIcon size={19} />
          {hasAlerts && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-canvas" />}
        </Link>
      )}
      <button
        type="button"
        disabled
        aria-label="Help"
        title="Help is not built yet"
        className={iconButtonClass("md", false, "hidden sm:inline-flex")}
      >
        <HelpCircle size={19} />
      </button>
      <span className="hidden rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-bold text-ink-3 sm:inline">
        EN
      </span>

      <span className="mx-1.5 hidden h-6 w-px bg-line-2 sm:block" />

      {/* Who is signed in, from the session. Nobody signed in is said as such, with the way in: no avatar and no name is shown that is not a person's. */}
      {user ? (
        <UserMenu user={user} signOut={signOut} />
      ) : (
        <ButtonLink href={signInHref} variant="secondary" size="sm" icon={<UserIcon size={15} />}>
          Sign in
        </ButtonLink>
      )}
    </header>
  );
}
