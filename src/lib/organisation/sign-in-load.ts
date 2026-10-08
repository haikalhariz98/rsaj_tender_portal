/**
 * What the sign-in screens need to draw the organisation: its logo, its sign-in image and its sign-in words, read for one organisation.
 *
 * The organisation is named as the shell names it, by its short name and else its legal one (`displayName`), so the page, the logo's alt text and the footer
 * agree with the sidebar.
 *
 * Not a deployment module: the caller names the organisation (the sign-in page has it from `signInOrganisation()`), so this file never reaches for the
 * deployment's one.
 */
import { db } from "@/lib/db";

import { displayName } from "./details";
import { signInView, type SignInView } from "./sign-in-page";

export interface SignInBranding {
  view: SignInView;
  /// The image's fingerprint, served from `/sign-in/image/<sha>`; null until one is uploaded.
  imageSha: string | null;
  /// The logo's fingerprint, served from `/organisation/logo/<sha>`: the one the sidebar shows. Null until one is uploaded: nothing stands in for it.
  logo: { sha: string; width: number; height: number } | null;
  /// The organisation's own logo for the dark, shaded side, served from `/sign-in/image/<sha>`. Null until one is uploaded: the page then shows `logo` on a light
  /// translucent backdrop. The page never judges whether a logo reads and never recolours one.
  darkLogo: { sha: string; width: number; height: number } | null;
}

/// What the page draws when nothing can be read: the card alone. The picture and words are decoration around the form, so a fault reading them is
/// logged and never closes sign-in (as the frame's own loader treats its decoration).
const bare = (now: Date, organisationName: string, timeZone: string | null): SignInBranding => ({
  view: signInView(null, { organisationName, hasImage: false, hasLogo: false, now, timeZone }),
  imageSha: null,
  logo: null,
  darkLogo: null,
});

/// What a fault reading the picture and words can still say: the organisation's name and zone, which sit on its own row (a second, narrow read; empty if that fails too).
async function plainFacts(organisationId: string | null): Promise<{ name: string; timeZone: string | null }> {
  if (!organisationId) return { name: "", timeZone: null };
  try {
    const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { name: true, shortName: true, timeZone: true } });
    return org ? { name: displayName(org), timeZone: org.timeZone } : { name: "", timeZone: null };
  } catch {
    return { name: "", timeZone: null };
  }
}

export async function loadSignInBranding(organisationId: string | null, now: Date = new Date()): Promise<SignInBranding> {
  let org;
  try {
    org = organisationId
      ? await db.organisation.findUnique({
          where: { id: organisationId },
          select: {
            name: true,
            shortName: true,
            timeZone: true,
            logo: { select: { sha256: true, width: true, height: true } },
            signInImage: { select: { sha256: true } },
            signInDarkLogo: { select: { sha256: true, width: true, height: true } },
            signInPage: true,
          },
        })
      : null;
  } catch (error) {
    console.error("The sign-in page's picture and words could not be read; the form is shown alone.", error);
    const plain = await plainFacts(organisationId);
    return bare(now, plain.name, plain.timeZone);
  }
  const logo = org?.logo ? { sha: org.logo.sha256, width: org.logo.width, height: org.logo.height } : null;
  const darkLogo = org?.signInDarkLogo ? { sha: org.signInDarkLogo.sha256, width: org.signInDarkLogo.width, height: org.signInDarkLogo.height } : null;
  const imageSha = org?.signInImage?.sha256 ?? null;
  const view = signInView(org?.signInPage ?? null, { organisationName: org ? displayName(org) : "", hasImage: imageSha != null, hasLogo: logo != null || darkLogo != null, now, timeZone: org?.timeZone ?? null });
  return { view, imageSha, logo, darkLogo };
}
