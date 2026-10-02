"use client";

import { DataList, type Row } from "@/components/data-list";

import { CorrectDrawer, ReturnedDrawer, TableLateDrawer } from "./editors";
import type { BidsTab } from "@/lib/bids/read";

type EnvelopeRow = BidsTab["rows"][number];
type Option = { value: string; label: string };

/**
 * The envelope register on the shared DataList: each envelope with its sequence, the server's
 * recording time (on every row, an envelope recorded after the event included: that stamp decides
 * lateness), how it came, whether it was in time, where it stands and its markings as written. An
 * envelope recorded after the event carries the officer's statement of when it was received, and
 * why, under the row, as the officer's statement. A late one shows its admission. There is
 * no Delete and no Reject: an envelope is never removed, and a late one's admission is the
 * committee's. A row's acts open drawers, so the list is a client component; they sit on the line
 * under the row (the shared list's `below` placement), so the markings keep the row's width and
 * "Table for admission" is never cut at the card's edge (6.6 review S-2).
 */
export function EnvelopeList({ exerciseId, rows, people, late }: { exerciseId: string; rows: EnvelopeRow[]; people: Option[]; late: { committee: string | null; sittings: Option[]; holders: Option[] } }) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list: Row[] = rows.map((r) => ({
    id: r.id,
    views: [r.isEstimate ? "estimate" : r.late ? "late" : "intime", ...(r.withdrawn ? ["withdrawn"] : [])],
    search: `${r.sequence} ${r.markings} ${r.kind} ${r.channel}`,
    sortKeys: { sequence: r.sequence },
    note: [
      r.statement,
      r.table && !r.table.allowed ? `Table for admission is not available: ${r.table.reason}` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined,
    cells: {
      sequence: { kind: "stack", title: `Envelope ${r.sequence}`, sub: r.alternativeTo != null ? `${r.kind}, to envelope ${r.alternativeTo}` : r.kind },
      received: { kind: "stack", title: r.received, sub: `${r.stampLabel} · ${r.channel} · ${r.receivedBy}` },
      state: {
        kind: "chips",
        items: [
          ...(r.enteredChip ? [{ text: r.enteredChip, tone: "warn" as const }] : []),
          ...(r.isEstimate ? [] : [{ text: r.late ? "Late" : "In time", tone: r.late ? ("err" as const) : ("ok" as const) }]),
          ...(r.withdrawn ? [{ text: "Withdrawn" }] : []),
          ...(r.returned ? [{ text: r.returned }] : []),
          ...(r.admission ? [{ text: r.admission.sitting && r.admission.state === "PENDING" ? `${r.admission.label}: ${r.admission.sitting}` : r.admission.label, tone: r.admission.state === "ADMITTED" ? ("ok" as const) : r.admission.state === "NOT_ADMITTED" ? ("err" as const) : ("warn" as const) }] : []),
          ...(r.corrected ? [{ text: "Record corrected", tone: "info" as const }] : []),
        ],
      },
      markings: { kind: "text", text: r.markings },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      exportName="envelope-register"
      searchPlaceholder="Search by envelope or markings"
      emptyTitle="No envelope recorded"
      emptyBody="Envelopes handed over the counter, by post or by courier are recorded here as they arrive. Envelopes in the tender box are registered at the opening."
      views={[
        { id: "intime", label: "In time" },
        { id: "late", label: "Late" },
        { id: "withdrawn", label: "Withdrawn" },
        { id: "estimate", label: "Company estimate" },
      ]}
      actionsPlacement="below"
      stackBelow="xl"
      columns={[
        { key: "sequence", label: "Envelope", width: "140px", sortable: true, mobile: "primary" },
        { key: "received", label: "Recorded", width: "220px", mobile: "meta" },
        { key: "state", label: "Where it stands", width: "210px", mobile: "meta" },
        { key: "markings", label: "Markings as written", mobile: "meta" },
      ]}
      rows={list}
      actions={(id) => {
        const r = byId.get(id)!;
        if (!r.correct?.allowed && !r.returnable && !r.table?.allowed) return null;
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {r.correct?.allowed && <CorrectDrawer exerciseId={exerciseId} envelope={{ id: r.id, sequence: r.sequence, markings: r.markings, channel: r.channelCode, receivedById: r.receivedById }} people={people} />}
            {r.returnable && <ReturnedDrawer exerciseId={exerciseId} envelopeId={r.id} sequence={r.sequence} />}
            {r.table?.allowed && <TableLateDrawer exerciseId={exerciseId} envelopeId={r.id} sequence={r.sequence} committee={late.committee} sittings={late.sittings} holders={late.holders} allowed={r.table} />}
          </span>
        );
      }}
    />
  );
}
