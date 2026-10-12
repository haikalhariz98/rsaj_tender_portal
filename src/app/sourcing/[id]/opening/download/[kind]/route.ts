import { staffRoute } from "@/app/_auth/route";
import { exerciseIsHidden, sulitExerciseGate } from "@/app/_auth/sulit";
import { DOWNLOAD_REFUSAL_TEXT, isOpeningDownloadKind, openingCsv, openingDownloadName } from "@/lib/opening/download";
import { scheduleSection } from "@/lib/opening/read";
import { PRICE_FIELDS } from "../../price-fields";

export const dynamic = "force-dynamic";

const plain = (text: string, status: number) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * The schedule of tenders (Jadual Tawaran) or the Grand Summary of one opening as CSV (SR-15, ruling 24). Built from the copies frozen at finalising and offered
 * only once the opening is finalised. The price cells go through the same SULIT gate as the print page, so a reader who may not read them gets the words, never
 * the figure. An exercise restricted to its named people reads as one that does not exist to anyone else. Served as an attachment, never inline.
 */
export async function GET(req: Request, ctx: RouteContext<"/sourcing/[id]/opening/download/[kind]">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  const { id, kind } = await ctx.params;
  if (!isOpeningDownloadKind(kind)) return plain("That is not a document of the opening.", 404);
  if (await exerciseIsHidden(scope, id)) return plain("That exercise is not one you can open.", 404);
  const d = await scheduleSection(scope, id, await sulitExerciseGate(scope, id, "exercise", PRICE_FIELDS));
  if (!d) return plain("That exercise is not one you can open.", 404);
  const wanted = new URL(req.url).searchParams.get("opening");
  const index = d.openings.findIndex((x) => x.id === wanted);
  const o = d.openings[index] ?? d.openings[0] ?? null;
  if (!o) return plain("No opening has started.", 404);
  const built = openingCsv(kind, o);
  if ("refusal" in built) return plain(DOWNLOAD_REFUSAL_TEXT[built.refusal], 409);
  return new Response(built.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${openingDownloadName(d.reference, kind, (index >= 0 ? index : 0) + 1)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
