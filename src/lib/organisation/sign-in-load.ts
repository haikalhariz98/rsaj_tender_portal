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

export async function loadSignInBranding(organisationId: string | null, now: Date = new Date()): Promise<SignInBranding> {
  const org = organisationId
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
  const logo = org?.logo ? { sha: org.logo.sha256, width: org.logo.width, height: org.logo.height } : null;
  const imageSha = org?.signInImage?.sha256 ?? null;
  const view = signInView(org?.signInPage ?? null, { organisationName: org?.name ?? "", hasImage: imageSha != null, hasLogo: logo != null, now, timeZone: org?.timeZone ?? null });
  return { view, imageSha, logo };
}
