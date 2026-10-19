import { staffRoute } from "@/app/_auth/route";
import { exerciseIsHidden, sulitExerciseGate } from "@/app/_auth/sulit";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { DOWNLOAD_REFUSAL_TEXT, isOpeningDownloadKind, openingCsv, openingDownloadName } from "@/lib/opening/download";
import { scheduleSection } from "@/lib/opening/read";
import { PRICE_FIELDS } from "../../price-fields";

export const dynamic = "force-dynamic";

const plain = (text: string, status: number) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * The schedule of tenders or the Grand Summary of one opening as CSV (SR-15, ruling 24). Built from the copies frozen at finalising and offered
 * only once the opening is finalised. The price cells go through the same SULIT gate as the print page, so a reader who may not read them gets the words, never
 * the figure. An exercise restricted to its named people reads as one that does not exist to anyone else. Served as an attachment, never inline.
 * SEC-4: a request another site started is refused before anything is read, and a HEAD is refused outright, because the SULIT gate below writes an access row for every price it judges
 * and a hostile page (or Next answering HEAD with GET) must not be able to fill the log.
 */
export async function GET(req: Request, ctx: RouteContext<"/sourcing/[id]/opening/download/[kind]">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  // Before anything is read or logged (the SULIT gate below writes an access row per price judged): a download another site started writes nothing, as the staff document route.
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return plain("This file is opened from the portal's own pages. Open the portal and download it from there.", 403);
  const { id, kind } = await ctx.params;
  if (!isOpeningDownloadKind(kind)) return plain("That is not a document of the opening.", 404);
  if (await exerciseIsHidden(scope, id)) return plain("That exercise is not one you can open.", 404);
  const d = await scheduleSection(scope, id, await sulitExerciseGate(scope, id, "exercise", PRICE_FIELDS));
  if (!d) return plain("That exercise is not one you can open.", 404);
  // No ?opening= means the first opening; one that names an opening the exercise does not have is not found (never quietly the first).
  const wanted = new URL(req.url).searchParams.get("opening");
  const index = wanted == null ? 0 : d.openings.findIndex((x) => x.id === wanted);
  if (wanted != null && index < 0) return plain("That opening is not one of this exercise's.", 404);
  const o = d.openings[index] ?? null;
  if (!o) return plain("No opening has started.", 404);
  const built = openingCsv(kind, o);
  if ("refusal" in built) return plain(DOWNLOAD_REFUSAL_TEXT[built.refusal], 409);
  return new Response(built.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${openingDownloadName(d.reference, kind, index + 1)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

/// Next answers HEAD with the GET handler when none is exported, which would read the schedule and log the SULIT reads for a request that sends nothing: refused outright (SEC-4).
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
