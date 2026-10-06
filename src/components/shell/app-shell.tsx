"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { ShellOrganisation, ShellUser } from "@/lib/shell";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/// The frame around every screen. Owns one piece of state: whether the navigation
/// drawer is open on a narrow screen. On wide screens the sidebar is always there.
export function AppShell({
  organisation,
  strapline,
  counts,
  user,
  portalOnly = false,
  children,
}: {
  organisation: ShellOrganisation;
  strapline: string;
  counts: Record<string, number>;
  user: ShellUser | null;
  /// The public copy of the product: only the supplier portal is served, so the frame offers nothing else.
  portalOnly?: boolean;
  children: ReactNode;
}) {
  // Closed by the sidebar itself on every link and workspace switch (`onNavigate`),
  // by the scrim, and by Escape.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hasAlerts = Object.values(counts).some((n) => n > 0);

  return (
    <div className="relative min-h-dvh">
      {/* The sidebar itself is fixed to the viewport; this strip is the same surface
          running the whole height of the page, so a long page, a full-page capture or
          overscroll never shows the canvas under it. */}
      <div aria-hidden="true" className="absolute inset-y-0 left-0 z-0 hidden w-68 border-r border-line/70 bg-surface lg:block print:hidden" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-line/70 bg-surface lg:block print:hidden">
        <Sidebar organisation={organisation} strapline={strapline} counts={counts} portalOnly={portalOnly} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] bg-surface shadow-pop">
            <Sidebar
              organisation={organisation}
              strapline={strapline}
              counts={counts}
              onNavigate={() => setOpen(false)}
              onClose={() => setOpen(false)}
              portalOnly={portalOnly}
            />
          </aside>
        </div>
      )}

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-68 print:pl-0">
        <Topbar
          organisation={organisation.name}
          user={user}
          hasAlerts={hasAlerts}
          onMenu={() => setOpen(true)}
        />
        <main className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-6 lg:px-8 print:p-0">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
