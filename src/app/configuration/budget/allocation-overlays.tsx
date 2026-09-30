"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useEffect, useRef, useState, useTransition } from "react";

import { ChartIcon, EyeIcon, PlusIcon, SaveIcon } from "@/components/icons";
import { EMPTY_FORM_STATE, RecordEditor, type FormState } from "@/components/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass, iconButtonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select } from "@/components/ui/field";
import { ledgerLines, type BudgetCode, type Figures, type Movement } from "@/lib/budget/codes";
import { formatCompactRM } from "@/lib/format";
import { formatSen } from "@/lib/money";

import { addRevision, transferBetweenCodes } from "./actions";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const writeDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/// The head of a hand-built overlay, matching RecordEditor's: icon tile, title, a
/// quieter line under it, and the close button.

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
        className={iconButtonClass("sm")}
        aria-label="Details"
        title="Details"
        onClick={() => setOpen(true)}
      >
        <EyeIcon size={15} />
      </button>

      {open && (
        <div
          className={DRAWER_SCRIM}
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            className={drawerPanelClass("lg")}
            role="dialog"
            aria-modal="true"
            aria-label={budgetCode.descriptionEn}
          >
            <DrawerHeader
              icon={<ChartIcon size={17} />}
              title={budgetCode.descriptionEn}
              badge={<Badge tone="brand">{formatCompactRM(total.amount)}</Badge>}
              subtitle={
                <>
                  <span className="font-mono text-[12.5px]">{budgetCode.code}</span>
                  {year != null && ` · ${year}`}
                </>
              }
              onClose={() => setOpen(false)}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-5">
                <div className="overflow-hidden rounded-2xl border border-line">
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className={cx(
                        "flex items-baseline justify-between gap-4 border-b border-line/70 px-4 py-2.5 last:border-b-0",
                        l.kind === "MOVEMENT" && "pl-8",
                        l.kind === "TOTAL" && "bg-sunken",
                      )}
                    >
                      <span
                        className={cx(
                          "min-w-0 text-[13.5px]",
                          l.kind === "TOTAL" ? "font-bold text-ink" : l.kind === "MOVEMENT" ? "text-ink-2" : "text-ink",
                        )}
                      >
                        {l.label}
                        {l.note && <span className="ml-2 text-[12.5px] text-ink-3">{l.note}</span>}
                      </span>
                      {l.kind === "TOTAL" ? (
                        <span className="shrink-0 text-[14px] font-bold text-ink tabular-nums">
                          {formatSen(l.amount)}
                        </span>
                      ) : l.kind === "ORIGINAL" ? (
                        <span className="shrink-0 text-[13.5px] text-ink tabular-nums">{formatSen(l.amount)}</span>
                      ) : (
                        <span
                          className={cx(
                            "shrink-0 text-[13.5px] font-semibold tabular-nums",
                            l.adds ? "text-emerald-700" : "text-rose-700",
                          )}
                        >
                          {l.adds ? "+" : "−"}
                          {formatSen(l.amount)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <AddRevision budgetCode={budgetCode} />
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </footer>
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
      icon={<ChartIcon size={17} />}
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
      trigger={{ label: "Add revision", icon: true }}
      size="md"
    />
  );
}

/**
 * Moving allocation between two codes.
 *
 * The sample shows it as a centred modal. It opens from the right as every other
 * form in the product does — the prototype decides what the form holds, not where
 * it sits.
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

  const codeOptions = codes.map((c) => (
    <option key={c.id} value={c.id}>
      {c.code} — {c.descriptionEn}
    </option>
  ));

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={buttonClass("primary", "sm")}
        onClick={() => setOpen(true)}
      >
        <PlusIcon size={15} />
        Transfer between codes
      </button>

      {open && (
        <div
          className={DRAWER_SCRIM}
          onPointerDown={(e) => e.target === e.currentTarget && close()}
        >
          <aside
            className={drawerPanelClass("md")}
            role="dialog"
            aria-modal="true"
            aria-label="Transfer between codes"
          >
            <form onSubmit={(e) => submit(formDataOf(e))} className="flex min-h-0 flex-1 flex-col">
              <DrawerHeader icon={<ChartIcon size={17} />} title="Transfer between codes" onClose={close} />

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-4">
                  {state.message && <Callout tone="err">{state.message}</Callout>}

                  <Field label="From code" required htmlFor="transfer-from" error={state.errors?.fromCodeId}>
                    <Select
                      id="transfer-from"
                      name="fromCodeId"
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                      aria-invalid={state.errors?.fromCodeId ? true : undefined}
                    >
                      <option value="">Choose</option>
                      {codeOptions}
                    </Select>
                  </Field>

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken px-3.5 py-2.5">
                    <span className="text-[13px] text-ink-3">Available</span>
                    {/* Read from the ledger of whichever code is chosen. Blank until
                        one is, rather than a zero that would read as "nothing left". */}
                    <span className="text-[14px] font-bold text-ink tabular-nums">
                      {available == null ? "—" : formatSen(available)}
                    </span>
                  </div>

                  <Field label="To code" required htmlFor="transfer-to" error={state.errors?.toCodeId}>
                    <Select
                      id="transfer-to"
                      name="toCodeId"
                      defaultValue=""
                      aria-invalid={state.errors?.toCodeId ? true : undefined}
                    >
                      <option value="">Choose</option>
                      {codeOptions}
                    </Select>
                  </Field>

                  <Field label="Amount" required htmlFor="transfer-amount" error={state.errors?.amount}>
                    <AffixInput
                      id="transfer-amount"
                      prefix="RM"
                      name="amount"
                      inputMode="decimal"
                      className="[&_input]:text-right"
                      aria-invalid={state.errors?.amount ? true : undefined}
                    />
                  </Field>

                  <Field label="Reference" htmlFor="transfer-reference">
                    <Input id="transfer-reference" name="reference" />
                  </Field>

                  <Field label="Dated" required htmlFor="transfer-dated" error={state.errors?.occurredOn}>
                    <Input
                      id="transfer-dated"
                      type="date"
                      name="occurredOn"
                      aria-invalid={state.errors?.occurredOn ? true : undefined}
                    />
                  </Field>
                </div>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending} icon={<SaveIcon size={15} />}>
                  {pending ? "Saving…" : "Transfer between codes"}
                </Button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
