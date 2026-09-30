"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { ShellUser } from "@/lib/shell";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/// The frame around every screen. Owns one piece of state: whether the navigation
/// drawer is open on a narrow screen. On wide screens the sidebar is always there.
export function AppShell({
  organisation,
  strapline,
  counts,
  user,
  children,
}: {
  organisation: string;
  strapline: string;
  counts: Record<string, number>;
  user: ShellUser | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A route change closes the drawer, whatever caused it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hasAlerts = Object.values(counts).some((n) => n > 0);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-line/70 bg-surface lg:block">
        <Sidebar organisation={organisation} strapline={strapline} counts={counts} />
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
            />
          </aside>
        </div>
      )}

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-68">
        <Topbar
          organisation={organisation}
          user={user}
          hasAlerts={hasAlerts}
          onMenu={() => setOpen(true)}
        />
        <main className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
