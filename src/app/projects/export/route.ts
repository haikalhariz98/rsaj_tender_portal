import { staffRoute } from "@/app/_auth/route";
import { hiddenExercises } from "@/app/_auth/sulit";
import { listRegister, type RegisterView } from "@/lib/award/repo";
import { CASE_LIST_VIEWS, listCases, type CaseRowView } from "@/lib/contract/case-load";
import { CASE_VIEW_WORDS } from "@/lib/contract/case-list-words";
import { CASES_LIST_WORDS as L, SECURITIES_VIEW_WORDS as V } from "@/lib/contract/case-page-words";
import { dayIn } from "@/lib/dates";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { recordListExport } from "@/lib/export/record";
import { cellParts, EXPORT_TOO_LARGE, exportRefusal, listToXlsx, queryParams, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { ENGLISH } from "@/lib/i18n/language";
import { say } from "@/lib/i18n/say";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { cellText } from "@/lib/ui/list-cells";

import { loadCaseContext } from "../context";
import { buildCaseRows } from "../rows";
import { buildSecurityRows } from "../securities-rows";

export const dynamic = "force-dynamic";

const SECURITY_VIEW = { attention: V.viewAttention, expiring: V.viewExpiring, unverified: V.viewUnverified, all: V.viewAll } as const;
const CASE_COLUMNS: XlsxColumn[] = [{ header: "Project", type: "text" }, { header: "Contract or award", type: "text" }, { header: "Contractor", type: "text" }, { header: "Value", type: "money" }, { header: "Status", type: "text" }, { header: "Dates", type: "text" }];
const SECURITY_COLUMNS: XlsxColumn[] = [
  { header: "Security", type: "text" }, { header: "Contractor and contract", type: "text" }, { header: "Issuer", type: "text" }, { header: "Issuer on the approved list", type: "text" },
  { header: "Value", type: "money" }, { header: "Expires", type: "text" }, { header: "Status", type: "text" },
];

/**
 * The Projects list, or its securities view, as an Excel file (plan 7.6): the screen's own query (search, view, sort; `sv` for the securities views), every matching row up to
 * the ceiling. The rows are the page's: a restricted case a reader sees as contract stages only is left out of the award-work views and shows the contract's columns alone
 * (AC-18). No project column is SULIT. The commenced-variations report and the documents waiting are not lists of projects and are refused. One `ListExport` audit entry per file (ST-11).
 */
export async function GET(req: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return exportRefusal(403, "CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.");
  const params = queryParams(new URL(req.url));
  const q = parseListQuery(params, CASE_LIST_VIEWS, sortKeys("project"));
  if (q.view === "commenced" || q.view === "submissions") return exportRefusal(400, "VIEW_NOT_EXPORTABLE", "This view cannot be exported.");
  const day = dayIn(new Date(), actor.organisationTimeZone);

  let sheet: { list: string; view: string; fileName: string; columns: XlsxColumn[]; data: (string | null)[][] };
  if (q.view === "securities") {
    const sv = params.sv ?? "attention";
    if (typeof sv !== "string" || !Object.hasOwn(SECURITY_VIEW, sv)) return exportRefusal(400, "UNKNOWN_VIEW", "This securities view does not exist.");
    const view = sv as RegisterView;
    const listed = await listRegister(actor.organisationId, 0, view, false, { words: q.words, size: LIST_EXPORT_MAX_ROWS + 1 });
    if (listed.total > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
    const rows = buildSecurityRows(listed, { today: listed.org?.today ?? null, lang: ENGLISH }, { forExport: true });
    sheet = {
      list: "Securities and insurance", view: say(SECURITY_VIEW[view], ENGLISH), fileName: `securities-${day}.xlsx`, columns: SECURITY_COLUMNS,
      data: rows.map((r) => {
        const [what, contract] = cellParts(r.cells.what);
        const [issuer, onList] = cellParts(r.cells.issuer);
        return [what, contract, issuer, onList, cellText(r.cells.value), cellText(r.cells.expiry), cellText(r.cells.status)];
      }),
    };
  } else {
    const hidden = await hiddenExercises(actor);
    const ctx = await loadCaseContext(actor.organisationId);
    const view: CaseRowView | undefined = q.view ?? undefined;
    const { rows: found } = await listCases(actor.organisationId, hidden, { view, words: q.words, sort: q.sort, dir: q.dir, all: true, delayIds: ctx.delayIds, unit: q.unit });
    if (found.length > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
    const rows = buildCaseRows(found, { derived: ctx.derived, inDelay: new Set(ctx.delayIds), policy: ctx.policy, today: ctx.org?.today ?? null, lang: ENGLISH }, { forExport: true });
    sheet = {
      list: "Projects", view: view ? say(view === "delay" ? L.inDelay : CASE_VIEW_WORDS[view as keyof typeof CASE_VIEW_WORDS], ENGLISH) : say(L.allContracts, ENGLISH), fileName: `projects-${day}.xlsx`, columns: CASE_COLUMNS,
      data: rows.map((r) => {
        const [title, number] = cellParts(r.cells.contract);
        return [title, number, cellText(r.cells.contractor), cellText(r.cells.sum), cellText(r.cells.phase), cellParts(r.cells.dates).filter(Boolean).join(" · ")];
      }),
    };
  }
  const file = await listToXlsx(sheet.list, sheet.columns, sheet.data);
  await recordListExport(actor, { list: sheet.list, view: sheet.view, facets: q, search: q.q, rowCount: sheet.data.length, fileName: sheet.fileName });
  return xlsxResponse(file, sheet.fileName);
}

/// Next answers a HEAD with the GET handler when none is exported, which would write the audit entry for a file nobody received.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
