"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ClipboardIcon, FileIcon, PlusIcon, RouteIcon, SaveIcon, ScaleIcon, SlidersIcon, XIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { ActBadge } from "@/components/ui/act";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, iconButtonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import type { Presented } from "@/lib/method/present";

import { createExercise, updateExercise } from "./actions";

/**
 * The exercise form: opening one on an approved requisition, or editing a draft.
 * Values are held here, so a refused save keeps everything typed; every rule is the
 * action's. "How this will run" asks the route handler, which judges the draft with the
 * same logic the save does and answers in words (FR-MTD-002). Nothing is pre-filled
 * with a policy value: the method and type left unchosen take what the rules propose.
 */

export interface MethodOption {
  code: string;
  name: string;
  requiresJustification: boolean;
  justificationPrompt: string;
  requiresDossier: boolean;
  requiresCoordinationRecord: boolean;
  requiresFreshSourcing: boolean;
  requiresProposal: boolean;
  requiresNameApproval: boolean;
  restrictedAccess: boolean;
}

export interface ExerciseFormOptions {
  methods: MethodOption[];
  types: { code: string; name: string }[];
  bases: { code: string; name: string }[];
  reasons: { code: string; name: string; methodCode: string | null }[];
  people: { id: string; name: string }[];
  kinds: { value: string; label: string }[];
  /// Where an external body sets the sourcing route, its decision is recorded.
  routeSetExternally: boolean;
}

interface ScopeLine {
  kind: string;
  amount: string;
  description: string;
}

type Values = Record<string, string>;

const TONE = { err: "err", warn: "warn", info: "info" } as const;

