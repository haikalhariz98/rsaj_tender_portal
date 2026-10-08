import type { NextRequest } from "next/server";

import { currentStaffOrNull } from "@/app/_auth/actor";
import { db } from "@/lib/db";
import { deploymentOrganisation } from "@/lib/portal/deployment";

/**
 * The sign-in page's image, and the organisation's logo for the dark side of that page, by their fingerprints.
 *
 * Both are the organisation's own pictures for the same public page, so they are served by one address, looked up in this organisation's rows only.
 *
 * Served as the logo is, and for the same reason it is public: it is drawn on a page nobody is signed in to see. The address changes whenever the
 * image does, so it can be cached for good. The type is the one sniffed from the bytes when it was uploaded, `nosniff` stops a browser second-guessing it,
 * and the sandbox policy means that even if something other than an image were ever stored, opening this address directly could not run it.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/sign-in/image/[sha]">) {
  const { sha } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha)) return missing();

  // Whose image: the signed-in person's organisation (the configuration screen's preview), else the deployment's one (the sign-in page) (ADR 0034 D10).
  const organisationId = (await currentStaffOrNull())?.organisationId ?? (await deploymentOrganisation())?.id;
  if (!organisationId) return missing();
  const select = { bytes: true, mediaType: true } as const;
  const image =
    (await db.organisationSignInImage.findFirst({ where: { sha256: sha, organisationId }, select })) ??
    (await db.organisationSignInDarkLogo.findFirst({ where: { sha256: sha, organisationId }, select }));
  if (!image) return missing();

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mediaType,
      "Content-Length": String(image.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}

function missing() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
