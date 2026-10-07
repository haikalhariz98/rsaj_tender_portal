import type { NextRequest } from "next/server";

import { currentStaffOrNull } from "@/app/_auth/actor";
import { db } from "@/lib/db";
import { deploymentOrganisation } from "@/lib/portal/deployment";

/**
 * The organisation's logo, by its fingerprint.
 *
 * The address changes whenever the logo does, so it can be cached for good. The type is
 * the one sniffed from the bytes when it was uploaded, and `nosniff` stops a browser
 * second-guessing it. The sandbox policy means that even if something other than an
 * image were ever stored, opening this address directly could not run it.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/organisation/logo/[sha]">) {
  const { sha } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha)) return missing();

  // Whose logo: the signed-in person's organisation, else (the sign-in page, the public portal) the deployment's one (ADR 0034 D10).
  const organisationId = (await currentStaffOrNull())?.organisationId ?? (await deploymentOrganisation())?.id;
  if (!organisationId) return missing();
  const logo = await db.organisationLogo.findFirst({
    where: { sha256: sha, organisationId },
    select: { bytes: true, mediaType: true },
  });
  if (!logo) return missing();

  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mediaType,
      "Content-Length": String(logo.bytes.length),
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
