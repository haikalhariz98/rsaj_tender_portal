import type { ReactNode } from "react";

import { PortalFrame, type PortalPage } from "@/components/auth/portal-frame";
import { DOOR_COLUMNS, DOOR_GRID, DoorCard, HighlightRow, ScreenFooter } from "@/components/auth/sign-in-parts";

import { cx } from "@/components/ui/cx";
import { showsNameBesideLogo } from "@/lib/organisation/details";
import type { SignInBranding } from "@/lib/organisation/sign-in-load";
import type { PortalBranding } from "@/lib/organisation/portal-load";
import { SHADE_FEATHER_PX, SHADE_FEATHER_SIDE_PX, shadeStyle, TAGLINE_SHADE_ALPHA, TEXT_SHADE_ALPHA } from "@/lib/organisation/sign-in-shading";

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
function StaffFrame({ branding, children }: { branding: SignInBranding; children: ReactNode }) {
  const { view, imageSha, logo, darkLogo } = branding;
  /// A square or near-square mark is drawn taller (as the sidebar draws it) so its small wordmark can be read; a wide one is already wide.
  const shown = darkLogo ?? logo;
  const beside = shown ? showsNameBesideLogo(shown.width, shown.height) : false;
  const logoAlt = view.organisationName ? `${view.organisationName} logo` : "Organisation logo";
  const logoClass = cx("w-auto object-contain", beside ? "h-14 max-w-40 lg:h-28 lg:max-w-72" : "h-12 max-w-64 lg:h-14");
  const showsTagline = !!view.tagline;
  return (
    <div className={view.hasPanel ? cx(DOOR_GRID, DOOR_COLUMNS) : "min-h-dvh"}>
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
              {view.highlights.length > 0 && <HighlightRow highlights={view.highlights} tone="dark" />}
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
          <DoorCard>{children}</DoorCard>
        </main>
        <ScreenFooter year={view.year} organisationName={view.organisationName} links={view.links} />
      </div>
    </div>
  );
}

type StaffProps = { variant?: "staff"; branding: SignInBranding; children: ReactNode };
type PortalProps = { variant: "portal"; branding: PortalBranding; page: PortalPage; children: ReactNode };

/// The frame of the sign-in screens. The staff variant is the officers' own door (a picture and words on a dark panel); the portal variant is the supplier portal's front door (see `PortalFrame`).
export function SignInScreen(props: StaffProps | PortalProps) {
  if (props.variant === "portal") return <PortalFrame branding={props.branding} page={props.page}>{props.children}</PortalFrame>;
  return <StaffFrame branding={props.branding}>{props.children}</StaffFrame>;
}
