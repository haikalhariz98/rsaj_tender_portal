import type { ComponentType } from "react";

import { AwardIcon, BuildingIcon, ChartIcon, CheckIcon, ClockIcon, DocumentTextIcon, GlobeIcon, LockIcon, PeopleGroupIcon, ShieldCheckIcon, WalletIcon } from "@/components/icons";
import type { SignInIcon } from "@/lib/organisation/sign-in-page";

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
