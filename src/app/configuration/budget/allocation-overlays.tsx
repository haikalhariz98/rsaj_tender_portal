"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useEffect, useRef, useState, useTransition } from "react";

import { AlertTriangle, ChartIcon, EyeIcon, PlusIcon, SaveIcon, XIcon } from "@/components/icons";
import { EMPTY_FORM_STATE, RecordEditor, type FormState } from "@/components/record-editor";
import { ledgerLines, type BudgetCode, type Figures, type Movement } from "@/lib/budget/codes";
import { formatCompactRM } from "@/lib/format";
import { formatSen } from "@/lib/money";

import { addRevision, transferBetweenCodes } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const writeDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/**
 * What a code's allocation is made of.
 *
 * Read-only, and deliberately so: the total is the sum of the lines above it, and a
 * form that let somebody type it would put the answer somewhere the workings could
 * not reach. Changing it means adding a line — which is what the button does.
 */
export function AllocationDetails({
  budgetCode,
  movements,
  year,
  on,
}: {
  budgetCode: BudgetCode;
  movements: Movement[];
  year: number | null;
  on: Date;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const lines = ledgerLines(movements, budgetCode.id, on, writeDate);
  const total = lines[lines.length - 1];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={opener}
        className="iconbtn iconbtn--sm"
        aria-label="Details"
        title="Details"
        onClick={() => setOpen(true)}
      >
        <EyeIcon size={14} />
      </button>

      {open && (
        <div
          className="scrim scrim--right"
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside className="drawer drawer--lg" role="dialog" aria-modal="true" aria-label={budgetCode.descriptionEn}>
            <div className="ov__head">
              <ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <div className="h2 trunc">{budgetCode.descriptionEn}</div>
                  <span className="badge badge--brand">
                    <span className="badge__t">{formatCompactRM(total.amount)}</span>
                  </span>
                </div>
                <div className="sm muted" style={{ marginTop: 2 }}>
                  {budgetCode.code}
                  {year != null && ` · ${year}`}
                </div>
              </div>
              <button
                type="button"
                className="iconbtn"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <XIcon size={17} />
              </button>
            </div>

            <div className="ov__body">
              <div className="stack stack--lg">
                <div className="pj-ledger">
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className="pj-lrow"
                      data-sub={l.kind === "MOVEMENT" ? "true" : undefined}
                      data-total={l.kind === "TOTAL" ? "true" : undefined}
                    >
                      <span className="pj-lrow__k">
                        {l.label}
                        {l.note && <span className="pj-lrow__n">{l.note}</span>}
                      </span>
                      {l.kind === "TOTAL" ? (
                        <span className="pj-lrow__v">
                          <span className="num strong">{formatSen(l.amount)}</span>
                        </span>
                      ) : l.kind === "ORIGINAL" ? (
                        <span className="pj-lrow__v">
                          <span className="num">{formatSen(l.amount)}</span>
                        </span>
                      ) : (
                        <span
                          className="pj-lrow__v"
                          style={{ color: l.adds ? "var(--ok)" : "var(--err)" }}
                        >
                          {l.adds ? "+" : "−"}
                          {formatSen(l.amount)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <AddRevision budgetCode={budgetCode} />
              </div>
            </div>

            <div className="ov__foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/// A line added to the ledger. Never an edit to the total.
function AddRevision({ budgetCode }: { budgetCode: BudgetCode }) {
  return (
    <RecordEditor
      title="Add revision"
      description={`${budgetCode.code} — ${budgetCode.descriptionEn}`}
      icon={<ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      columns={2}
      fields={[
        { kind: "hidden", name: "budgetCodeId" },
        {
          kind: "select",
          name: "direction",
          label: "Direction",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "up", label: "Revised up" },
            { value: "down", label: "Revised down" },
          ],
        },
        { kind: "money", name: "amount", label: "Amount", required: true },
        {
          kind: "text",
          name: "reference",
          label: "Reference",
          required: true,
          hint: "The instrument that authorised it.",
        },
        { kind: "date", name: "occurredOn", label: "Dated", required: true },
        { kind: "textarea", name: "description", label: "Why" },
      ]}
      values={{ budgetCodeId: budgetCode.id }}
      action={addRevision}
      submitLabel="Add revision"
      trigger={{ label: "Add revision", className: "btn", icon: true }}
      size="md"
    />
  );
}

/**
 * Moving allocation between two codes.
 *
 * A modal rather than a drawer, as the sample has it — it is one act on two records
 * and belongs in front of the list, not beside it.
 */
export function TransferBetweenCodes({
  codes,
  figuresById,
}: {
  codes: BudgetCode[];
  figuresById: Record<string, Figures>;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [fromId, setFromId] = useState("");
  const [pending, startTransition] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);

  const available = fromId ? figuresById[fromId]?.available : undefined;

  const close = () => {
    setOpen(false);
    setFromId("");
    setState(EMPTY_FORM_STATE);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = (data: FormData) => {
    startTransition(async () => {
      const result = await transferBetweenCodes(EMPTY_FORM_STATE, data);
      setState(result);
      if (result.ok) close();
    });
  };

  return (
    <>
      <button
        type="button"
        ref={opener}
        className="btn btn--primary btn--sm"
        onClick={() => setOpen(true)}
      >
        <PlusIcon size={15} />
        Transfer between codes
      </button>

      {open && (
        <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className="modal modal--md" role="dialog" aria-modal="true" aria-label="Transfer between codes">
            <form
              onSubmit={(e) => submit(formDataOf(e))}
              style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}
            >
              <div className="ov__head">
                <ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="h2 trunc">Transfer between codes</div>
                  </div>
                </div>
                <button type="button" className="iconbtn" aria-label="Close" onClick={close}>
                  <XIcon size={17} />
                </button>
              </div>

              <div className="ov__body">
                <div className="stack">
                  {state.message && (
                    <div className="callout callout--err">
                      <span className="callout__ico">
                        <AlertTriangle size={17} />
                      </span>
                      <div className="grow">
                        <span className="sm">{state.message}</span>
                      </div>
                    </div>
                  )}

                  <label className="field">
                    <span className="field__lbl">
                      From code
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <select
                      className="select"
                      name="fromCodeId"
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                    >
                      <option value="">Choose</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.descriptionEn}
                        </option>
                      ))}
                    </select>
                    {state.errors?.fromCodeId && (
                      <span className="field__err">
                        <AlertTriangle size={13} />
                        {state.errors.fromCodeId}
                      </span>
                    )}
                  </label>

                  <div className="row" style={{ gap: 10 }}>
                    <span className="sm dim">Available</span>
                    <div className="spacer" />
                    {/* Read from the ledger of whichever code is chosen. Blank until
                        one is, rather than a zero that would read as "nothing left". */}
                    <span className="num strong">
                      {available == null ? "—" : formatSen(available)}
                    </span>
                  </div>

                  <label className="field">
                    <span className="field__lbl">
                      To code
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <select className="select" name="toCodeId" defaultValue="">
                      <option value="">Choose</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.descriptionEn}
                        </option>
                      ))}
                    </select>
                    {state.errors?.toCodeId && (
                      <span className="field__err">
                        <AlertTriangle size={13} />
                        {state.errors.toCodeId}
                      </span>
                    )}
                  </label>

                  <label className="field">
                    <span className="field__lbl">
                      Amount
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <div className="inputwrap inputwrap--pre">
                      <span className="inputwrap__pre">RM</span>
                      <input className="input input--num" name="amount" inputMode="decimal" />
                    </div>
                    {state.errors?.amount && (
                      <span className="field__err">
                        <AlertTriangle size={13} />
                        {state.errors.amount}
                      </span>
                    )}
                  </label>

                  <label className="field">
                    <span className="field__lbl">Reference</span>
                    <input className="input" name="reference" />
                  </label>

                  <label className="field">
                    <span className="field__lbl">
                      Dated
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input className="input" type="date" name="occurredOn" />
                    {state.errors?.occurredOn && (
                      <span className="field__err">
                        <AlertTriangle size={13} />
                        {state.errors.occurredOn}
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div className="ov__foot">
                <div className="spacer" />
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={pending}>
                  <SaveIcon size={15} />
                  {pending ? "Saving…" : "Transfer between codes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
