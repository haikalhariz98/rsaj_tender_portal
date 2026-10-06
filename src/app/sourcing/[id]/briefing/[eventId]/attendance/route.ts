import { staffRoute } from "@/app/_auth/route";
import { attendanceRegisterCsv } from "@/lib/window/read";

/**
 * The attendance register of one briefing or site visit as CSV (FR-ADV-013, the register's own
 * form). Read-only: the file is built from the register as it stands, with each person recorded
 * on behalf of the officer, not signed. Served as an attachment, never inline.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sourcing/[id]/briefing/[eventId]/attendance">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const { id, eventId } = await ctx.params;
  const file = await attendanceRegisterCsv(id, eventId);
  if (!file) return new Response("That event is not on this exercise.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(file.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
