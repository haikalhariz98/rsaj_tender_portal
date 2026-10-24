import type { Row } from "@/components/data-list";
import { sulitCell } from "@/components/sulit-cell";
import type { StaffActor } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/requisition/labels";
import type { listRequisitions } from "@/lib/requisition/repo";
import { SENT_BACK_LABEL } from "@/lib/requisition/sent-back";
import { sulitGates } from "@/app/_auth/sulit";

const TONE = { neutral: undefined, brand: "brand", ok: "ok", warn: "warn", err: "err", info: "info" } as const;

/**
 * The requisitions list's rows, built once for the page and for the export route. The department estimate is SULIT: a requisition keeps no
 * list of who is named, so only the organisation-wide permission opens it (undecided until decided). For the page it is judged for each row
 * and logged as a record's own page would; a withheld cell carries no figure. With `forExport` no SULIT column is built and no gate is asked,
 * so an export neither reads nor logs a value it would not write.
 */
export async function buildRequisitionRows(actor: StaffActor, rows: Awaited<ReturnType<typeof listRequisitions>>["rows"], opts: { forExport: boolean }): Promise<Row[]> {
  const gates = opts.forExport ? null : await sulitGates(actor, rows.map((r) => ({ scope: "requisition" as const, entity: "Requisition", id: r.id, label: r.reference })), ["estimatedValue"], { list: true });
  return rows.map((r) => {
    const erp = r.erpRequisitionNo ?? null;
    const statusText = r.sentBack ? SENT_BACK_LABEL : STATUS_LABEL[r.status];
    const statusTone = r.sentBack ? "warn" : STATUS_TONE[r.status];
    return {
      id: r.id,
      // The server searched and chose the view; the client does neither in server mode.
      search: r.reference,
      cells: {
        title: { kind: "link", text: r.title, href: `/requisitions/${r.id}`, sub: erp ? `${erp} · ${r.reference}` : r.reference },
        funding: { kind: "text", text: r.routeName ?? "Funding route not set" },
        ...(gates ? { value: sulitCell(gates.get(r.id)!, () => ({ kind: "money", value: r.estimatedValue })) } : {}),
        status: { kind: "badge", text: statusText, tone: TONE[statusTone] },
        // Founder, 2026-10-04: who asked, and for which department, in place of the checks
        // column. The budget check stays on the requisition's own Checks tab.
        requester: { kind: "stack", title: r.requesterName, sub: r.unitName },
        required: { kind: "text", text: formatDate(r.dateRequired) },
      },
    };
  });
}
