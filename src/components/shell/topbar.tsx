"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BellIcon,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { iconButtonClass } from "@/components/ui/button";
import { workspaceFor } from "@/lib/nav";
import type { ShellUser } from "@/lib/shell";

import { useRecordCrumb } from "./record-crumb";

/// Path segment to the label the breadcrumb should read.
const SEGMENT_LABEL: Record<string, string> = {
  configuration: "Configuration",
  "approval-matrix": "Approval matrix",
  committees: "Committees",
  organisation: "Organisation",
  users: "Users & roles",
  budget: "Budget",
  numbering: "Numbering",
  templates: "Templates",
  "reference-data": "Reference data",
  "tender-documents": "Tender documents",
  invitation: "Invitation controls",
  appendix: "Appendix",
  notifications: "Notifications",
  sourcing: "Sourcing",
  projects: "Projects",
  suppliers: "Suppliers",
  documents: "Documents",
  reports: "Reports",
  requisitions: "Requisitions",
  awards: "Awards",
  securities: "Securities",
  approvals: "Awaiting decision",
  audit: "Audit trail",
  print: "Print",
  // Short: the crumb shares the bar with search. The page title says the rest.
  receive: "Receive",
  supplier: "Supplier portal",
  opportunities: "Opportunities",
  bids: "My Bids",
  company: "Company",
};

/// What a record under a section is called, for its breadcrumb.
const RECORD_LABEL: Record<string, string> = {
  committees: "Committee",
  requisitions: "Requisition",
  awards: "Award",
  // 6.15a: a supplier on the register; the page names it (RecordCrumb).
  suppliers: "Supplier",
};

/// Segments whose label depends on where they sit.
const NESTED_LABEL: Record<string, string> = {
  "configuration/requisitions": "Requisition controls",
  "requisitions/new": "New requisition",
  "configuration/awards": "Award controls",
  "configuration/scope": "Scope and estimate",
  "awards/new": "New award",
  // 6.15a: the register's configuration, and recording a paper application.
  "configuration/suppliers": "Supplier register",
  "suppliers/new": "New application",
};

export function Topbar({
  organisation,
  user,
  hasAlerts,
  onMenu,
}: {
  organisation: string;
  /// Null until authentication exists. Rendered as "not signed in", never as a person.
  user: ShellUser | null;
  /// Whether anything is waiting. The bell's dot claims there is; it must not lie.
  hasAlerts: boolean;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const workspace = workspaceFor(pathname);

  const segments = pathname.split("/").filter(Boolean);
  const recordName = useRecordCrumb();
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

  // An exercise's documents are the Tender documents tab, not the register of documents: named so, and linked to the tab (no page of its own sits at that path).
  if (segments[0] === "sourcing") {
    segments.forEach((sg, i) => {
      if (sg === "documents" && i >= 2) {
        crumbs[i].label = "Tender documents";
        crumbs[i].href = `/sourcing/${segments[1]}?tab=documents`;
      }
    });
  }

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

      <button
        type="button"
        disabled
        aria-label="Notifications"
        title="Notifications are not built yet"
        className={iconButtonClass()}
      >
        <BellIcon size={19} />
        {hasAlerts && (
          <span className="absolute top-2 right-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-canvas" />
        )}
      </button>
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

      {/* No sign-in yet, so there is nobody to name. An avatar with initials and a
          job title would assert an identity the system does not have. */}
      {user ? (
        <button
          type="button"
          disabled
          className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-ink/5"
        >
          <Avatar name={user.name} size="sm" />
          <span className="hidden min-w-0 text-left leading-tight md:block">
            <span className="block truncate text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[12px] text-ink-3">{user.jobTitle}</span>
          </span>
          <ChevronDown size={15} className="text-ink-3" />
        </button>
      ) : (
        <span className="flex items-center gap-2.5" title="Sign-in not built yet">
          <Avatar size="sm">
            <UserIcon size={15} />
          </Avatar>
          <span className="hidden truncate text-[12.5px] text-ink-3 2xl:inline">
            Sign-in not built yet
          </span>
        </span>
      )}
    </header>
  );
}
