"use client";

import { DataList, type Row } from "@/components/data-list";
import type { ChangeLine } from "@/lib/auth/configuration-change-words";

import { ApplyChange, ApplyCodeChange, DeclineChange, WithdrawChange } from "./editors";

/**
 * The two-person queue as a list (Phase 2c). Rows arrive as data from the server; the actions are the shared editors. A row offers only what its person may do:
 * the second person applies or declines, the proposer withdraws, and anyone else reads.
 */

export interface QueueFacts {
  title: string;
  subject: string | null;
  lines: ChangeLine[];
  reason: string;
  proposedBy: string;
}

export interface QueueRow {
  id: string;
  facts: QueueFacts;
  makesCode: boolean;
  canDecide: boolean;
  isYours: boolean;
  /// The shared list's own cells, built on the server.
  row: Row;
}

export function WaitingList({ rows }: { rows: QueueRow[] }) {
  return (
    <DataList
      flat
      selectable={false}
      exportName="changes-waiting"
      searchPlaceholder="Search changes"
      emptyTitle="Nothing is waiting"
      emptyBody="A change that needs a second person appears here until it is applied, declined or withdrawn."
      columns={[
        { key: "change", label: "Change", width: "26%", sortable: true, mobile: "primary" },
        { key: "what", label: "What it would do", mobile: "meta" },
        { key: "proposed", label: "Proposed by", width: "190px", sortable: true, mobile: "meta" },
        { key: "waitingFor", label: "Waiting for", width: "190px", mobile: "meta" },
      ]}
      rows={rows.map((r) => r.row)}
      actionsPlacement="below"
      actions={(id) => {
        const r = rows.find((x) => x.id === id);
        if (!r) return null;
        return (
          <>
            {r.canDecide && (r.makesCode ? <ApplyCodeChange changeId={r.id} facts={r.facts} /> : <ApplyChange changeId={r.id} facts={r.facts} />)}
            {r.canDecide && <DeclineChange changeId={r.id} facts={r.facts} />}
            {r.isYours && <WithdrawChange changeId={r.id} facts={r.facts} />}
          </>
        );
      }}
    />
  );
}

export function DecidedList({ rows }: { rows: Row[] }) {
  return (
    <DataList
      flat
      selectable={false}
      exportName="changes-decided"
      searchPlaceholder="Search decided changes"
      emptyTitle="Nothing has been decided yet"
      columns={[
        { key: "change", label: "Change", width: "26%", sortable: true, mobile: "primary" },
        { key: "what", label: "What it would have done", mobile: "meta" },
        { key: "standing", label: "Standing", width: "170px", sortable: true, mobile: "meta" },
        { key: "decided", label: "Decided by", width: "210px", sortable: true, mobile: "meta" },
      ]}
      rows={rows}
    />
  );
}
