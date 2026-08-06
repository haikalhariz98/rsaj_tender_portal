"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronRight } from "@/components/icons";

/// Path segment -> the label the breadcrumb should read. Anything unmapped is a
/// record identifier, so it is shown as-is.
const SEGMENT_LABEL: Record<string, string> = {
  authority: "Authority limits",
  committees: "Committees",
};

export function Topbar({ organisation }: { organisation: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((segment, i) => ({
    label: SEGMENT_LABEL[segment] ?? decodeURIComponent(segment),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.length === 0 ? (
          <span className="crumb crumb--current">Approval routing</span>
        ) : (
          <>
            <Link href="/" className="crumb crumb--link">
              {organisation}
            </Link>
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
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
    </header>
  );
}
