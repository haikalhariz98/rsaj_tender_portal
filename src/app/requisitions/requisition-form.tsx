"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ClipboardIcon, FileIcon, PlusIcon, RouteIcon, SaveIcon, XIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { Button, ButtonLink, iconButtonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { lineAmount } from "@/lib/requisition/lines";
import type { ImportedLine } from "@/lib/requisition/line-import";

import { createRequisition, editDraft } from "./actions";
import { LineUpload } from "./line-upload";

/**
 * The requisition form: raising one, or editing a draft. Values are held here, so a refused
 * save keeps everything typed;
 * every rule is checked by the action. Nothing is pre-filled with a policy value.
 */

export interface FormOptions {
  departments: { code: string; name: string }[];
  sections: { code: string; name: string; parentCode: string | null }[];
  people: { id: string; name: string }[];
  costCentres: { code: string; name: string }[];
  accounts: { code: string; name: string }[];
  budgetCodes: { id: string; code: string; name: string; accountCode: string }[];
  sites: { code: string; name: string }[];
  fundingRoutes: { code: string; name: string }[];
  contractTypes: { code: string; name: string }[];
}

interface Line {
  description: string;
  quantity: string;
  unit: string;
  estimatedUnitPrice: string;
  estimatedAmount: string;
}

export type FormLine = Line;

const BLANK_LINE: Line = { description: "", quantity: "", unit: "", estimatedUnitPrice: "", estimatedAmount: "" };

/// Sen of a typed amount, exactly (no float), or null where it is not an amount.
function senOf(v: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.replace(/,/g, "").trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0")) : null;
}

/// Total of the typed line amounts in sen, or null where one is not an amount.
function totalOf(lines: Line[]): bigint | null {
  let sen = 0n;
  for (const l of lines) {
    if (!l.estimatedAmount.trim()) continue;
    const v = senOf(l.estimatedAmount);
    if (v == null) return null;
    sen += v;
  }
  return sen;
}

/// An amount as the form shows it: "100,000.00" (founder, 2026-10-05: xx,xxx.xx). The commas are
/// display only: the action strips them, as parseSen and FormReader.money already do.
const grouped = (sen: bigint) => `${(sen / 100n).toLocaleString("en-MY")}.${(sen % 100n).toString().padStart(2, "0")}`;
const typed = grouped;

/// A typed amount rewritten as "100,000.00" when the field is left. Anything that is not an
/// amount is left as typed, for the action to refuse in words.
const tidy = (v: string) => {
  const sen = senOf(v);
  return sen == null ? v : grouped(sen);
};

