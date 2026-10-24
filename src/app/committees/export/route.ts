import { staffRoute } from "@/app/_auth/route";
import { dayIn } from "@/lib/dates";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { recordListExport } from "@/lib/export/record";
import { EXPORT_TOO_LARGE, exportRefusal, listToXlsx, queryParams, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { listSittings, SITTING_VIEWS } from "@/lib/committee/sittings";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { cellText } from "@/lib/ui/list-cells";

import { buildSittingRows } from "../rows";

export const dynamic = "force-dynamic";

const VIEW_LABEL = { upcoming: "Upcoming", awaiting: "Awaiting minutes" } as const;
const COLUMNS: XlsxColumn[] = ["Reference", "Committee", "Date", "Status", "Matters", "Quorum"].map((header) => ({ header, type: "text" }));

/**
 * The Committees sittings list as an Excel file (plan 7.6): the screen's own query (search, view, sort), every matching sitting up to the ceiling. A sitting shows
 * no matter's title or value, so nothing SULIT is built. One `ListExport` audit entry per file (ST-11).
 */
export async function GET(req: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return exportRefusal(403, "CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.");
  const q = parseListQuery(queryParams(new URL(req.url)), SITTING_VIEWS, sortKeys("sitting"));
  const { sittings } = await listSittings(actor, q, { all: true });
  if (sittings.length > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
  const built = buildSittingRows(sittings, { forExport: true });
  const data = built.map((r) => ["reference", "committee", "date", "status", "matters", "quorum"].map((k) => cellText(r.cells[k])));
  const fileName = `sittings-${dayIn(new Date(), actor.organisationTimeZone)}.xlsx`;
  const file = await listToXlsx("Sittings", COLUMNS, data);
  await recordListExport(actor, { list: "Sittings", view: q.view ? VIEW_LABEL[q.view] : "All", search: q.q, rowCount: data.length, fileName });
  return xlsxResponse(file, fileName);
}

/// Next answers a HEAD with the GET handler when none is exported, which would write the audit entry for a file nobody received.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
