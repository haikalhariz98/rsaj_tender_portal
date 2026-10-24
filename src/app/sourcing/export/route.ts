import { staffRoute } from "@/app/_auth/route";
import { hiddenExercises } from "@/app/_auth/sulit";
import { dayIn } from "@/lib/dates";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { recordListExport } from "@/lib/export/record";
import { cellParts, EXPORT_TOO_LARGE, exportRefusal, listToXlsx, queryParams, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { EXERCISE_STATUS_LABEL, TERM } from "@/lib/method/labels";
import { exerciseCandidates, exerciseOrg, EXERCISE_VIEWS, listExercises } from "@/lib/method/repo";
import { CLOSING_SOON_DAYS } from "@/lib/window/closing-soon";
import { windowColumns } from "@/lib/window/read";

import { buildExerciseRows, judgedViewIds } from "../rows";

export const dynamic = "force-dynamic";

const VIEW_LABEL = {
  drafts: EXERCISE_STATUS_LABEL.DRAFT,
  preparing: EXERCISE_STATUS_LABEL.DOCUMENTS_IN_PREPARATION,
  approval: EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING,
  published: "Published",
  open: "Open for purchase",
  soon: `Closing within ${CLOSING_SOON_DAYS} days`,
  name: `${TERM.nameApproval} in progress`,
} as const;
const COLUMNS: XlsxColumn[] = ["Reference", "Tender or quotation", "Method", "Contract type", "Closing", "Phase", "Status", "Band and checks"].map((header) => ({ header, type: "text" }));

/**
 * The Tenders & quotations list as an Excel file (plan 7.5): the same query and the same judged views as the screen. "On the boundary" states the
 * estimate, so it has no export (ST-8, refused before anything is read). The estimate is neither built nor judged here (`forExport`), so no
 * SULIT access is asked or logged. One `ListExport` audit entry per file (ST-11).
 */
export async function GET(req: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return exportRefusal(403, "CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.");
  const q = parseListQuery(queryParams(new URL(req.url)), EXERCISE_VIEWS, sortKeys("exercise"));
  if (q.view === "boundary") return exportRefusal(400, "VIEW_NOT_EXPORTABLE", "This view cannot be exported.");
  const hidden = await hiddenExercises(actor);
  // "Open for purchase" and "Closing soon" are judged from the window, exactly as the page does; the rest are read under the where.
  let ids: string[] | undefined;
  if (q.view === "open" || q.view === "soon") {
    const org = await exerciseOrg(actor.organisationId);
    const candidates = org ? await exerciseCandidates(org.id, hidden, q) : [];
    ids = org ? judgedViewIds(q.view, candidates, { windows: await windowColumns(org.id, candidates.map((c) => c.id)), today: org.today, granted: new Set() }) : [];
  }
  const { rows } = await listExercises(actor.organisationId, hidden, q, { ids, all: true });
  if (rows.length > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
  const built = await buildExerciseRows(actor, rows, { forExport: true });
  const data = built.map((r) => {
    const [closing, phase] = cellParts(r.cells.window);
    const [method, type] = cellParts(r.cells.method);
    return [r.search, cellParts(r.cells.title)[0], method, type, closing, phase, cellParts(r.cells.status)[0], cellParts(r.cells.checks)[0]];
  });
  const fileName = `tenders-and-quotations-${dayIn(new Date(), actor.organisationTimeZone)}.xlsx`;
  const file = await listToXlsx("Tenders and quotations", COLUMNS, data);
  await recordListExport(actor, { list: "Tenders & quotations", view: q.view ? VIEW_LABEL[q.view] : "All", search: q.q, rowCount: data.length, fileName });
  return xlsxResponse(file, fileName);
}

/// Next answers a HEAD with the GET handler when none is exported, which would write the audit entry for a file nobody received.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
