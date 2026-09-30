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
  notifications: "Notifications",
  sourcing: "Sourcing",
  projects: "Projects",
  suppliers: "Suppliers",
  documents: "Documents",
  reports: "Reports",
  supplier: "Supplier portal",
  opportunities: "Opportunities",
  bids: "My Bids",
  company: "Company",
};

/// What a record under a section is called, for its breadcrumb.
const RECORD_LABEL: Record<string, string> = {
  committees: "Committee",
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
  const crumbs = segments.map((segment, i) => ({
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
        : (SEGMENT_LABEL[segment] ?? RECORD_LABEL[segments[i - 1] ?? ""] ?? "Details"),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));

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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line/60 bg-canvas/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className={iconButtonClass("md", false, "-ml-2 lg:hidden")}
      >
        <MenuIcon size={20} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
        {all.map((crumb, i) => {
          const last = i === all.length - 1;
          return (
            <span
              key={crumb.href + i}
              className={i < all.length - 2 ? "hidden min-w-0 items-center gap-1.5 sm:flex" : "flex min-w-0 items-center gap-1.5"}
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
        className="hidden h-10 w-64 cursor-not-allowed items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-[13.5px] text-ink-4 md:flex"
      >
        <SearchIcon size={16} />
        <span className="flex-1 truncate text-left">Search</span>
        <kbd className="rounded-md bg-sunken px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-3">
          Ctrl K
        </kbd>
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
          <span className="hidden truncate text-[12.5px] text-ink-3 lg:inline">
            Sign-in not built yet
          </span>
        </span>
      )}
    </header>
  );
}
