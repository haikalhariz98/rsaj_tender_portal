"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ActAttributionFields } from "@/components/act-attribution-fields";
import { ClipboardIcon, FileIcon, RouteIcon, SaveIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { actorField } from "@/lib/auth/actor-field";
import { EVIDENCE_NOTE_HINT, SCOPE_NOTE_HINT } from "@/lib/method/labels";
import type { Presented } from "@/lib/method/present";

import { createExercise, updateExercise } from "./actions";

/**
 * The exercise form: opening one on an approved requisition, or editing a draft.
 * Values are held here, so a refused save keeps everything typed; every rule is the
 * action's. The route handler judges the draft as it is typed with the
 * same logic the save does, and its proposals show on their fields (FR-MTD-002). Nothing is pre-filled
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
  // Founder, 2026-10-05: one "What is delivered" choice covering the whole value, not a split. A draft
  // saved with several parts opens on its largest, and saving it records that one part.
  const [kind, setKind] = useState(() => largestKind(initialScope ?? []));
  const scope: ScopeLine[] = useMemo(() => (kind ? [{ kind, amount: v.estimatedValue ?? "", description: "" }] : []), [kind, v.estimatedValue]);
  const [preview, setPreview] = useState<{ result: Presented; proposedMethodCode: string | null; matrixLabel: string } | { message: string } | null>(null);
  const e = state.errors ?? {};
  const set = (k: string) => (ev: { target: { value: string } }) => {
    const next = ev.target.value;
    setV((x) => ({ ...x, [k]: next }));
  };
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
          body: JSON.stringify({ ...v, value, requisitionId: requisition.id, exerciseId: id ?? null, methodCode: v.sourcingMethodCode, scope, typeReason: v.contractTypeOverrideReason, basisCode: v.contractBasisCode }),
        });
        const body = await res.json();
        if (n !== seq.current) return;
        setPreview(body.ok ? { result: body.result, proposedMethodCode: body.proposedMethodCode ?? null, matrixLabel: body.matrixLabel } : { message: body.message ?? body.error ?? "The bands could not be determined." });
      } catch {
        if (n === seq.current) setPreview({ message: "Bands not determined. Try again." });
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
  const reasons = options.reasons.filter((r) => r.methodCode == null || r.methodCode === method?.code);
  const r = preview && "result" in preview ? preview.result : null;

  return (
    // Founder, 2026-10-05: no "How this will run" panel beside the form. The rules still judge the
    // draft as it is typed, and what they propose shows on its field: the method, the derived type.
    <form onSubmit={(ev) => submit(formDataOf(ev))} className="flex flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-6">
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="requisitionId" value={requisition.id} />
        {state.message && <Callout tone="err">{state.message}</Callout>}

        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="What is being sourced" subtitle={`Against ${requisition.reference} · ${requisition.title}`} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("title", "Title", { required: true })}</div>
            <Field label="Estimated value" htmlFor="sx-estimatedValue" required hint={requisition.approved || undefined} error={e.estimatedValue}>
              <AffixInput id="sx-estimatedValue" prefix="RM" name="estimatedValue" inputMode="decimal" value={v.estimatedValue ?? ""} onChange={set("estimatedValue")} aria-invalid={e.estimatedValue ? true : undefined} className="[&_input]:text-right" />
            </Field>
            <Field label="What is delivered" htmlFor="sx-kind" required hint="The contract type is derived from it." error={e.scope}>
              <Select id="sx-kind" value={kind} onChange={(ev) => setKind(ev.target.value)} aria-invalid={e.scope ? true : undefined}>
                <option value="">Choose</option>
                {options.kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Sourcing method" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {select("sourcingMethodCode", "Method", options.methods.map((m) => ({ value: m.code, label: m.name })), {
              required: true,
              hint: r ? `${r.proposed}${overridden ? " Override." : ""}` : undefined,
            })}
            {proposedCode && v.sourcingMethodCode !== proposedCode && (
              <div className="flex items-end pb-1">
                <Button size="sm" onClick={() => setV((x) => ({ ...x, sourcingMethodCode: proposedCode }))}>
                  Use the proposed method
                </Button>
              </div>
            )}
            {overridden && text("methodReason", "Why a different method", { area: true, required: true })}
            {options.routeSetExternally && text("externalRouteNote", "What the external body decided", { area: true, required: true, hint: "Set by an external body." })}
            {method && (method.requiresJustification || method.requiresDossier) &&
              text("justificationText", "Justification", { area: true, required: method.requiresJustification, hint: method.justificationPrompt || undefined })}
            {method?.requiresDossier && (
              <>
                {select("justificationReasonCode", "Reason", reasons.map((x) => ({ value: x.code, label: x.name })), {
                  required: true,
                  placeholder: reasons.length ? "Choose" : "No reasons configured",
                })}
                {text("evidenceNote", "Supporting evidence", { area: true, hint: EVIDENCE_NOTE_HINT })}
              </>
            )}
            {method?.requiresCoordinationRecord && (
              <>
                {text("emergencyTrigger", "What triggered the emergency", { area: true, required: true })}
                {text("coordinationMeetingOn", "Coordination meeting", { type: "date", required: true })}
                {text("bqReference", "Bill of quantities reference", { mono: true })}
                {text("coordinationAttendees", "Who attended", { area: true })}
                {text("coordinationScopeNote", "Scope the meeting fixed", { area: true, hint: SCOPE_NOTE_HINT })}
              </>
            )}
            {method && !method.requiresFreshSourcing && (
              <Field label="Parent contract" htmlFor="sx-parentContractRef" required hint="Capacity not tracked." error={e.parentContractRef}>
                <Select id="sx-parentContractRef" name="parentContractRef" value={v.parentContractRef ?? ""} onChange={set("parentContractRef")} placeholder="Search contracts" search={{ url: "/api/lookup?kind=contract", minChars: 0, labels: initial.parentContractRef ? { [initial.parentContractRef]: initial.parentContractRef } : undefined }} aria-invalid={e.parentContractRef ? true : undefined}>
                  <option value="">Search contracts</option>
                </Select>
              </Field>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Contract type and basis" />
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
                {text("contractTypeOverrideReason", "Why this type", { area: true, hint: "Needed if not the derived type." })}
                <ActAttributionFields spec={actorField("SourcingExercise.overriddenBy", { name: "overriddenByPersonId", hint: "Recorded as you, in Contract & Procurement." })} errors={e} />
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <ButtonLink href={cancelHref} variant="ghost">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" disabled={pending} icon={<SaveIcon size={15} />}>
            {pending ? "Saving…" : mode === "new" ? "Start" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/// The deliverable with the largest value among a saved draft's parts; empty when none.
function largestKind(parts: readonly ScopeLine[]): string {
  const byKind = new Map<string, number>();
  for (const p of parts) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + (Number(p.amount.replace(/,/g, "")) || 0));
  let best = "";
  let most = -1;
  for (const [k, n] of byKind) if (n > most) [best, most] = [k, n];
  return best;
}
