"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";

import {
  AwardIcon,
  BuildingIcon,
  ChartIcon,
  CheckIcon,
  ChevronDown,
  ClipboardIcon,
  ClockIcon,
  FilesIcon,
  GavelIcon,
  GlobeIcon,
  GridIcon,
  InboxIcon,
  ShieldIcon,
  SlidersIcon,
  ToolsIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { showsNameBesideLogo } from "@/lib/organisation/details";
import type { ShellOrganisation } from "@/lib/shell";
import {
  CONFIG_SECTIONS,
  navFor,
  STAFF_NAV,
  SUPPLIER_NAV,
  workspaceFor,
  type NavGroup,
  type Workspace,
} from "@/lib/nav";

const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  grid: GridIcon,
  globe: GlobeIcon,
  tools: ToolsIcon,
  building: BuildingIcon,
  files: FilesIcon,
  chart: ChartIcon,
  sliders: SlidersIcon,
  inbox: InboxIcon,
  users: UsersIcon,
  user: UserIcon,
  clipboard: ClipboardIcon,
  award: AwardIcon,
  shield: ShieldIcon,
  clock: ClockIcon,
};

/// Configuration's sections in the sidebar's own shape. Inside Configuration the
/// sidebar becomes its navigator — the settings pattern — so the sections never have
/// to sit in a second rail squeezed beside the screen.
const CONFIG_NAV: NavGroup[] = CONFIG_SECTIONS.map((g) => ({
  label: g.group,
  items: g.items.map(({ href, label, icon, built }) => ({ href, label, icon, built })),
}));

export function Sidebar({
  organisation,
  strapline,
  counts,
  onNavigate,
  onClose,
}: {
  organisation: ShellOrganisation;
  strapline: string;
  /// Outstanding-work counts keyed by href, shown as a badge on the nav item.
  counts: Record<string, number>;
  /// Called after a link is followed, so the mobile drawer can close.
  onNavigate?: () => void;
  /// Present only in the mobile drawer.
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = workspaceFor(pathname);
  const inConfig = pathname === "/configuration" || pathname.startsWith("/configuration/");
  const groups = inConfig ? CONFIG_NAV : navFor(workspace);

  const [switching, setSwitching] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const brand = useRef<HTMLDivElement>(null);

  // Close on Escape and on a click outside. Escape returns focus to the trigger,
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
    onNavigate?.();
    router.push(to === "supplier" ? SUPPLIER_NAV[0].items[0].href : STAFF_NAV[0].items[0].href);
  };

  const orgName = organisation.name;
  const logo = organisation.logo;
  const workspaceName = workspace === "supplier" ? "Supplier portal" : orgName;

  // Each section owns its subtree; the two workspace roots need an exact match so
  // /supplier/bids does not light Home as well.
  const isActive = (href: string) =>
    href === "/" || href === "/supplier" ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="flex h-full flex-col gap-2 px-4 pt-5 pb-4" aria-label="Main">
      <div className="flex items-center gap-2.5 px-2 pb-3">
        {logo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- the address is the logo's own fingerprint, so there is nothing for the image optimiser to add */}
            <img src={`/organisation/logo/${logo.sha}`} alt={showsNameBesideLogo(logo.width, logo.height) ? "" : orgName} className={showsNameBesideLogo(logo.width, logo.height) ? "max-h-16 max-w-[128px] object-contain" : "max-h-16 max-w-[232px] object-contain"} />
            {showsNameBesideLogo(logo.width, logo.height) && (
              <span className="min-w-0 truncate text-[15px] font-extrabold tracking-tight text-ink">{orgName}</span>
            )}
          </>
        ) : (
          <>
            <span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-white shadow-brand">
              <GavelIcon size={18} />
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-ink">Perolehan</span>
          </>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto grid size-9 place-items-center rounded-full text-ink-3 hover:bg-ink/5"
          >
            <XIcon size={18} />
          </button>
        )}
      </div>

      {inConfig ? (
        <div className="px-1">
          <Link
            href="/"
            onClick={onNavigate}
            className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-[13px] font-semibold text-ink-3 no-underline transition hover:bg-ink/5 hover:text-ink hover:no-underline"
          >
            <ChevronDown size={15} className="rotate-90" />
            Back to dashboard
          </Link>
          <div className="mt-3 px-2">
            <div className="text-[18px] font-bold tracking-tight text-ink">Configuration</div>
          </div>
        </div>
      ) : (
      /* The workspace you are in, which is also how you leave it. */
      <div className="relative" ref={brand}>
        <button
          type="button"
          ref={trigger}
          aria-haspopup="menu"
          aria-expanded={switching}
          aria-label={`Viewing as ${workspaceName}. Switch workspace`}
          onClick={() => setSwitching((open) => !open)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-sunken px-3 py-2.5 text-left transition hover:border-line-2 hover:bg-surface"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-brand-700 shadow-[0_1px_2px_rgb(15_23_42/0.08)]">
            {workspace === "supplier" ? <UserIcon size={16} /> : <BuildingIcon size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold text-ink">{workspaceName}</span>
            <span className="block truncate text-[12px] text-ink-3">{strapline}</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-ink-3" />
        </button>

        {switching && (
          <div
            role="menu"
            aria-label="Switch workspace"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
          >
            <div className="px-3 pt-2 pb-1 text-[11.5px] font-semibold text-ink-3">Viewing as</div>
            {(
              [
                ["internal", orgName, BuildingIcon],
                ["supplier", "Supplier portal", UserIcon],
              ] as const
            ).map(([id, label, Ico]) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={workspace === id}
                onClick={() => switchTo(id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] text-ink hover:bg-sunken aria-checked:font-semibold"
              >
                <Ico size={16} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {workspace === id && <CheckIcon size={15} className="text-brand-600" />}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group.label} className="mt-3.5 first:mt-1">
            <div className="px-3 pb-1.5 text-[11.5px] font-semibold text-ink-4">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Ico = ICONS[item.icon] ?? GridIcon;
                const count = counts[item.href];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group flex items-center gap-3 rounded-xl px-3 py-1.5 text-[14px] font-medium no-underline transition hover:no-underline",
                      active
                        ? "bg-brand-50 font-semibold text-brand-800"
                        : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
                    )}
                  >
                    <span
                      className={cx(
                        "grid size-7 place-items-center rounded-lg transition",
                        active ? "bg-brand-600 text-white" : "text-ink-3 group-hover:text-ink-2",
                      )}
                    >
                      <Ico size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {inConfig && !item.built && (
                      <span className="rounded-full bg-amber-100 px-2 text-[11px] leading-5 font-bold text-amber-800">
                        soon
                      </span>
                    )}
                    {count ? (
                      <span
                        className={cx(
                          "min-w-6 rounded-full px-1.5 text-center text-[11.5px] leading-5 font-bold",
                          item.href === "/" ? "bg-rose-500 text-white" : "bg-ink/[0.07] text-ink-2",
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
