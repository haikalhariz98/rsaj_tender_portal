"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ChevronRight, SearchIcon } from "@/components/icons";
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

export function Topbar({ organisation }: { organisation: string }) {
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
  // The workspace root already names itself in the breadcrumb.
  const trail = workspace === "supplier" ? crumbs.slice(1) : crumbs;

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {trail.length === 0 ? (
          <span className="crumb crumb--current">
            {workspace === "supplier" ? "Home" : "Dashboard"}
          </span>
        ) : (
          <>
            <Link href={rootHref} className="crumb crumb--link">
              {rootLabel}
            </Link>
            {trail.map((crumb, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={crumb.href} className="row" style={{ gap: 6, minWidth: 0 }}>
                  <span className="crumb__sep" aria-hidden="true">
                    <ChevronRight size={14} />
                  </span>
                  {last ? (
                    <span className="crumb crumb--current" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="crumb crumb--link">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              );
            })}
          </>
        )}
      </nav>

      {/* Switching workspace navigates, because which portal you are in decides what
          every screen means — it is not a display preference. */}
      <div className="personasw" role="group" aria-label="Switch workspace">
        <span className="personasw__l">Viewing as</span>
        <button
          type="button"
          className="personasw__b"
          aria-pressed={workspace === "internal"}
          onClick={() => router.push(STAFF_NAV[0].items[0].href)}
        >
          <span className="personasw__t">{organisation}</span>
        </button>
        <button
          type="button"
          className="personasw__b"
          aria-pressed={workspace === "supplier"}
          onClick={() => router.push(SUPPLIER_NAV[0].items[0].href)}
        >
          <span className="personasw__t">Supplier</span>
        </button>
      </div>

      <button type="button" className="searchbtn" disabled aria-label="Search">
        <SearchIcon size={15} />
        <span className="trunc">Search</span>
        <span className="kbd">/</span>
      </button>
    </header>
  );
}
