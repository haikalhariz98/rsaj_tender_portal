import { staffRoute } from "@/app/_auth/route";
import { dayIn } from "@/lib/dates";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { recordListExport } from "@/lib/export/record";
import { cellParts, EXPORT_TOO_LARGE, exportRefusal, listToXlsx, queryParams, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { listRequisitions, REQUISITION_VIEWS } from "@/lib/requisition/repo";

import { buildRequisitionRows } from "../rows";

export const dynamic = "force-dynamic";

const VIEW_LABEL = { pending: "Pending approval", drafts: "Drafts", over: "Over budget", pipeline: "In the pipeline" } as const;
const COLUMNS: XlsxColumn[] = ["Reference", "Requisition", "Funding", "Status", "Requester", "Department", "Required by"].map((header) => ({ header, type: "text" }));

/**
 * The Requisitions list as an Excel file (plan 7.5): the same query as the screen (search, view, sort), every matching row up to the ceiling. The
 * estimate is SULIT and is neither built nor read here (`forExport`). One `ListExport` audit entry per file (ST-11).
 */
export async function GET(req: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return exportRefusal(403, "CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.");
  const q = parseListQuery(queryParams(new URL(req.url)), REQUISITION_VIEWS, sortKeys("requisition"));
  const { rows } = await listRequisitions(actor.organisationId, q, { all: true });
  if (rows.length > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
  const built = await buildRequisitionRows(actor, rows, { forExport: true });
  const data = built.map((r) => {
    const [requester, department] = cellParts(r.cells.requester);
    return [r.search, cellParts(r.cells.title)[0], cellParts(r.cells.funding)[0], cellParts(r.cells.status)[0], requester, department, cellParts(r.cells.required)[0]];
  });
  const fileName = `requisitions-${dayIn(new Date(), actor.organisationTimeZone)}.xlsx`;
  const file = await listToXlsx("Requisitions", COLUMNS, data);
  await recordListExport(actor, { list: "Requisitions", view: q.view ? VIEW_LABEL[q.view] : "Open", search: q.q, rowCount: data.length, fileName, facets: q });
  return xlsxResponse(file, fileName);
}

/// Next answers a HEAD with the GET handler when none is exported, which would write the audit entry for a file nobody received.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
