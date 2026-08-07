"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  BellIcon,
  BuildingIcon,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import { avatarTone, initials } from "@/lib/format";
import { STAFF_NAV, SUPPLIER_NAV, workspaceFor } from "@/lib/nav";

/// Path segment to the label the breadcrumb should read. Anything unmapped is a
/// record reference and is shown as it is.
const SEGMENT_LABEL: Record<string, string> = {
  configuration: "Configuration",
  "approval-matrix": "Approval matrix",
  committees: "Committees",
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

export function Topbar({
  organisation,
  user,
}: {
  organisation: string;
  user: { name: string; jobTitle: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = workspaceFor(pathname);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, i) => ({
    label: SEGMENT_LABEL[segment] ?? decodeURIComponent(segment),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));

  const rootLabel = workspace === "supplier" ? "Supplier portal" : organisation;
  const rootHref = workspace === "supplier" ? "/supplier" : "/";
  const trail = workspace === "supplier" ? crumbs.slice(1) : crumbs;

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={rootHref} className="crumb crumb--link">
          {rootLabel}
        </Link>
        <ChevronRight size={14} className="crumb__sep" />
        {trail.length === 0 ? (
          <span className="crumb crumb--current" aria-current="page">
            {workspace === "supplier" ? "Home" : "Dashboard"}
          </span>
        ) : (
          trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return last ? (
              <span key={crumb.href} className="crumb crumb--current" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <span key={crumb.href} className="row" style={{ gap: 6, minWidth: 0 }}>
                <Link href={crumb.href} className="crumb crumb--link">
                  {crumb.label}
                </Link>
                <ChevronRight size={14} className="crumb__sep" />
              </span>
            );
          })
        )}
      </nav>

      <div className="spacer" />

      <button type="button" className="searchbtn" disabled aria-label="Search">
        <SearchIcon size={15} />
        <span className="trunc">Search</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>

      {/* Switching workspace navigates: which portal you are in decides what every
          screen means, so it belongs in the URL rather than in hidden state. */}
      <div className="personasw" role="group" aria-label="Switch workspace">
        <span className="personasw__l">Viewing as</span>
        <button
          type="button"
          className="personasw__b"
          aria-pressed={workspace === "internal"}
          onClick={() => router.push(STAFF_NAV[0].items[0].href)}
        >
          <BuildingIcon size={15} />
          <span className="personasw__t">{organisation}</span>
        </button>
        <button
          type="button"
          className="personasw__b"
          aria-pressed={workspace === "supplier"}
          onClick={() => router.push(SUPPLIER_NAV[0].items[0].href)}
        >
          <UserIcon size={15} />
          <span className="personasw__t">Supplier</span>
        </button>
      </div>

      <div className="divider--v" />

      <button type="button" className="iconbtn" aria-label="Notifications" disabled>
        <BellIcon size={17} />
        <span className="iconbtn__dot" />
      </button>
      <button type="button" className="iconbtn" aria-label="Help" disabled>
        <HelpCircle size={17} />
      </button>
      <span className="xs strong dim">EN</span>

      <div className="divider--v" />

      <button type="button" className="btn btn--ghost" disabled>
        <span className={`avatar avatar--sm ${avatarTone(user.name)}`}>{initials(user.name)}</span>
        <span className="col">
          <span className="xs strong trunc">{user.name}</span>
          <span className="xs dim trunc">{user.jobTitle}</span>
        </span>
        <ChevronDown size={15} className="dim" />
      </button>
    </header>
  );
}
