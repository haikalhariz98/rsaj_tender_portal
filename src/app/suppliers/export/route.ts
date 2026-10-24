import { staffRoute } from "@/app/_auth/route";
import { dayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { recordListExport } from "@/lib/export/record";
import { cellParts, EXPORT_TOO_LARGE, exportRefusal, listToXlsx, queryParams, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { ERP_NOT_SYNCED } from "@/lib/suppliers/labels";
import { answeredOnTimeIds, APPLICATION_VIEWS, documentsToSeeToIds, listSuppliers, loadSupplierConfig, supplierOrg, SUPPLIER_VIEWS } from "@/lib/suppliers/repo";
import { cellText } from "@/lib/ui/list-cells";

import { readSuppliers } from "../readings";
import { buildApplicationRows, buildRegisterRows } from "../rows";

export const dynamic = "force-dynamic";

const REGISTER_VIEW = { registered: "Registered", applicants: "Applicants", attention: "Documents to see to", barred: "Suspended or blacklisted", unsynced: ERP_NOT_SYNCED.en } as const;
const APPLICATION_VIEW = { received: "Received", approval: "With approval", resubmission: "Resubmission requested", lapsed: "Lapsed: record the lapse" } as const;
const REGISTER_COLUMNS: XlsxColumn[] = ["Supplier", "Reference", "Registration number", "Standing", "Documents", "Status"].map((header) => ({ header, type: "text" }));
const APPLICATION_COLUMNS: XlsxColumn[] = [
  { header: "Supplier", type: "text" }, { header: "Reference", type: "text" }, { header: "Kind", type: "text" }, { header: "Channel", type: "text" },
  { header: "Received", type: "date" }, { header: "Status", type: "text" }, { header: "Deadline", type: "text" },
];

/**
 * The Suppliers register or its Applications tab as an Excel file (plan 7.6): `tab` is `register` (the default) or `applications`, any other is refused with 400. The same
 * query as the tab (search, view, sort), every matching row up to the ceiling. No bank, creditor or document content is on either list, so nothing SULIT is built.
 * One `ListExport` audit entry per file (ST-11).
 */
export async function GET(req: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return exportRefusal(403, "CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.");
  const params = queryParams(new URL(req.url));
  const tab = params.tab ?? "register";
  if (tab !== "register" && tab !== "applications") return exportRefusal(400, "UNKNOWN_TAB", "This tab cannot be exported. Export the register or the applications.");
  // The address holds one tab's query: the other starts from its own default, as the page reads it.
  const registerQ = parseListQuery(tab === "register" ? params : {}, SUPPLIER_VIEWS, sortKeys("supplier"));
  const applicationsQ = parseListQuery(tab === "applications" ? params : {}, APPLICATION_VIEWS, sortKeys("application"));
  const org = await supplierOrg(actor.organisationId);
  const cfg = org ? await loadSupplierConfig(org.id) : null;
  const today = org?.today ?? null;
  // "Documents to see to" is judged over the whole register, as the page does.
  const attentionIds = org && cfg && today && tab === "register" && registerQ.view === "attention" ? await documentsToSeeToIds(org.id, cfg.typeFacts, today) : undefined;
  const data = cfg ? await listSuppliers(actor.organisationId, registerQ, today, null, cfg.policy?.autoSuspendOnLapse ?? null, { applications: applicationsQ, attentionIds, all: tab }) : null;
  const rowCount = tab === "register" ? (data?.suppliers.length ?? 0) : (data?.queue.length ?? 0);
  if (rowCount > LIST_EXPORT_MAX_ROWS) return exportRefusal(413, "EXPORT_TOO_LARGE", EXPORT_TOO_LARGE(LIST_EXPORT_MAX_ROWS));
  const day = dayIn(new Date(), actor.organisationTimeZone);

  let sheet: { list: string; view: string; fileName: string; columns: XlsxColumn[]; data: (string | null)[][] };
  if (tab === "register") {
    const suppliers = data?.suppliers ?? [];
    const answered = org ? await answeredOnTimeIds(db, org.id, suppliers.flatMap((s) => s.applications.map((a) => a.id))) : new Set<string>();
    const readings = cfg ? readSuppliers(suppliers, cfg, today) : new Map();
    const rows = buildRegisterRows(suppliers, { readings, answered, today }, { forExport: true });
    sheet = {
      list: "Suppliers", view: registerQ.view ? REGISTER_VIEW[registerQ.view] : "All", fileName: `suppliers-${day}.xlsx`, columns: REGISTER_COLUMNS,
      data: rows.map((r) => {
        const [name, sub] = cellParts(r.cells.supplier);
        const [reference, registrationNo] = sub.split(" · ");
        return [name, reference, registrationNo, cellText(r.cells.status), cellText(r.cells.documents), cellText(r.cells.where)];
      }),
    };
  } else {
    const queue = data?.queue ?? [];
    const answered = org ? await answeredOnTimeIds(db, org.id, queue.map((a) => a.id)) : new Set<string>();
    const rows = buildApplicationRows(queue, { answered, today }, { forExport: true });
    sheet = {
      list: "Supplier applications", view: applicationsQ.view ? APPLICATION_VIEW[applicationsQ.view] : "All", fileName: `supplier-applications-${day}.xlsx`, columns: APPLICATION_COLUMNS,
      data: rows.map((r) => {
        const [name, sub] = cellParts(r.cells.supplier);
        const [reference, kind, channel] = sub.split(" · ");
        return [name, reference, kind, channel, String(r.sortKeys?.received ?? ""), cellText(r.cells.state), cellText(r.cells.deadline)];
      }),
    };
  }
  const file = await listToXlsx(sheet.list, sheet.columns, sheet.data);
  await recordListExport(actor, { list: sheet.list, view: sheet.view, search: tab === "register" ? registerQ.q : applicationsQ.q, rowCount: sheet.data.length, fileName: sheet.fileName });
  return xlsxResponse(file, sheet.fileName);
}

/// Next answers a HEAD with the GET handler when none is exported, which would write the audit entry for a file nobody received.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
