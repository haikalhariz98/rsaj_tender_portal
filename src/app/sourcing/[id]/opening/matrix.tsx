"use client";

import { useState, useTransition } from "react";

import { SealedFileDownload } from "@/components/sealed-file-download";
import { Badge, Dot, type Tone } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { Matrix, type MatrixColumnSpec, type MatrixRowSpec } from "@/components/ui/matrix";
import { Toggle } from "@/components/ui/toggle";
import { RecordEditor, EMPTY_FORM_STATE } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";
import { ADDENDUM_DAY_HELD_TEXT, addendumCellText, CELL_WORDS, cellAnswerFaults, COLUMN_STATUS_TEXT, EMPTY_TALLY_TEXT, MATRIX_FAULT_TEXT } from "@/lib/opening/matrix";
import { FILED_FILE_FIELDS, NOT_FILED_YET_WORDS } from "@/lib/opening/filed-file";
import type { MatrixCell, MatrixView } from "@/lib/opening/matrix-read";
import { blocking, type ChecklistAnswer } from "@/lib/opening/types";

import { recordChecklistAnswer, recordVerdict } from "./actions";
import { InitialDrawer, VerdictDrawer } from "./editors";

/**
 * The SR-14 opening checklist as a matrix (wave 3c plan step 5; Sourcing Requirements v2 SR-14; rulings 22, 23, 20c, 20cm, 20cl): a row for each checklist item, a column for each offer read, and
 * under them the checklist result, the decision and the officers' confirmations. It replaces the Files to check list and the Checklist and Verdict drawers of the offers list.
 *
 * Everything that varies is read, not decided here: who may answer, decide or confirm comes from the read model (`pass`, `reject`, `answer`, `confirmation.mine`), and a control that may not act is
 * disabled with that reason. A cell's download is offered only where the read model gave the viewer a file (named officers before finalising, anyone but an administrator after).
 * No price, period or declared figure is on this screen.
 */

const ANSWER_OPTIONS = [
  { value: "PRESENT", label: "Present", tone: "ok" },
  { value: "ABSENT", label: "Absent", tone: "err" },
  { value: "NOT_APPLICABLE", label: "Not applicable", tone: "neutral" },
] as const;

export interface VerdictAids {
  options: { value: string; label: string; disabled?: boolean }[];
  grounds: string[];
  reported: string[];
}

type Col = MatrixView["columns"][number];

const refusalOf = (r: { message?: string; errors?: Record<string, string> }): string => r.message ?? Object.values(r.errors ?? {})[0] ?? "That was not recorded.";

function AnswerControl({ exerciseId, col, cell, label, rowLabel, disabled }: { exerciseId: string; col: Col; cell: MatrixCell; label: string; rowLabel: string; disabled: string | null }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  // Present on a part no file was received for is refused by the same pure rule the action runs.
  const presentFault = blocking(cellAnswerFaults(cell, "PRESENT"))[0];
  const record = (answer: ChecklistAnswer) => {
    setProblem(null);
    const data = new FormData();
    data.set("exerciseId", exerciseId);
    data.set("openedBidId", col.openedBidId);
    data.set("itemKey", cell.itemKey);
    data.set("answer", answer);
    start(async () => {
      const r = await recordChecklistAnswer(EMPTY_FORM_STATE, data);
      if (!r.ok) setProblem(refusalOf(r));
    });
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Toggle
        label={`${label}: ${rowLabel}`}
        value={cell.answer}
        disabled={disabled != null || pending}
        onChange={record}
        options={ANSWER_OPTIONS.map((o) => (o.value === "PRESENT" && presentFault ? { ...o, disabled: true, reason: MATRIX_FAULT_TEXT.NO_FILE_RECEIVED } : { ...o }))}
      />
      {cell.answer == null && <span className="text-[12px] text-ink-3">Not answered</span>}
      {problem && (
        <span role="alert" className="text-[12px] font-semibold text-rose-700">
          {problem}
        </span>
      )}
    </div>
  );
}