export function ExerciseForm({
  mode,
  requisition,
  options,
  initial = {},
  initialScope,
  id,
  cancelHref,
}: {
  mode: "new" | "edit";
  requisition: { id: string; reference: string; title: string; approved: string };
  options: ExerciseFormOptions;
  initial?: Values;
  initialScope?: ScopeLine[];
  id?: string;
  cancelHref: string;
}) {
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<Values>(initial);
  const [scope, setScope] = useState<ScopeLine[]>(initialScope?.length ? initialScope : [{ kind: "", amount: initial.estimatedValue ?? "", description: "" }]);
  const [preview, setPreview] = useState<{ result: Presented; proposedMethodCode: string | null; matrixLabel: string } | { message: string } | null>(null);
  const e = state.errors ?? {};
  const set = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const method = options.methods.find((m) => m.code === v.sourcingMethodCode) ?? null;
  const proposedCode = preview && "result" in preview ? preview.proposedMethodCode : null;
  const overridden = !!method && !!proposedCode && method.code !== proposedCode;
  const typeChosen = !!v.contractTypeCode;

  // Ask how it would run, a moment after the last keystroke.
  const seq = useRef(0);
  useEffect(() => {
    const value = (v.estimatedValue ?? "").replace(/,/g, "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/method/determine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...v, value, requisitionId: requisition.id, exerciseId: id ?? null, methodCode: v.sourcingMethodCode, scope, typeReason: v.contractTypeOverrideReason, typePersonId: v.overriddenByPersonId, basisCode: v.contractBasisCode }),
        });
        const body = await res.json();
        if (n !== seq.current) return;
        setPreview(body.ok ? { result: body.result, proposedMethodCode: body.proposedMethodCode ?? null, matrixLabel: body.matrixLabel } : { message: body.message ?? body.error ?? "The bands could not be determined." });
      } catch {
        if (n === seq.current) setPreview({ message: "The bands could not be determined just now." });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [v, scope, requisition.id, id]);

  const submit = (data: FormData) => {
    data.set("scope", JSON.stringify(scope));
    startTransition(async () => {
      const result = await (mode === "new" ? createExercise : updateExercise)({ ok: false }, data);
      if (result) setState(result);
    });
  };

  const text = (name: string, label: string, o: { required?: boolean; hint?: string; area?: boolean; type?: string; mono?: boolean; wide?: boolean } = {}) => (
    <Field label={label} htmlFor={`sx-${name}`} required={o.required} hint={o.hint} error={e[name]} className={o.area || o.wide ? "sm:col-span-2" : undefined}>
      {o.area ? (
        <Textarea id={`sx-${name}`} name={name} rows={3} value={v[name] ?? ""} onChange={set(name)} aria-invalid={e[name] ? true : undefined} />
      ) : (
        <Input id={`sx-${name}`} name={name} type={o.type ?? "text"} mono={o.mono} value={v[name] ?? ""} onChange={set(name)} aria-invalid={e[name] ? true : undefined} />
      )}
    </Field>
  );
  const select = (name: string, label: string, opts: { value: string; label: string }[], o: { required?: boolean; placeholder?: string; hint?: string } = {}) => (
    <Field label={label} htmlFor={`sx-${name}`} required={o.required} hint={o.hint} error={e[name]}>
      <Select id={`sx-${name}`} name={name} value={v[name] ?? ""} onChange={set(name)} aria-invalid={e[name] ? true : undefined}>
        <option value="">{o.placeholder ?? "Choose"}</option>
        {opts.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const setLine = (i: number, k: keyof ScopeLine, val: string) => setScope((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: val } : l)));
  const reasons = options.reasons.filter((r) => r.methodCode == null || r.methodCode === method?.code);
  const r = preview && "result" in preview ? preview.result : null;

  return (
    <form onSubmit={(ev) => submit(formDataOf(ev))} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <div className="flex min-w-0 flex-col gap-6">
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="requisitionId" value={requisition.id} />
        {state.message && <Callout tone="err">{state.message}</Callout>}

        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="What is being sourced" subtitle={`Against ${requisition.reference} · ${requisition.title}`} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("title", "Title", { required: true })}</div>
            <Field label="Estimated value" htmlFor="sx-estimatedValue" required hint={requisition.approved} error={e.estimatedValue}>
              <AffixInput id="sx-estimatedValue" prefix="RM" name="estimatedValue" inputMode="decimal" value={v.estimatedValue ?? ""} onChange={set("estimatedValue")} aria-invalid={e.estimatedValue ? true : undefined} className="[&_input]:text-right" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Scope split" subtitle="What is delivered, and its share of the value. The contract type is derived from it." />
          <CardBody className="flex flex-col gap-3">
            {e.scope && <Callout tone="err">{e.scope}</Callout>}
            <ol className="flex flex-col gap-3">
              {scope.map((l, i) => (
                <li key={i} className="rounded-2xl border border-line bg-sunken/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink-3">Part {i + 1}</span>
                    {scope.length > 1 && (
                      <button type="button" className={iconButtonClass("sm")} aria-label={`Remove part ${i + 1}`} onClick={() => setScope((ls) => ls.filter((_, j) => j !== i))}>
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)]">
                    <Field label="Delivers" htmlFor={`sp-${i}-k`}>
                      <Select id={`sp-${i}-k`} value={l.kind} onChange={(ev) => setLine(i, "kind", ev.target.value)}>
                        <option value="">Choose</option>
                        {options.kinds.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Value" htmlFor={`sp-${i}-a`}>
                      <AffixInput id={`sp-${i}-a`} prefix="RM" inputMode="decimal" value={l.amount} onChange={(ev) => setLine(i, "amount", ev.target.value)} className="[&_input]:text-right" />
                    </Field>
                    <Field label="Description" htmlFor={`sp-${i}-d`}>
                      <Input id={`sp-${i}-d`} value={l.description} onChange={(ev) => setLine(i, "description", ev.target.value)} />
                    </Field>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <Button size="sm" onClick={() => setScope((ls) => [...ls, { kind: "", amount: "", description: "" }])} icon={<PlusIcon size={15} />}>
                Add part
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Sourcing method" subtitle="The regime proposes one; another needs a reason." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {select("sourcingMethodCode", "Method", options.methods.map((m) => ({ value: m.code, label: m.name })), {
              required: true,
              hint: r ? `${r.proposed}${overridden ? " This is an override." : ""}` : undefined,
            })}
            {proposedCode && v.sourcingMethodCode !== proposedCode && (
              <div className="flex items-end pb-1">
                <Button size="sm" onClick={() => setV((x) => ({ ...x, sourcingMethodCode: proposedCode }))}>
                  Use the proposed method
                </Button>
              </div>
            )}
            {overridden && text("methodReason", "Why a different method", { area: true, required: true })}
            {options.routeSetExternally && text("externalRouteNote", "What the external body decided", { area: true, required: true, hint: "An external body sets the sourcing route on this requisition's funding route." })}
            {method && (method.requiresJustification || method.requiresDossier) &&
              text("justificationText", "Justification", { area: true, required: method.requiresJustification, hint: method.justificationPrompt || undefined })}
            {method?.requiresDossier && (
              <>
                {select("justificationReasonCode", "Reason", reasons.map((x) => ({ value: x.code, label: x.name })), {
                  required: true,
                  placeholder: reasons.length ? "Choose" : "No reasons configured",
                })}
                {text("evidenceNote", "Supporting evidence", { area: true, hint: "What exists and where. Documents cannot be attached in the portal yet, so this is not attached." })}
              </>
            )}
            {method?.requiresCoordinationRecord && (
              <>
                {text("emergencyTrigger", "What triggered the emergency", { area: true, required: true })}
                {text("coordinationMeetingOn", "Coordination meeting", { type: "date", required: true })}
                {text("bqReference", "Bill of quantities reference", { mono: true })}
                {text("coordinationAttendees", "Who attended", { area: true })}
                {text("coordinationScopeNote", "Scope the meeting fixed", { area: true, hint: "The scope document itself is not attached: documents cannot be stored in the portal yet." })}
              </>
            )}
            {method && !method.requiresFreshSourcing && text("parentContractRef", "Parent contract", { required: true, mono: true, hint: "The contract this is called off. Its remaining capacity is not tracked until contracts are in the portal." })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Contract type and basis" subtitle="The type is derived from the scope; the basis is always chosen." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {select("contractTypeCode", "Contract type", options.types.map((t) => ({ value: t.code, label: t.name })), {
              placeholder: r?.contractType.name && !typeChosen ? `As derived: ${r.contractType.name}` : "As derived",
              hint: r?.contractType.derivation,
            })}
            {select("contractBasisCode", "Contract basis", options.bases.map((b) => ({ value: b.code, label: b.name })), {
              placeholder: options.bases.length ? "Choose" : "No bases configured",
              hint: "Required before documents go into preparation.",
            })}
            {typeChosen && (
              <>
                {text("contractTypeOverrideReason", "Why this type", { area: true, hint: "Required where it is not the derived type." })}
                {select("overriddenByPersonId", "Decided by", options.people.map((p) => ({ value: p.id, label: p.name })), {
                  hint: "In Contract & Procurement. Recorded on their behalf, not signed.",
                })}
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <ButtonLink href={cancelHref} variant="ghost">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" disabled={pending} icon={<SaveIcon size={15} />}>
            {pending ? "Saving…" : mode === "new" ? "Open exercise" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card className="min-w-0 xl:sticky xl:top-6">
        <CardHeader icon={<SlidersIcon size={17} />} title="How this will run" subtitle={preview && "matrixLabel" in preview ? `Under ${preview.matrixLabel}` : "Judged as you type"} />
        <CardBody className="flex flex-col gap-5" aria-live="polite">
          {!preview && <p className="text-[13.5px] text-ink-3">Type the estimated value to see its bands.</p>}
          {preview && "message" in preview && <Callout tone="warn">{preview.message}</Callout>}
          {r && <PreviewPanel r={r} />}
        </CardBody>
      </Card>
    </form>
  );
}

function RouteSteps({ route }: { route: Presented["appointment"] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-ink">{route.status}</p>
      {route.steps.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {route.steps.map((s, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 text-[13px]">
              <ActBadge act={s.actCode} />
              <span className="min-w-0 break-words text-ink">{s.role}</span>
              <span className="text-ink-3">{s.act}</span>
            </li>
          ))}
        </ol>
      )}
      {route.rule && <p className="text-[12.5px] break-words text-ink-3">{route.rule}</p>}
      {route.notes.map((n) => (
        <Callout key={n.text} tone={TONE[n.tone]}>
          {n.text}
        </Callout>
      ))}
    </div>
  );
}

