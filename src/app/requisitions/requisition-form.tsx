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
import { ACT_LABEL } from "@/lib/labels";
import { lineAmount } from "@/lib/requisition/lines";

import { createRequisition, editDraft, receiveRequisition } from "./actions";

/**
 * The requisition form: raising one, editing a draft, or receiving one typed in from
 * the finance system. Values are held here, so a refused save keeps everything typed;
 * every rule is checked by the action. Nothing is pre-filled with a policy value.
 */

export interface FormOptions {
  departments: { code: string; name: string }[];
  sections: { code: string; name: string; parentCode: string | null }[];
  people: { id: string; name: string }[];
  costCentres: { code: string; name: string }[];
  accounts: { code: string; name: string }[];
  budgetCodes: { id: string; code: string; name: string }[];
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
interface Step {
  roleLabel: string;
  act: string;
  actorName: string;
  actorPersonId: string;
  decidedOn: string;
}

export type FormLine = Line;

const BLANK_LINE: Line = { description: "", quantity: "", unit: "", estimatedUnitPrice: "", estimatedAmount: "" };
const BLANK_STEP: Step = { roleLabel: "", act: "", actorName: "", actorPersonId: "", decidedOn: "" };

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

/// As formatRM writes ringgit: "RM9,500", with sen only where there are some.
const rm = (sen: bigint) => `RM${(sen / 100n).toLocaleString("en-MY")}${sen % 100n ? `.${(sen % 100n).toString().padStart(2, "0")}` : ""}`;

const typed = (sen: bigint) => `${sen / 100n}.${(sen % 100n).toString().padStart(2, "0")}`;

export function RequisitionForm({
  mode,
  options,
  values = {},
  initialLines,
  id,
  cancelHref,
}: {
  mode: "new" | "edit" | "receive";
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
  const [trail, setTrail] = useState<Step[]>([{ ...BLANK_STEP }]);
  const [unit, setUnit] = useState(values.requestingUnitCode ?? "");
  const [value, setValue] = useState(values.estimatedValue ?? "");
  const e = state.errors ?? {};

  const sections = useMemo(() => options.sections.filter((s) => s.parentCode === unit), [options.sections, unit]);
  const total = totalOf(lines);
  const valueSen = senOf(value);

  const action = mode === "new" ? createRequisition : mode === "edit" ? editDraft : receiveRequisition;
  const submit = (data: FormData) => {
    data.set("lines", JSON.stringify(lines));
    if (mode === "receive") data.set("trail", JSON.stringify(trail));
    startTransition(async () => {
      const result = await action({ ok: false }, data);
      if (result) setState(result);
      if (result?.ok && mode === "edit") router.push(cancelHref);
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
  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, j) => j !== i));
    setOwnAmount((o) => o.filter((_, j) => j !== i));
  };
  const setStep = (i: number, k: keyof Step, v: string) => setTrail((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  const select = (name: string, label: string, opts: { value: string; label: string }[], o: { required?: boolean; placeholder?: string; hint?: string; onChange?: (v: string) => void } = {}) => (
    <Field label={label} htmlFor={`rq-${name}`} required={o.required} hint={o.hint} error={e[name]}>
      <Select
        id={`rq-${name}`}
        name={name}
        defaultValue={values[name] ?? ""}
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
  const money = (name: string, label: string, o: { required?: boolean; hint?: string } = {}) => (
    <Field label={label} htmlFor={`rq-${name}`} required={o.required} hint={o.hint} error={e[name]}>
      <AffixInput id={`rq-${name}`} prefix="RM" name={name} inputMode="decimal" defaultValue={values[name] ?? ""} aria-invalid={e[name] ? true : undefined} className="[&_input]:text-right" />
    </Field>
  );
  const coded = (xs: { code: string; name: string }[]) => xs.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }));

  return (
    <form onSubmit={(ev) => submit(formDataOf(ev))} className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      {state.message && <Callout tone="err">{state.message}</Callout>}
      {mode === "receive" && (
        <Callout tone="info" title="Entered by hand from the finance system. Nothing is fetched.">
          The requisition arrives approved. Its numbers, budget figures and approval trail are stored exactly as typed,
          marked as entered by hand, and the trail is shown as not checked against the approval matrix.
        </Callout>
      )}

      {mode === "receive" && (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Finance system numbers" subtitle="As the finance system issued them. Checked against their configured formats." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {text("erpRequisitionNo", "Finance system requisition no.", { required: true, mono: true })}
            {text("erpNoteNo", "Requisition note no.", { required: true, mono: true })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="What is needed" subtitle="The title, the justification and the need, as the request form states them." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("title", "Title", { required: true })}</div>
          {text("justification", "Justification", { area: true })}
          {text("needStatement", "Need statement", { area: true })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Who is asking, and what it is charged to" subtitle="Looked up against the structure and codes in force today." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {select("requestingUnitCode", "Requesting department", options.departments.map((d) => ({ value: d.code, label: d.name })), { required: true, onChange: setUnit })}
          {select("sectionUnitCode", "Section", sections.map((s) => ({ value: s.code, label: s.name })), {
            placeholder: sections.length ? "None" : "No section in this department",
          })}
          {select("requestingPersonId", "Requesting officer", options.people.map((p) => ({ value: p.id, label: p.name })), { required: true })}
          {select("fundingRouteCode", "Funding route", options.fundingRoutes.map((r) => ({ value: r.code, label: r.name })), {
            hint: mode === "receive" ? "The route it was approved under in the finance system." : "Required to submit.",
          })}
          {select("costCentreCode", "Cost centre", coded(options.costCentres))}
          {select("accountCode", "Account code", coded(options.accounts))}
          {select("budgetCodeId", "Budget code", options.budgetCodes.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })), { hint: "The budget line the check reads. Its account must be the requisition's." })}
          {select("contractTypeCode", "Contract type", options.contractTypes.map((c) => ({ value: c.code, label: c.name })), { placeholder: "Not set" })}
          {select("siteCode", "Site", options.sites.map((s) => ({ value: s.code, label: s.name })), { placeholder: "None" })}
          {text("placeOfDelivery", "Place of delivery")}
          {text("dateRequired", "Date required", { required: true, type: "date" })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Line items"
          subtitle={mode === "receive" ? "One or more lines, summing to the estimated value." : "One or more lines, summing to the estimated value before it leaves draft."}
        />
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estimated value" htmlFor="rq-estimatedValue" required error={e.estimatedValue}>
              <AffixInput
                id="rq-estimatedValue"
                prefix="RM"
                name="estimatedValue"
                inputMode="decimal"
                value={value}
                onChange={(ev) => setValue(ev.target.value)}
                aria-invalid={e.estimatedValue ? true : undefined}
                className="[&_input]:text-right"
              />
            </Field>
            <div className="flex items-end pb-2 text-[13px] text-ink-3" aria-live="polite">
              {total == null
                ? "A line amount is not a figure yet."
                : valueSen == null
                  ? `Lines come to ${rm(total)}.`
                  : total === valueSen
                    ? `Lines come to ${rm(total)}, the estimated value.`
                    : `Lines come to ${rm(total)}, which is not the estimated value.`}
            </div>
          </div>
          {e.lines && <Callout tone="err">{e.lines}</Callout>}
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
                    <AffixInput id={`ln-${i}-p`} prefix="RM" inputMode="decimal" value={l.estimatedUnitPrice} onChange={(ev) => setLine(i, "estimatedUnitPrice", ev.target.value)} className="[&_input]:text-right" />
                  </Field>
                  <Field label="Amount" htmlFor={`ln-${i}-a`} hint={ownAmount[i] ? undefined : "Quantity × unit price"}>
                    <AffixInput id={`ln-${i}-a`} prefix="RM" inputMode="decimal" value={l.estimatedAmount} onChange={(ev) => setLine(i, "estimatedAmount", ev.target.value)} className="[&_input]:text-right" />
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

      {mode === "receive" && (
        <>
          <Card>
            <CardHeader icon={<FileIcon size={17} />} title="Budget check, as the finance system gave it" subtitle="Stored exactly as typed. The verdict is read from the balance and the value alone." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {text("budgetAsAt", "As at", { required: true, type: "date" })}
              {money("balanceAsAt", "Balance as at", { required: true })}
              {money("actualBudget", "Actual budget")}
              {money("approvedAccount", "Approved account", { hint: "As the finance system shows it. What it means is not yet confirmed." })}
              {money("projectedBalance", "Projected balance")}
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<RouteIcon size={17} />} title="Approval trail, as received" subtitle="Each step as the finance system records it. The last must be an approval." />
            <CardBody className="flex flex-col gap-3">
              {e.trail && <Callout tone="err">{e.trail}</Callout>}
              {trail.map((t, i) => (
                <div key={i} className="rounded-2xl border border-line bg-sunken/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink-3">Step {i + 1}</span>
                    {trail.length > 1 && (
                      <button type="button" className={iconButtonClass("sm")} aria-label={`Remove step ${i + 1}`} onClick={() => setTrail((ts) => ts.filter((_, j) => j !== i))}>
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Office, as named" htmlFor={`tr-${i}-r`}>
                      <Input id={`tr-${i}-r`} value={t.roleLabel} onChange={(ev) => setStep(i, "roleLabel", ev.target.value)} />
                    </Field>
                    <Field label="Act" htmlFor={`tr-${i}-a`}>
                      <Select id={`tr-${i}-a`} value={t.act} onChange={(ev) => setStep(i, "act", ev.target.value)}>
                        <option value="">Choose</option>
                        {Object.entries(ACT_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Actor, as named" htmlFor={`tr-${i}-n`}>
                      <Input id={`tr-${i}-n`} value={t.actorName} onChange={(ev) => setStep(i, "actorName", ev.target.value)} />
                    </Field>
                    <Field label="Person on file" htmlFor={`tr-${i}-p`}>
                      <Select id={`tr-${i}-p`} value={t.actorPersonId} onChange={(ev) => setStep(i, "actorPersonId", ev.target.value)}>
                        <option value="">Not on file</option>
                        {options.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Date" htmlFor={`tr-${i}-d`}>
                      <Input id={`tr-${i}-d`} type="date" value={t.decidedOn} onChange={(ev) => setStep(i, "decidedOn", ev.target.value)} />
                    </Field>
                  </div>
                </div>
              ))}
              <div>
                <Button size="sm" onClick={() => setTrail((ts) => [...ts, { ...BLANK_STEP }])} icon={<PlusIcon size={15} />}>
                  Add step
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending} icon={<SaveIcon size={15} />}>
          {pending ? "Saving…" : mode === "new" ? "Save draft" : mode === "edit" ? "Save changes" : "Record received requisition"}
        </Button>
      </div>
    </form>
  );
}
