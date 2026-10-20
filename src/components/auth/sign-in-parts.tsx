import type { ComponentType, ReactNode } from "react";

import { AwardIcon, BuildingIcon, ChartIcon, CheckIcon, ClockIcon, DocumentTextIcon, GlobeIcon, LockIcon, PeopleGroupIcon, ShieldCheckIcon, WalletIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import type { SignInIcon } from "@/lib/organisation/sign-in-page";
import { ICON_CIRCLE_STYLE } from "@/lib/organisation/sign-in-shading";

/// The drawing for each icon an organisation may choose. A `Record` over the whole set, so a new icon cannot be added to the set without its drawing.
export const HIGHLIGHT_ICON: Record<SignInIcon, ComponentType<{ size?: number }>> = {
  document: DocumentTextIcon,
  people: PeopleGroupIcon,
  shield: ShieldCheckIcon,
  check: CheckIcon,
  lock: LockIcon,
  clock: ClockIcon,
  chart: ChartIcon,
  award: AwardIcon,
  building: BuildingIcon,
  globe: GlobeIcon,
  wallet: WalletIcon,
};

/// The line under the card on both doors: the year, the organisation's name, and the Privacy, Terms and Help Desk links it configured. They belong to the organisation, not to a door.
export function ScreenFooter({ year, organisationName, links }: { year: string; organisationName: string; links: { label: string; href: string }[] }) {
  return (
    <footer className="mt-8 flex max-w-[460px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[12.5px] text-ink-2">
      <span>
        © {year}
        {organisationName && ` ${organisationName}`}
      </span>
      {links.map((l) => (
        <span key={l.label} className="flex items-center gap-3">
          <span aria-hidden="true" className="text-ink-4">
            |
          </span>
          <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded px-1 font-medium text-ink-2 underline decoration-ink-4 underline-offset-2 hover:text-ink sm:min-h-6">
            {l.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
      ))}
    </footer>
  );
}

/// The two-column page both doors share: the organisation's panel, then the task. A door may give its own column widths, never its own breakpoint or gap.
export const DOOR_GRID = "min-h-dvh lg:grid";
export const DOOR_COLUMNS = "lg:grid-cols-[48fr_52fr]";

/// The rounded card that holds a door's form or notice.
export function DoorCard({ children }: { children: ReactNode }) {
  return <Card className="rounded-[28px] p-6 shadow-pop sm:p-9">{children}</Card>;
}

/// The row of up to three highlights under a door's headline. `dark` is for the officers' photograph panel (white words, a translucent circle), `light` for the
/// portal's light panel. Only the colours and the size of the circle differ.
export function HighlightRow({ highlights, tone }: { highlights: { text: string; icon: SignInIcon | null }[]; tone: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <ul className={cx("hidden flex-wrap gap-x-6 lg:flex", dark ? "mt-8 gap-y-5" : "mt-6 gap-y-4")}>
      {highlights.map((h) => {
        const Glyph = HIGHLIGHT_ICON[h.icon ?? "check"];
        return (
          <li key={h.text} className={cx("flex w-[7.5rem] flex-col items-center text-center text-[14px] leading-snug font-semibold [overflow-wrap:anywhere]", dark ? "gap-3 text-white" : "gap-2 text-ink")}>
            <span className={cx("grid shrink-0 place-items-center rounded-full", dark ? "size-16" : "size-12 bg-brand-100 text-brand-700")} style={dark ? ICON_CIRCLE_STYLE : undefined}>
              <Glyph size={dark ? 26 : 22} />
            </span>
            {h.text}
          </li>
        );
      })}
    </ul>
  );
}
