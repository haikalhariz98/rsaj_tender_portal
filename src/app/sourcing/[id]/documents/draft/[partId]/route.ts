import type { NextRequest } from "next/server";

import { staffRoute } from "@/app/_auth/route";
import { exerciseIsHidden } from "@/app/_auth/sulit";
import { mergedDraft } from "@/lib/tender-docs/read";

/**
 * The merged draft of one merged-text part, as a plain-text file (SR-11, ruling 14: Template on a merged-text line downloads the merged draft). Signed-in staff only, and an
 * exercise restricted to its named people reads as one that does not exist to anyone else (FR-MTD-007). It is the template merged with the exercise's details as they stand now,
 * marked as a draft: what is issued is frozen at submission, never this. Served as an attachment, never inline, and never cached.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/sourcing/[id]/documents/draft/[partId]">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const { id, partId } = await ctx.params;
  if (await exerciseIsHidden(guard.actor, id)) return new Response("No such draft.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const draft = await mergedDraft(guard.actor.organisationId, id, partId);
  if (!draft) return new Response("No merged draft for that part.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(draft.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${draft.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