export function RequisitionForm({
  mode,
  options,
  values = {},
  initialLines,
  id,
  cancelHref,
}: {
  mode: "new" | "edit";
  options: FormOptions;
  values?: Record<string, string>;
  initialLines?: Line[];
  id?: string;
  cancelHref: string;
}) {
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(initialLines?.length ? initialLines : [{ ...BLANK_LINE }]);
  const [unit, setUnit] = useState(values.requestingUnitCode ?? "");
  const [account, setAccount] = useState(values.accountCode ?? "");
  const e = state.errors ?? {};

  const sections = useMemo(() => options.sections.filter((s) => s.parentCode === unit), [options.sections, unit]);
  const budgetCodes = useMemo(() => (account ? options.budgetCodes.filter((b) => b.accountCode === account) : options.budgetCodes), [options.budgetCodes, account]);
  const total = totalOf(lines);
  // Founder, 2026-10-06: the estimated value is the lines' total, worked out as they are typed (the
  // action still requires the two to agree, so typing it separately only invited a mismatch).
  const value = total != null && total > 0n ? grouped(total) : "";

  const action = mode === "new" ? createRequisition : editDraft;
  const submit = (data: FormData) => {
    data.set("lines", JSON.stringify(lines));
    startTransition(async () => {
      const result = await action({ ok: false }, data);
      if (result) setState(result);
      if (result?.ok) router.push(result.href ?? cancelHref);
    });
  };

  // An amount is worked out from quantity × unit price until someone types one; then
  // it is theirs, and stays as typed.
  const [ownAmount, setOwnAmount] = useState<boolean[]>(() => lines.map((l) => l.estimatedAmount.trim() !== ""));
  const setLine = (i: number, k: keyof Line, v: string) => {
    if (k === "estimatedAmount") setOwnAmount((o) => lines.map((_, j) => (j === i ? v.trim() !== "" : (o[j] ?? false))));
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, [k]: v };
        if ((k === "quantity" || k === "estimatedUnitPrice") && !ownAmount[i]) {
          const worked = lineAmount(next.quantity, next.estimatedUnitPrice);
          next.estimatedAmount = worked == null ? "" : typed(worked);
        }
        return next;
      }),
    );
  };
  /// An upload replaces the lines (the upload asked first where some were typed); the estimated
  /// value follows them, as it does typed lines.
  const applyImport = (imported: ImportedLine[]) => {
    const next = imported.map((l) => ({ ...l, estimatedUnitPrice: l.estimatedUnitPrice ? tidy(l.estimatedUnitPrice) : "", estimatedAmount: tidy(l.estimatedAmount) }));
    setLines(next);
    setOwnAmount(next.map(() => true));
  };
  const typedLines = lines.filter((l) => Object.values(l).some((v) => v.trim() !== "")).length;
  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, j) => j !== i));
    setOwnAmount((o) => o.filter((_, j) => j !== i));
  };

  const select = (name: string, label: string, opts: { value: string; label: string }[], o: { required?: boolean; placeholder?: string; hint?: string; searchable?: boolean; onChange?: (v: string) => void } = {}) => (
    <Field label={label} htmlFor={`rq-${name}`} required={o.required} hint={o.hint} error={e[name]}>
      <Select
        id={`rq-${name}`}
        name={name}
        defaultValue={values[name] ?? ""}
        searchable={o.searchable}
        aria-invalid={e[name] ? true : undefined}
        onChange={o.onChange ? (ev) => o.onChange!(ev.target.value) : undefined}
      >
        <option value="">{o.placeholder ?? "Choose"}</option>
        {opts.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const text = (name: string, label: string, o: { required?: boolean; hint?: string; area?: boolean; type?: string; mono?: boolean } = {}) => (
    <Field label={label} htmlFor={`rq-${name}`} required={o.required} hint={o.hint} error={e[name]} className={o.area ? "sm:col-span-2" : undefined}>
      {o.area ? (
        <Textarea id={`rq-${name}`} name={name} rows={3} defaultValue={values[name] ?? ""} aria-invalid={e[name] ? true : undefined} />
      ) : (
        <Input id={`rq-${name}`} name={name} type={o.type ?? "text"} mono={o.mono} defaultValue={values[name] ?? ""} aria-invalid={e[name] ? true : undefined} />
      )}
    </Field>
  );
  const coded = (xs: { code: string; name: string }[]) => xs.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }));

  return (
    <form onSubmit={(ev) => submit(formDataOf(ev))} className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      {state.message && <Callout tone="err">{state.message}</Callout>}
      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Request details" subtitle="What you need, and why." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("title", "Title", { required: true })}</div>
          {text("justification", "Justification", { area: true, required: true })}
          {/* Founder, 2026-10-06: no need statement is asked for. One saved before is kept as it was. */}
          {values.needStatement ? <input type="hidden" name="needStatement" value={values.needStatement} /> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Requester and budget" subtitle="Who is asking, and which budget pays for it." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {select("requestingUnitCode", "Requesting department", options.departments.map((d) => ({ value: d.code, label: d.name })), { required: true, onChange: setUnit })}
          {select("sectionUnitCode", "Section", sections.map((s) => ({ value: s.code, label: s.name })), {
            placeholder: sections.length ? "None" : "No section in this department",
          })}
          {select("requestingPersonId", "Requesting officer", options.people.map((p) => ({ value: p.id, label: p.name })), { required: true })}
          {select("fundingRouteCode", "Funding route", options.fundingRoutes.map((r) => ({ value: r.code, label: r.name })), {
            hint: "Required to submit.",
          })}
          {/* Founder, 2026-10-05: these lists grow long once data is migrated, so each takes typing: type a code or a word to narrow it. */}
          {select("costCentreCode", "Cost centre", coded(options.costCentres), { required: true, searchable: true })}
          {select("accountCode", "Account code", coded(options.accounts), { required: true, searchable: true, onChange: setAccount })}
          {/* Founder, 2026-10-05: required. Only the budget codes on the chosen account are offered, so the pair always agrees. */}
          {select("budgetCodeId", "Budget code", budgetCodes.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })), {
            required: true,
            searchable: true,
            placeholder: account && budgetCodes.length === 0 ? "No budget code on this account" : "Choose",
            hint: account ? "The budget line the check reads, on the chosen account." : "Choose the account code first to narrow this list.",
          })}
          {select("contractTypeCode", "Contract type", options.contractTypes.map((c) => ({ value: c.code, label: c.name })), { placeholder: "Not set" })}
          {select("siteCode", "Site", options.sites.map((s) => ({ value: s.code, label: s.name })), { placeholder: "None" })}
          {text("placeOfDelivery", "Place of delivery", { required: true })}
          {text("dateRequired", "Date required", { required: true, type: "date" })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Line items"
          subtitle="List each item. The estimated value is their total."
        />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estimated value" htmlFor="rq-estimatedValue" required error={e.estimatedValue}>
              <AffixInput
                id="rq-estimatedValue"
                prefix="RM"
                name="estimatedValue"
                value={value}
                readOnly
                placeholder="The total of the lines"
                aria-invalid={e.estimatedValue ? true : undefined}
                className="[&_input]:bg-sunken [&_input]:text-right"
              />
            </Field>
            <div className="flex items-end pb-2 text-[13px] text-ink-3" aria-live="polite">
              {total == null ? "A line amount is not a figure yet, so there is no total." : "Worked out from the lines below."}
            </div>
          </div>
          {e.lines && <Callout tone="err">{e.lines}</Callout>}
          <LineUpload typedLines={typedLines} onApply={applyImport} />
          <ol className="flex flex-col gap-3">
            {lines.map((l, i) => (
              <li key={i} className="rounded-2xl border border-line bg-sunken/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink-3">Line {i + 1}</span>
                  {lines.length > 1 && (
                    <button type="button" className={iconButtonClass("sm")} aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(i)}>
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_9rem_9rem]">
                  <Field label="Description" htmlFor={`ln-${i}-d`}>
                    <Input id={`ln-${i}-d`} value={l.description} onChange={(ev) => setLine(i, "description", ev.target.value)} />
                  </Field>
                  <Field label="Quantity" htmlFor={`ln-${i}-q`}>
                    <Input id={`ln-${i}-q`} numeric inputMode="decimal" value={l.quantity} onChange={(ev) => setLine(i, "quantity", ev.target.value)} />
                  </Field>
                  <Field label="Unit" htmlFor={`ln-${i}-u`}>
                    <Input id={`ln-${i}-u`} value={l.unit} onChange={(ev) => setLine(i, "unit", ev.target.value)} />
                  </Field>
                  <Field label="Unit price" htmlFor={`ln-${i}-p`}>
                    <AffixInput id={`ln-${i}-p`} prefix="RM" inputMode="decimal" value={l.estimatedUnitPrice} onChange={(ev) => setLine(i, "estimatedUnitPrice", ev.target.value)} onBlur={() => setLine(i, "estimatedUnitPrice", tidy(l.estimatedUnitPrice))} className="[&_input]:text-right" />
                  </Field>
                  <Field label="Amount" htmlFor={`ln-${i}-a`} hint={ownAmount[i] ? undefined : "Quantity × unit price"}>
                    <AffixInput id={`ln-${i}-a`} prefix="RM" inputMode="decimal" value={l.estimatedAmount} onChange={(ev) => setLine(i, "estimatedAmount", ev.target.value)} onBlur={() => { if (l.estimatedAmount.trim()) setLine(i, "estimatedAmount", tidy(l.estimatedAmount)); }} className="[&_input]:text-right" />
                  </Field>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <Button size="sm" onClick={() => setLines((ls) => [...ls, { ...BLANK_LINE }])} icon={<PlusIcon size={15} />}>
              Add line
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending} icon={<SaveIcon size={15} />}>
          {pending ? "Saving…" : mode === "new" ? "Save draft" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
