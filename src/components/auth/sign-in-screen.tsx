import type { ReactNode } from "react";

import { CheckIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import type { SignInBranding } from "@/lib/organisation/sign-in-load";

/**
 * The frame of the staff sign-in screens: a picture and the organisation's words on the left, the form's card on the right, and the footer line under it.
 *
 * Everything on the left is the organisation's own and optional. With none of it set there is no panel at all and the card stands alone on the page, as
 * it did before. The logo is the one the sidebar shows, on a white chip so it reads over any picture; with none uploaded the spot stays empty. The picture
 * is decoration (an empty `alt`), darkened under the words so white text keeps its contrast whatever the photograph is. On a phone the panel is a short
 * band above the card and carries only the logo, the portal name and the headline.
 */
export function SignInScreen({ branding, children }: { branding: SignInBranding; children: ReactNode }) {
  const { view, imageSha, logo } = branding;
  return (
    <div className={view.hasPanel ? "min-h-dvh lg:grid lg:grid-cols-2" : "min-h-dvh"}>
      {view.hasPanel && (
        <aside className="relative isolate flex min-h-60 flex-col justify-between gap-8 overflow-hidden bg-brand-900 px-6 py-8 text-white sm:px-10 lg:min-h-dvh lg:px-14 lg:py-12">
          {imageSha && (
            // eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint
            <img src={`/sign-in/image/${imageSha}`} alt="" className="absolute inset-0 -z-20 size-full object-cover object-[20%_bottom]" />
          )}
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-ink/75 via-ink/55 to-ink/70 lg:bg-linear-to-r lg:from-ink/80 lg:via-ink/55 lg:to-ink/15" />

          <div className="min-h-12">
            {logo && (
              <span className="inline-flex rounded-2xl bg-white p-2.5 shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
                <img src={`/organisation/logo/${logo.sha}`} alt={view.organisationName ? `${view.organisationName} logo` : "Organisation logo"} className="h-10 w-auto max-w-56 object-contain lg:h-12" />
              </span>
            )}
          </div>

          <div className="max-w-xl">
            {view.portalName && <p className="text-[12.5px] font-semibold tracking-[0.22em] text-white uppercase">{view.portalName}</p>}
            {view.headline && <h2 className="mt-3 text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance sm:text-[36px] lg:text-[52px]">{view.headline}</h2>}
            {view.supportingText && <p className="mt-5 hidden max-w-md text-[16px] leading-relaxed text-white lg:block">{view.supportingText}</p>}
            {view.highlights.length > 0 && (
              <ul className="mt-10 hidden flex-wrap gap-x-8 gap-y-5 lg:flex">
                {view.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-3 text-[14px] font-semibold">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/50">
                      <CheckIcon size={20} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="hidden min-h-5 text-[14px] text-white lg:block">{view.tagline}</p>
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
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="rounded font-medium text-ink-2 underline decoration-ink-4 underline-offset-2 hover:text-ink">
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
