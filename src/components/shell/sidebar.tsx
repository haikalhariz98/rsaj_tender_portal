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

export function Sidebar({ organisation, department }: { organisation: string; department: string | null }) {
  const pathname = usePathname();
  const workspace = workspaceFor(pathname);
  const groups = navFor(workspace);

  // A section owns its subtree; the two workspace roots need an exact match so that
  // /supplier/bids does not light up Home as well.
  const isActive = (href: string) =>
    href === "/" || href === "/supplier" ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="sb-mark">
          <GavelIcon size={22} />
        </span>
        <span className="sb-brandtext">
          <span className="sb-name">Perolehan</span>
          <span className="sb-sub">
            {workspace === "supplier" ? "Supplier portal" : organisation}
          </span>
        </span>
      </div>

      <nav className="sb-nav" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="navgroup">{group.label}</div>
            {group.items.map((item) => {
              const Ico = ICONS[item.icon] ?? GridIcon;
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
                  <span className="navitem__label">{item.label}</span>
                  {!item.built && <span className="navitem__badge">soon</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <span className="sb-foottext xs dim trunc">
          {workspace === "supplier" ? "Supplier workspace" : (department ?? "Setup incomplete")}
        </span>
      </div>
    </aside>
  );
}