/// The filed copy of an opening-check file, after finalising: a plain form post, so the browser follows the route's redirect to the document version (and its SULIT entitlement).
function FiledFileForm({ exerciseId, openingId, fileId, label, sha }: { exerciseId: string; openingId: string; fileId: string; label: string; sha: string | null }) {
  const values: Record<(typeof FILED_FILE_FIELDS)[number], string> = { exerciseId, openingId, fileId };
  return (
    <form method="post" action="/api/opening/filed-file" className="flex flex-col items-start gap-1">
      {FILED_FILE_FIELDS.map((k) => (
        <input key={k} type="hidden" name={k} value={values[k]} />
      ))}
      <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Download ${label}`}>
        Download
      </button>
      {sha && <span className="font-mono text-[11px] break-all text-ink-3">{`SHA-256 ${sha}`}</span>}
    </form>
  );
}

function CellBody({ exerciseId, openingId, view, col, cell, rowLabel }: { exerciseId: string; openingId: string; view: MatrixView; col: Col; cell: MatrixCell; rowLabel: string }) {
  const label = `Offer ${col.listingNo}, ${rowLabel}`;
  const finalised = view.phase === "FINALISED";
  let note: React.ReactNode = null;
  switch (cell.kind) {
    case "PAPER":
      break;
    case "ADDENDUM":
      note = <span className="text-[12px] text-ink-3">{view.namesHeld ? ADDENDUM_DAY_HELD_TEXT : addendumCellText(cell.acknowledgedOn)}</span>;
      break;
    case "NOT_RECEIVED":
      note = <span className="text-[12px] text-ink-3">{CELL_WORDS.NOT_RECEIVED}</span>;
      break;
    case "CHECK_FILES":
      if (cell.fileIds.length === 0) note = <span className="text-[12px] text-ink-3">{CELL_WORDS.CHECK_FILES}</span>;
      else
        note = (
          <div className="flex flex-col gap-1.5">
            {cell.fileIds.map((fileId, i) => {
              const filed = cell.filed.find((f) => f.fileId === fileId);
              const fileLabel = cell.fileIds.length > 1 ? `${label}, file ${i + 1}` : label;
              return finalised ? <FiledFileForm key={fileId} exerciseId={exerciseId} openingId={openingId} fileId={fileId} label={fileLabel} sha={filed?.plainSha256 ?? null} /> : <SealedFileDownload key={fileId} openingId={openingId} fileId={fileId} label={fileLabel} />;
            })}
          </div>
        );
      break;
    case "RECEIVED_NOT_CHECKED":
      if (!finalised || cell.fileIds.length === 0) note = <span className="text-[12px] text-ink-3">{CELL_WORDS.RECEIVED_NOT_CHECKED}</span>;
      else
        note = (
          <div className="flex flex-col gap-1.5">
            {cell.filed.map((f, i) =>
              f.versionId ? (
                <a key={f.fileId} href={`/api/documents/versions/${f.versionId}`} className={buttonClass("ghost", "sm")} aria-label={`Download ${label}${cell.filed.length > 1 ? `, file ${i + 1}` : ""}`}>
                  Download
                </a>
              ) : (
                <span key={f.fileId} className="text-[12px] text-ink-3">{NOT_FILED_YET_WORDS}</span>
              ),
            )}
          </div>
        );
      break;
  }
  return (
    <div className="flex flex-col gap-2">
      <AnswerControl exerciseId={exerciseId} col={col} cell={cell} label={`Offer ${col.listingNo}`} rowLabel={rowLabel} disabled={col.answer.allowed ? null : col.answer.reason} />
      {note}
    </div>
  );
}

const DOT_FOR: Record<"confirmed" | "awaiting" | "stale", Tone> = { confirmed: "ok", awaiting: "neutral", stale: "warn" };
const DOT_WORDS: Record<"confirmed" | "awaiting" | "stale", string> = { confirmed: "confirmed", awaiting: "to confirm", stale: "must confirm again" };

function Confirmations({ exerciseId, col, viewer }: { exerciseId: string; col: Col; viewer: { personId: string; name: string } }) {
  const c = col.confirmation;
  const people = [
    ...c.confirmed.map((n) => ({ n, k: "confirmed" as const })),
    ...c.stale.map((n) => ({ n, k: "stale" as const })),
    ...c.awaiting.map((n) => ({ n, k: "awaiting" as const })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <Badge tone={c.status === "CONFIRMED" ? "ok" : "warn"} dot>
        {COLUMN_STATUS_TEXT[c.status]}
      </Badge>
      <ul className="flex flex-col gap-1">
        {people.map((p) => (
          <li key={`${p.k}-${p.n}`} className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Dot tone={DOT_FOR[p.k]} />
            <span className="min-w-0 break-words">{`${p.n}: ${DOT_WORDS[p.k]}`}</span>
          </li>
        ))}
      </ul>
      {c.mine && (c.mine.allowed ? <InitialDrawer exerciseId={exerciseId} bid={{ id: col.openedBidId, listingNo: col.listingNo }} person={{ id: viewer.personId, name: viewer.name }} allowed={c.mine} own /> : <Blocked label="Confirm this column" reason={c.mine.reason} ariaLabel={`Confirm the column of No. ${col.listingNo}`} />)}
    </div>
  );
}

/// A refusal that every column gives in the same words is said once under the matrix, and each button points at it (the 3c-7 rendered check: the same long reason in every cell of a narrow column).
function Decision({ exerciseId, col, aids, notes }: { exerciseId: string; col: Col; aids: VerdictAids | undefined; notes: ReadonlyMap<string, string> }) {
  const bid = { id: col.openedBidId, listingNo: col.listingNo };
  const d = col.decision;
  return (
    <div className="flex flex-col gap-2">
      {d ? <Badge tone={d.verdict === "PASS" ? "ok" : "err"} dot>{d.label}</Badge> : <span className="text-[12.5px] text-ink-3">No decision yet</span>}
      {d?.reason && <span className="text-[12px] break-words text-ink-3">{d.reason}</span>}
      <div className="flex flex-wrap items-start gap-1.5">
        {col.pass.allowed ? (
          <RecordEditor
            title={`Carry No. ${col.listingNo} to evaluation`}
            fields={[{ kind: "hidden", name: "exerciseId" }, { kind: "hidden", name: "openedBidId" }, { kind: "hidden", name: "verdict" }]}
            values={{ exerciseId, openedBidId: col.openedBidId, verdict: "PASS" }}
            action={recordVerdict}
            submitLabel="Carry to evaluation"
            trigger={{ label: "Pass", className: buttonClass("secondary", "sm"), ariaLabel: `Carry No. ${col.listingNo} to evaluation` }}
            size="sm"
          />
        ) : (
          <Blocked label="Pass" reason={col.pass.reason} noteId={notes.get(col.pass.reason)} ariaLabel={`Carry No. ${col.listingNo} to evaluation`} />
        )}
        {col.reject.allowed && aids ? (
          <VerdictDrawer exerciseId={exerciseId} bid={bid} options={aids.options.filter((o) => o.value === "REJECT")} grounds={aids.grounds} reported={aids.reported} allowed={col.reject} />
        ) : (
          <Blocked label="Reject" reason={col.reject.allowed ? "The grounds for this offer are not available." : col.reject.reason} noteId={notes.get(col.reject.allowed ? "The grounds for this offer are not available." : col.reject.reason)} ariaLabel={`Do not carry No. ${col.listingNo}`} />
        )}
      </div>
    </div>
  );
}

export function OpeningMatrix({ exerciseId, openingId, view, viewer, verdicts }: { exerciseId: string; openingId: string; view: MatrixView; viewer: { personId: string; name: string }; verdicts: Record<string, VerdictAids> }) {
  const columns: MatrixColumnSpec[] = view.columns.map((c) => ({
    key: c.openedBidId,
    head: (
      <div className="flex min-w-0 flex-col gap-0.5 normal-case">
        <span className="text-[13.5px] font-semibold break-words text-ink">{`No. ${c.listingNo} of ${c.of}`}</span>
        <span className="text-[12.5px] font-normal break-words text-ink-2">{c.bidder}</span>
        {c.alternativeOf != null && <span className="text-[12px] font-normal text-ink-3">{`Alternative to No. ${c.alternativeOf}`}</span>}
        {view.online && <span className="font-mono text-[11px] font-normal break-all text-ink-3">{c.receiptDigest ?? "No receipt digest on the roll"}</span>}
      </div>
    ),
  }));
  const refusals = view.columns.flatMap((c) => [c.pass, c.reject]).flatMap((a) => (a.allowed ? [] : [a.reason]));
  const sharedNotes = new Map([...new Set(refusals)].filter((r) => refusals.filter((x) => x === r).length > 1).map((r, i) => [r, `matrix-refusal-${openingId}-${i}`] as const));
  const answerNotes = new Map(view.columns.map((c) => [c.openedBidId, c.answer] as const));
  const rows: MatrixRowSpec[] = [
    ...view.rows.map((r) => ({
      key: r.key,
      head: (
        <span className="flex flex-col items-start gap-1">
          <span className="break-words">{r.label}</span>
          {r.opened && <Badge tone="brand" size="sm">Opened at the opening</Badge>}
        </span>
      ),
      cells: Object.fromEntries(
        view.columns.map((c) => {
          const cell = c.cells.find((x) => x.itemKey === r.key);
          return [c.openedBidId, cell ? <CellBody key={r.key} exerciseId={exerciseId} openingId={openingId} view={view} col={c} cell={cell} rowLabel={r.label} /> : null];
        }),
      ),
    })),
    {
      key: "~result",
      summary: true,
      head: "Checklist result",
      cells: Object.fromEntries(
        view.columns.map((c) => [
          c.openedBidId,
          <div key="r" className="flex flex-col gap-1">
            <Badge tone={c.tally.total > 0 && c.tally.absent === 0 && c.tally.unanswered === 0 ? "ok" : "warn"} dot>
              {c.tally.total === 0 ? EMPTY_TALLY_TEXT : c.tallyText}
            </Badge>
            {(() => {
              const a = answerNotes.get(c.openedBidId);
              return a && !a.allowed && view.phase === "CHECKING" ? <span className="text-[12px] text-ink-3">{a.reason}</span> : null;
            })()}
          </div>,
        ]),
      ),
    },
    { key: "~decision", summary: true, head: "Decision", cells: Object.fromEntries(view.columns.map((c) => [c.openedBidId, <Decision key="d" exerciseId={exerciseId} col={c} aids={verdicts[c.openedBidId]} notes={sharedNotes} />])) },
    { key: "~confirm", summary: true, head: "Confirmations", cells: Object.fromEntries(view.columns.map((c) => [c.openedBidId, <Confirmations key="c" exerciseId={exerciseId} col={c} viewer={viewer} />])) },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {view.online && view.phase === "CHECKING" && !view.viewerIsNamedOfficer && <Callout tone="info">The answers and decisions are shown to you. The files, the bidders&apos; names and the acknowledgement days stay with the named opening officers until the opening is finalised.</Callout>}
      {[...sharedNotes].map(([reason, id]) => <p key={id} id={id} className="text-[12.5px] text-ink-3">{reason}</p>)}
      <Matrix caption="Opening checklist: one row for each item, one column for each offer read" corner="Checked at the opening" columns={columns} rows={rows} />
    </div>
  );
}
