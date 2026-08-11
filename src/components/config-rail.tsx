"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ComponentType } from "react";

import {
  BuildingIcon,
  ChartIcon,
  FilesIcon,
  GlobeIcon,
  GridIcon,
  InboxIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { CONFIG_SECTIONS } from "@/lib/nav";

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  building: BuildingIcon,
  users: UsersIcon,
  user: UserIcon,
  chart: ChartIcon,
  sliders: SlidersIcon,
  grid: GridIcon,
  files: FilesIcon,
  globe: GlobeIcon,
  inbox: InboxIcon,
};

/**
 * The section navigator that sits beside every Configuration screen.
 *
 * Group headings and their items are flat siblings of `.subnav`, as in the prototype.
 * They must not be wrapped in a per-group element: below 1440px the stylesheet turns
 * `.subnav` into a wrapping row of pills and hides the headings, and a wrapper would
 * become a flex item of its own — one ragged column per group instead of one row.
 */
export function ConfigRail() {
  const pathname = usePathname();

  return (
    <div className="cfg-rail">
      <div className="card">
        <div className="card__body card__body--flush">
          <nav className="subnav" aria-label="Configuration sections">
            {CONFIG_SECTIONS.map((group) => (
              <Fragment key={group.group}>
                <div className="subnav__group lbl">{group.group}</div>
                {group.items.map((item) => {
                  const Ico = ICONS[item.icon] ?? GridIcon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="subnav__i"
                      aria-current={active ? "page" : undefined}
                    >
                      <Ico size={16} />
                      <span className="trunc">{item.label}</span>
                      {!item.built && <span className="navitem__badge">soon</span>}
                    </Link>
                  );
                })}
              </Fragment>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
