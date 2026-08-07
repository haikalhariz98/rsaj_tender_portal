"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  BuildingIcon,
  ChartIcon,
  FilesIcon,
  GavelIcon,
  GlobeIcon,
  GridIcon,
  InboxIcon,
  PanelLeftIcon,
  SlidersIcon,
  ToolsIcon,
} from "@/components/icons";
import { navFor, workspaceFor } from "@/lib/nav";

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
  const workspace = workspaceFor(pathname);
  const groups = navFor(workspace);

  // Each section owns its subtree; the two workspace roots need an exact match so
  // /supplier/bids does not light Home as well.
  const isActive = (href: string) =>
    href === "/" || href === "/supplier" ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="sidebar">
      <div className="sb-brand">
        {/* Drop a logo at /public/logo.png and swap this for an <Image>. */}
        <span className="sb-mark">
          <GavelIcon size={22} />
        </span>
        <div className="sb-brandtext">
          <div className="sb-name trunc">
            {workspace === "supplier" ? "Supplier portal" : organisation}
          </div>
          <div className="sb-sub trunc">{strapline}</div>
        </div>
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
