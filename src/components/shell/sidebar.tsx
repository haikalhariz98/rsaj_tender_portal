"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";

import {
  BuildingIcon,
  ChartIcon,
  ChevronDown,
  FilesIcon,
  GavelIcon,
  GlobeIcon,
  GridIcon,
  InboxIcon,
  PanelLeftIcon,
  SlidersIcon,
  ToolsIcon,
  UserIcon,
} from "@/components/icons";
import { navFor, STAFF_NAV, SUPPLIER_NAV, workspaceFor, type Workspace } from "@/lib/nav";

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  grid: GridIcon,
  globe: GlobeIcon,
  tools: ToolsIcon,
  building: BuildingIcon,
  files: FilesIcon,
  chart: ChartIcon,
  sliders: SlidersIcon,
  inbox: InboxIcon,
};

export function Sidebar({
  organisation,
  strapline,
  counts,
}: {
  organisation: string;
  strapline: string;
  /// Outstanding-work counts keyed by href, shown as a badge on the nav item.
  counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = workspaceFor(pathname);
  const groups = navFor(workspace);

  const [switching, setSwitching] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const brand = useRef<HTMLDivElement>(null);

  // Close on Escape and on a click outside. Escape returns focus to the chevron,
  // because a menu that closes and drops the caret leaves a keyboard user nowhere.
  useEffect(() => {
    if (!switching) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSwitching(false);
      trigger.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!brand.current?.contains(e.target as Node)) setSwitching(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [switching]);

  /// Switching workspace navigates. Which portal you are in is a property of the URL,
  /// not state held off-screen, so this pushes to the other side's first screen.
  const switchTo = (to: Workspace) => {
    setSwitching(false);
    router.push(to === "supplier" ? SUPPLIER_NAV[0].items[0].href : STAFF_NAV[0].items[0].href);
  };

  const workspaceName = workspace === "supplier" ? "Supplier portal" : organisation;

  // Each section owns its subtree; the two workspace roots need an exact match so
  // /supplier/bids does not light Home as well.
  const isActive = (href: string) =>
    href === "/" || href === "/supplier" ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="sidebar">
      {/* The brand block already names the workspace you are in, so it is also how you
          leave it. Stating the same fact twice — here and in a top-bar switcher — cost
          the breadcrumb its room, and the top bar dropped the one word ("Viewing as")
          that identified the control as a switch at exactly the widths where it was
          needed most. */}
      <div className="sb-brand" ref={brand} style={{ position: "relative" }}>
        {/* Drop a logo at /public/logo.png and swap this for an <Image>. */}
        <span className="sb-mark">
          <GavelIcon size={22} />
        </span>
        <div className="sb-brandtext grow">
          <div className="sb-name trunc">{workspaceName}</div>
          <div className="sb-sub trunc">{strapline}</div>
        </div>
        <button
          type="button"
          ref={trigger}
          className="iconbtn"
          aria-haspopup="menu"
          aria-expanded={switching}
          aria-label={`Viewing as ${workspaceName}. Switch workspace`}
          onClick={() => setSwitching((open) => !open)}
        >
          <ChevronDown size={17} />
        </button>

        {switching && (
          <div
            className="popover"
            role="menu"
            aria-label="Switch workspace"
            style={{ top: "calc(100% + 4px)", left: 12, right: 12 }}
          >
            <div className="menu__t">Viewing as</div>
            <button
              type="button"
              className="menu__i"
              role="menuitemradio"
              aria-checked={workspace === "internal"}
              onClick={() => switchTo("internal")}
            >
              <BuildingIcon size={16} />
              <span className="trunc">{organisation}</span>
            </button>
            <button
              type="button"
              className="menu__i"
              role="menuitemradio"
              aria-checked={workspace === "supplier"}
              onClick={() => switchTo("supplier")}
            >
              <UserIcon size={16} />
              <span className="trunc">Supplier portal</span>
            </button>
          </div>
        )}
      </div>

      <div className="sb-nav">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="navgroup">{group.label}</div>
            {group.items.map((item) => {
              const Ico = ICONS[item.icon] ?? GridIcon;
              const count = counts[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="navitem"
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <span className="navitem__ico">
                    <Ico />
                  </span>
                  <span className="navitem__label trunc">{item.label}</span>
                  {count ? (
                    <span
                      className={`navitem__badge${item.href === "/" ? " navitem__badge--alert" : ""}`}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <button type="button" className="iconbtn" aria-label="Collapse navigation" disabled>
          <PanelLeftIcon size={17} />
        </button>
        <span className="sb-foottext xs faint trunc">{organisation} · Procurement</span>
      </div>
    </nav>
  );
}
