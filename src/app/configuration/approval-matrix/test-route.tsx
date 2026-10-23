"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { AuthoritySimulator } from "@/components/authority-simulator";
import { RouteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";

/// "Test a route": the existing simulator in a drawer, so it is a button on the page and not a setting on it.
export function TestRoute(props: ComponentProps<typeof AuthoritySimulator>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button variant="secondary" size="sm" icon={<RouteIcon size={14} />} onClick={() => setOpen(true)}>
        Test a route
      </Button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label="Test a route" className={drawerPanelClass("xl")}>
            <DrawerHeader icon={<RouteIcon size={17} />} title="Test a route" onClose={() => setOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              <AuthoritySimulator {...props} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
