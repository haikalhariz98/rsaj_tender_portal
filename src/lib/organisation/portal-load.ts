/**
 * What the supplier portal's front door needs to draw the organisation (design note 0006): its ordinary logo, its name, the footer links the staff sign-in
 * page already carries, and the portal's own words. Read for one organisation, the caller naming it.
 *
 * The picture and words are decoration around a form, so a fault reading any of them is logged and the page draws the bare product state (the illustration and
 * "Supplier portal"). It never closes sign-in. The whole read, the portal row included, sits inside one `try`, so a database that has not been migrated yet
 * fails to the bare state rather than to an error page.
 *
 * Only the ordinary logo is read, served from `/organisation/logo/<sha>`. The staff picture and the dark logo are served from `/sign-in/image/<sha>`, which the
 * public copy refuses, so this never names them.
 */
import { db } from "@/lib/db";

import { displayName } from "./details";
import { portalView, type PortalView } from "./portal-page";
import { signInView } from "./sign-in-page";

export interface PortalBranding {
  organisationName: string;
  year: string;
  /// The footer's Privacy, Terms and Help Desk links: the organisation's, only those set and safe.
  links: { label: string; href: string }[];
  /// The ordinary logo, served from `/organisation/logo/<sha>`. Null until one is uploaded: nothing stands in for it.
  logo: { sha: string; width: number; height: number } | null;
  view: PortalView;
}

const bare = (now: Date, organisationName: string, timeZone: string | null): PortalBranding => ({
  organisationName,
  year: signInView(null, { organisationName, hasImage: false, hasLogo: false, now, timeZone }).year,
  links: [],
  logo: null,
  view: portalView(null),
});

/// What a fault reading the rest can still say: the organisation's name and zone (a second, narrow read; empty if that fails too).
async function plainFacts(organisationId: string | null): Promise<{ name: string; timeZone: string | null }> {
  if (!organisationId) return { name: "", timeZone: null };
  try {
    const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { name: true, shortName: true, timeZone: true } });
    return org ? { name: displayName(org), timeZone: org.timeZone } : { name: "", timeZone: null };
  } catch {
    return { name: "", timeZone: null };
  }
}

export async function loadPortalBranding(organisationId: string | null, now: Date = new Date()): Promise<PortalBranding> {
  try {
    const org = organisationId
      ? await db.organisation.findUnique({
          where: { id: organisationId },
          select: {
            name: true,
            shortName: true,
            timeZone: true,
            logo: { select: { sha256: true, width: true, height: true } },
            signInPage: true,
            portalPage: true,
          },
        })
      : null;
    const name = org ? displayName(org) : "";
    const { year, links } = signInView(org?.signInPage ?? null, { organisationName: name, hasImage: false, hasLogo: false, now, timeZone: org?.timeZone ?? null });
    return {
      organisationName: name,
      year,
      links,
      logo: org?.logo ? { sha: org.logo.sha256, width: org.logo.width, height: org.logo.height } : null,
      view: portalView(org?.portalPage ?? null),
    };
  } catch (error) {
    console.error("The supplier portal's picture and words could not be read; the page is drawn plain.", error);
    const plain = await plainFacts(organisationId);
    return bare(now, plain.name, plain.timeZone);
  }
}
