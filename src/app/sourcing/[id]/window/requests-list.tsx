import { DataList, type Row } from "@/components/data-list";
import { REQUEST_STATE_WORDS, type RequestRow } from "@/lib/portal/bids/staff-read";

const TONE = { BOUGHT: "ok", WAITING: "brand", REFUSED: "err", WITHDRAWN: undefined } as const;

/**
 * The requests suppliers made online for the documents, on the shared DataList (Phase 4d review): every one, searchable, sortable, paged and exportable, never cut off at a count. A request sells nothing and takes
 * no payment, so a row has no act of its own: the sale is recorded in the register above, naming the supplier.
 */
export function RequestsList({ requests }: { requests: RequestRow[] }) {
  const rows: Row[] = requests.map((r) => ({
    id: r.id,
    views: [r.state === "WAITING" ? "waiting" : r.state === "REFUSED" ? "refused" : "done"],
    search: `${r.supplier} ${r.collector} ${REQUEST_STATE_WORDS[r.state]} ${r.reasons.join(" ")}`,
    sortKeys: { at: r.sort, supplier: r.supplier },
    note: r.reasons.length > 0 ? r.reasons.join(" ") : undefined,
    cells: {
      supplier: { kind: "stack", title: r.supplier, sub: `To be collected by ${r.collector}` },
      state: { kind: "badge", text: REQUEST_STATE_WORDS[r.state], tone: TONE[r.state] },
      at: { kind: "text", text: r.at },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      exportName="online-requests"
      searchPlaceholder="Search by supplier or collector"
      emptyTitle="No supplier has asked online"
      views={[
        { id: "waiting", label: "Waiting for a sale" },
        { id: "refused", label: "Refused" },
        { id: "done", label: "Sold or withdrawn" },
      ]}
      stackBelow="xl"
      columns={[
        { key: "supplier", label: "Supplier", sortable: true, mobile: "primary" },
        { key: "state", label: "Where it stands", width: "280px", mobile: "meta" },
        { key: "at", label: "Asked", width: "190px", sortable: true, nowrap: true, mobile: "meta" },
      ]}
      rows={rows}
    />
  );
}
