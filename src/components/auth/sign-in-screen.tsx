import type { ComponentType, ReactNode } from "react";

import { AwardIcon, ChartIcon, CheckIcon, ClockIcon, DocumentTextIcon, LockIcon, PeopleGroupIcon, ShieldCheckIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { showsNameBesideLogo } from "@/lib/organisation/details";
import type { SignInBranding } from "@/lib/organisation/sign-in-load";
import type { SignInIcon } from "@/lib/organisation/sign-in-page";
import { ICON_CIRCLE_STYLE, SHADE_FEATHER_PX, SHADE_FEATHER_SIDE_PX, shadeStyle, TAGLINE_SHADE_ALPHA, TEXT_SHADE_ALPHA } from "@/lib/organisation/sign-in-shading";

/// The drawing for each icon an organisation may choose. A `Record` over the whole set, so a new icon cannot be added to the set without its drawing.
const HIGHLIGHT_ICON: Record<SignInIcon, ComponentType<{ size?: number }>> = {
  document: DocumentTextIcon,
  people: PeopleGroupIcon,
  shield: ShieldCheckIcon,
  check: CheckIcon,
  lock: LockIcon,
  clock: ClockIcon,
  chart: ChartIcon,
  award: AwardIcon,
};

/**
 * The frame of the staff sign-in screens: a picture and the organisation's words on the left, the form's card on the right, and the footer line under it.
 *
 * Everything on the left is the organisation's own and optional. With none of it set there is no panel at all and the card stands alone on the page, as
 * it did before. The picture is decoration (an empty `alt`) and fills the left panel only: it is bright, not darkened across the panel, and sits at the
 * panel's foot, zoomed in on the middle of it, with its own sky carried on above it. Shading sits only behind the words, one block for the top of the
 * panel and one for the tagline, each as strong as it needs to be for white text to keep 4.5:1 over even a pure white pixel (see sign-in-shading.ts), so no
 * photograph an organisation uploads can make the words unreadable.
 *
 * The logo is the organisation's own, never recoloured. With a logo for dark backgrounds it is drawn as it is. Without one the ordinary logo is drawn with no
 * box behind it and a soft light halo that follows its outline (`drop-shadow`, which adds light around the mark and changes none of its colours), so dark
 * lettering still reads on the shaded photograph. A logo for dark backgrounds, such as one in white, reads better still and is the proper fix.
 *
 * On a phone the panel is a short band above the card and carries only the logo, the portal name and the headline.
 */
export function SignInScreen({ branding, children }: { branding: SignInBranding; children: ReactNode }) {
  const { view, imageSha, logo, darkLogo } = branding;
  /// A square or near-square mark is drawn taller (as the sidebar draws it) so its small wordmark can be read; a wide one is already wide.
  const shown = darkLogo ?? logo;
  const beside = shown ? showsNameBesideLogo(shown.width, shown.height) : false;
  const logoAlt = view.organisationName ? `${view.organisationName} logo` : "Organisation logo";
  const logoClass = cx("w-auto object-contain", beside ? "h-14 max-w-40 lg:h-28 lg:max-w-72" : "h-12 max-w-64 lg:h-14");
  const showsTagline = !!view.tagline;
  return (
    <div className={view.hasPanel ? "min-h-dvh lg:grid lg:grid-cols-[48fr_52fr]" : "min-h-dvh"}>
      {view.hasPanel && (
        <aside className="relative isolate flex min-h-60 flex-col justify-between overflow-hidden bg-brand-900 text-white lg:min-h-dvh">
          {imageSha && (
            <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden">
              {/* The same picture, blurred, only where the zoomed one below does not reach: it carries the picture's own sky on above its top edge. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
              <img src={`/sign-in/image/${imageSha}`} alt="" decoding="async" className="absolute inset-0 hidden size-full scale-125 object-cover blur-2xl lg:block" />
              {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
              <img
                src={`/sign-in/image/${imageSha}`}
                alt=""
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 size-full object-cover lg:inset-auto lg:bottom-0 lg:left-[-25%] lg:h-auto lg:w-[150%] lg:max-w-none lg:[mask-image:linear-gradient(to_bottom,transparent,#000_30%)]"
              />
            </div>
          )}

          <div className="relative px-6 pt-8 pb-6 sm:px-10 lg:px-14 lg:pt-10 lg:pb-8">
            <div className="relative max-w-[34rem] pb-3">
              {/* The shade is the size of this column and the panel's edge to its left, and runs on past the column's right and bottom by the length of its fade. */}
              <div aria-hidden="true" className="absolute -z-10" style={{ top: -80, left: "-100vw", right: -SHADE_FEATHER_SIDE_PX, bottom: -SHADE_FEATHER_PX, ...shadeStyle(TEXT_SHADE_ALPHA, { bottom: true, right: true }) }} />

              {shown && (
                <div className="mb-8 min-h-12 lg:mb-10">
                  {darkLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint
                    <img src={`/sign-in/image/${darkLogo.sha}`} width={darkLogo.width} height={darkLogo.height} alt={logoAlt} className={logoClass} />
                  ) : (
                    logo && (
                      // eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint
                      <img src={`/organisation/logo/${logo.sha}`} width={logo.width} height={logo.height} alt={logoAlt} className={cx(logoClass, "[filter:drop-shadow(0_0_1px_#fff)_drop-shadow(0_0_5px_rgb(255_255_255/0.95))]")} />
                    )
                  )}
                </div>
              )}

              {view.portalName && <p className="text-[12.5px] font-semibold tracking-[0.22em] text-white uppercase">{view.portalName}</p>}
              {view.headline && <p className="mt-3 text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance text-white sm:text-[36px] lg:text-[52px]">{view.headline}</p>}
              {view.supportingText && <p className="mt-5 hidden max-w-md text-[16px] leading-relaxed text-white lg:block">{view.supportingText}</p>}
              {view.highlights.length > 0 && (
                <ul className="mt-8 hidden flex-wrap gap-x-6 gap-y-5 lg:flex">
                  {view.highlights.map((h) => {
                    const Glyph = HIGHLIGHT_ICON[h.icon ?? "check"];
                    return (
                      <li key={h.text} className="flex w-[7.5rem] flex-col items-center gap-3 text-center text-[14px] leading-snug font-semibold [overflow-wrap:anywhere] text-white">
                        <span className="grid size-16 shrink-0 place-items-center rounded-full" style={ICON_CIRCLE_STYLE}>
                          <Glyph size={26} />
                        </span>
                        {h.text}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {showsTagline && (
            <div className="relative hidden px-6 pt-6 pb-10 sm:px-10 lg:block lg:px-14">
              <div className="relative max-w-xs pt-3">
                <div aria-hidden="true" className="absolute -z-10" style={{ top: -SHADE_FEATHER_PX, left: "-100vw", right: -SHADE_FEATHER_SIDE_PX, bottom: -40, ...shadeStyle(TAGLINE_SHADE_ALPHA, { top: true, right: true }) }} />
                <p className="text-[14px] leading-snug text-white">{view.tagline}</p>
              </div>
            </div>
          )}
        </aside>
      )}

      <div className={`flex flex-col items-center justify-center px-4 py-10 sm:px-6 ${view.hasPanel ? "lg:min-h-dvh" : "min-h-dvh"}`}>
        <main className="w-full max-w-[460px]">
          {!view.hasPanel && view.organisationName && <div className="mb-6 text-center text-[13.5px] font-semibold text-ink-3">{view.organisationName}</div>}
          <Card className="rounded-[28px] p-6 shadow-pop sm:p-9">{children}</Card>
        </main>
        <footer className="mt-8 flex max-w-[460px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[12.5px] text-ink-2">
          <span>
            © {view.year}
            {view.organisationName && ` ${view.organisationName}`}
          </span>
          {view.links.map((l) => (
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
      </div>
    </div>
  );
}
