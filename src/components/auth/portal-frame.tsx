import Link from "next/link";
import type { ReactNode } from "react";

import { PortalIllustration } from "@/components/auth/portal-illustration";
import { DOOR_COLUMNS, DOOR_GRID, DoorCard, HighlightRow, ScreenFooter } from "@/components/auth/sign-in-parts";
import { BuildingIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { showsNameBesideLogo } from "@/lib/organisation/details";
import type { PortalBranding } from "@/lib/organisation/portal-load";

/// Which of the portal's four front-door pages is drawn: the register page has a wide form.
export type PortalPage = "sign-in" | "register" | "activate" | "reset";

/**
 * The supplier portal's front door (design note 0006): what the portal is for on a light panel (the organisation's logo, a headline, one line, up to three
 * highlights and an illustration), and the one task on the right. The same on the public copy and the officers' copy: only what `children` holds differs, the
 * form on one and a card that points officers to the public portal on the other.
 *
 * Everything on the panel but the illustration is the organisation's own and optional. The panel never names the staff sign-in picture or the logo for dark
 * backgrounds, because their route is refused on the public copy: only the ordinary logo, from `/organisation/logo/<sha>`. The illustration is inline and
 * decorative and shrinks to the room the panel has. Register's column is wider for its form. The panel holds no button, so each page keeps the one primary
 * action it has on the right.
 */
export function PortalFrame({ branding, page, children }: { branding: PortalBranding; page: PortalPage; children: ReactNode }) {
  const { view, logo, organisationName, year, links } = branding;
  const isRegister = page === "register";
  const beside = logo ? showsNameBesideLogo(logo.width, logo.height) : false;
  const logoAlt = organisationName ? `${organisationName} logo` : "Organisation logo";
  return (
    <div className={cx(DOOR_GRID, isRegister ? "lg:grid-cols-[40fr_60fr]" : DOOR_COLUMNS)}>
      <aside className="relative flex min-h-60 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain bg-gradient-to-b from-brand-50 to-white px-6 pt-8 pb-6 sm:px-10 lg:sticky lg:top-0 lg:h-dvh lg:gap-5 lg:px-14 lg:pt-10 lg:pb-8">
        {(logo || organisationName) && (
          <Link href="/supplier" className="inline-flex min-h-12 w-fit items-center rounded-lg text-[20px] font-extrabold tracking-[-0.01em] text-ink">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint
              <img src={`/organisation/logo/${logo.sha}`} width={logo.width} height={logo.height} alt={logoAlt} className={cx("w-auto object-contain", beside ? "h-14 max-w-40 lg:h-20 lg:max-w-56" : "h-12 max-w-64")} />
            ) : (
              organisationName
            )}
          </Link>
        )}

        <div className="max-w-[34rem]">
          <p className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance text-ink sm:text-[36px] lg:text-[44px]">{view.headline}</p>
          {view.line && <p className="mt-4 hidden max-w-md text-[16px] leading-relaxed text-ink-2 lg:block">{view.line}</p>}
          {view.highlights.length > 0 && <HighlightRow highlights={view.highlights} tone="light" />}
        </div>

        <div className="hidden min-h-0 flex-1 items-center justify-center lg:flex">
          <PortalIllustration className="h-full max-h-[400px] w-full max-w-[460px]" />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          {isRegister ? (
            <main className="w-full max-w-[720px]">{children}</main>
          ) : (
            <>
              <main className="w-full max-w-[460px]">
                <DoorCard>{children}</DoorCard>
              </main>
              <div className="mt-6 flex w-full max-w-[460px] flex-col gap-2">
                <p className="text-center text-[13.5px] font-semibold text-ink-2">New supplier?</p>
                <ButtonLink href="/supplier/register" wholeDocument variant="secondary" size="lg" block icon={<BuildingIcon size={18} />} className="h-auto min-h-12 py-2.5 text-center">
                  Register
                </ButtonLink>
              </div>
            </>
          )}
          <ScreenFooter year={year} organisationName={organisationName} links={links} />
        </div>
      </div>
    </div>
  );
}
