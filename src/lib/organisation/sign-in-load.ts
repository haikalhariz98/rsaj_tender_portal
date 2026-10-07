/**
 * What the sign-in screens need to draw the organisation: its logo, its sign-in image and its sign-in words, read for one organisation.
 *
 * Not a deployment module: the caller names the organisation (the sign-in page has it from `signInOrganisation()`), so this file never reaches for the
 * deployment's one.
 */
import { db } from "@/lib/db";

import { signInView, type SignInView } from "./sign-in-page";

export interface SignInBranding {
  view: SignInView;
  /// The image's fingerprint, served from `/sign-in/image/<sha>`; null until one is uploaded.
  imageSha: string | null;
  /// The logo's fingerprint, served from `/organisation/logo/<sha>`: the one the sidebar shows. Null until one is uploaded: nothing stands in for it.
  logo: { sha: string; width: number; height: number } | null;
}

/// What the page draws when nothing can be read: the card alone. The picture and words are decoration around the form, so a fault reading them is
/// logged and never closes sign-in (as the frame's own loader treats its decoration).
const bare = (now: Date): SignInBranding => ({ view: signInView(null, { organisationName: "", hasImage: false, hasLogo: false, now, timeZone: null }), imageSha: null, logo: null });

export async function loadSignInBranding(organisationId: string | null, now: Date = new Date()): Promise<SignInBranding> {
  let org;
  try {
    org = organisationId
      ? await db.organisation.findUnique({
          where: { id: organisationId },
          select: {
            name: true,
            timeZone: true,
            logo: { select: { sha256: true, width: true, height: true } },
            signInImage: { select: { sha256: true } },
            signInPage: true,
          },
        })
      : null;
  } catch (error) {
    console.error("The sign-in page's picture and words could not be read; the form is shown alone.", error);
    return bare(now);
  }
  const logo = org?.logo ? { sha: org.logo.sha256, width: org.logo.width, height: org.logo.height } : null;
  const imageSha = org?.signInImage?.sha256 ?? null;
  const view = signInView(org?.signInPage ?? null, { organisationName: org?.name ?? "", hasImage: imageSha != null, hasLogo: logo != null, now, timeZone: org?.timeZone ?? null });
  return { view, imageSha, logo };
}
