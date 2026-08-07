"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GavelIcon, RouteIcon, ScaleIcon, UsersIcon } from "@/components/icons";

const NAV = [
  {
    group: "Governance",
    items: [
      { href: "/", label: "Approval routing", icon: RouteIcon },
      { href: "/authority", label: "Authority limits", icon: ScaleIcon },
      { href: "/committees", label: "Committees", icon: UsersIcon },
    ],
  },
] as const;

export function Sidebar({ organisation, dalLabel }: { organisation: string; dalLabel: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="sb-mark">
          <GavelIcon size={22} />
        </span>
        <span className="sb-brandtext">
          <span className="sb-name">Perolehan</span>
          <span className="sb-sub">{organisation}</span>
        </span>
      </div>

      <nav className="sb-nav" aria-label="Main">
        {NAV.map((group) => (
          <div key={group.group}>
            <div className="navgroup">{group.group}</div>
            {group.items.map((item) => {
              // Only "/" needs an exact match; the rest own their subtree.
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Ico = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="navitem"
                  aria-current={active ? "page" : undefined}
                >
                  <span className="navitem__ico">
                    <Ico />
                  </span>
                  <span className="navitem__label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <span className="sb-foottext xs dim trunc" title={dalLabel ?? undefined}>
          {dalLabel ? `Authority limits ${dalLabel}` : "No authority limits in effect"}
        </span>
      </div>
    </aside>
  );
}