function PreviewPanel({ r }: { r: Presented }) {
  return (
    <>
      <KeyValues
        items={[
          { label: "Requisition band", value: <span className="flex flex-col gap-1"><span>{r.requisition.approved}</span><span className="text-[12.5px] text-ink-3">{r.requisition.preview}</span></span> },
          { label: "Method band", value: r.regime },
          {
            label: "Contract terms band",
            value: r.terms.label ? (
              <span className="flex flex-col gap-1">
                <span>{r.terms.label}</span>
                <span className="text-[12.5px] text-ink-3">
                  Retention: {r.terms.retention.toLowerCase()} · Defects liability: {r.terms.defects.toLowerCase()}
                </span>
              </span>
            ) : (
              <span className="text-ink-3">{r.terms.status}</span>
            ),
          },
          {
            label: "At the boundary",
            value: (
              <span className="flex flex-col items-start gap-1">
                <span>{r.boundary.rule}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <ProvenanceBadge value={r.boundary.provenance} />
                  {r.boundary.onBoundary && <Badge tone="warn">On the boundary</Badge>}
                </span>
              </span>
            ),
          },
        ]}
      />
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[12px] font-semibold text-ink-3">Approval of the appointment{r.method ? ` · ${r.method}` : ""}</p>
        <RouteSteps route={r.appointment} />
      </div>
      {r.nameApproval && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Approval of the name · recorded, not enforced in Phase 1</p>
          <RouteSteps route={r.nameApproval} />
        </div>
      )}
      <div className="border-t border-line pt-4">
        <KeyValues
          items={[
            { label: "Contract type", value: r.contractType.name ? `${r.contractType.name} · ${r.contractType.status.toLowerCase()}` : "Not set" },
            ...(r.contractType.share ? [{ label: "Scope", value: r.contractType.share }] : []),
            ...r.taxonomies.map((t) => ({ label: t.name, value: t.value ? `${t.value} · ${t.status.toLowerCase()}` : t.status })),
          ]}
        />
      </div>
      {r.findings.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          {r.findings.map((f) => (
            <li key={f.text}>
              <Callout tone={TONE[f.tone]}>{f.text}</Callout>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
