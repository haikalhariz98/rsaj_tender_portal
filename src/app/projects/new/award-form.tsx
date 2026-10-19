"use client";

import { useState, useTransition } from "react";

import { SaveIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InfoChip } from "@/components/ui/info-chip";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { KeyValues } from "@/components/ui/stat";
import { DOSSIER_EVIDENCE_NEEDED } from "@/lib/award/labels";

import { createAward } from "@/app/awards/actions";

/**
 * Opening an award on an exercise in preparation. What typed is kept on a refused save;
 * every rule is the action's. The exercise's classification is shown read-only: the
 * award reads it and never copies it.
 */
/// 6.8 (E-9): the evaluation's recommendation the award is pre-filled from; the bidder cannot differ, the value and period may, each with its reason.
export type Recommended = { partyId: string; name: string; registrationNo: string; address: string; value: string; valueText: string; period: string; unit: string; version: number };

/// 6.15a fix S-3: a bidder's linked supplier and its standing on the register, as the form shows it; a barred one carries its warning.
export type PartyRegister = { supplier: string; words: string; tone: "ok" | "warn" | "err" | "info" | "neutral"; warning: string | null };

export function AwardForm({ exercise, cancelHref, valueHint, dossier, parties, recommended }: { exercise: { id: string; facts: { label: string; value: string }[] }; cancelHref: string; valueHint: string; dossier: boolean; parties?: { id: string; name: string; registrationNo: string; address: string; register: PartyRegister | null }[]; recommended?: Recommended }) {
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<Record<string, string>>(recommended ? { awardeePartyId: recommended.partyId, awardeeName: recommended.name, awardeeRegistrationNo: recommended.registrationNo, awardeeAddress: recommended.address, awardedValue: recommended.value, completionPeriod: recommended.period, completionUnit: recommended.unit } : { completionUnit: "" });
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => state.errors?.[k];
  return (
    <form onSubmit={(e) => { const data = formDataOf(e); startTransition(async () => setState(await createAward(state, data))); }} className="flex flex-col gap-6">
      <input type="hidden" name="exerciseId" value={exercise.id} />
      {state.message && <Callout tone="err">{state.message}</Callout>}
      {dossier && (
        <Callout tone="warn" title={DOSSIER_EVIDENCE_NEEDED.title}>
          {DOSSIER_EVIDENCE_NEEDED.body}
        </Callout>
      )}
      <Card>
        <CardHeader title="The exercise" subtitle="As classified" />
        <CardBody>
          <KeyValues columns={2} items={exercise.facts.map((f) => ({ label: f.label, value: f.value }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="The awardee" subtitle={parties ? "A bidder carried to evaluation" : "As registered"} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {parties && (
            <div className="sm:col-span-2">
              <Field label="Bidder carried to evaluation" required htmlFor="awardeePartyId" hint="Compared as this bidder." error={err("awardeePartyId")}>
                <Select
                  id="awardeePartyId"
                  name="awardeePartyId"
                  value={v.awardeePartyId ?? ""}
                  onChange={(e) => {
                    const p = parties.find((x) => x.id === e.target.value);
                    setV((x) => ({ ...x, awardeePartyId: e.target.value, ...(p ? { awardeeName: x.awardeeName || p.name, awardeeRegistrationNo: x.awardeeRegistrationNo || p.registrationNo, awardeeAddress: x.awardeeAddress || p.address } : {}) }));
                  }}
                >
                  <option value="">Choose</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{`${p.name} (${p.registrationNo})`}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {(() => {
            // 6.15a fix S-3: the chosen bidder's supplier standing; a barred one is warned of, never refused.
            const reg = parties?.find((p) => p.id === v.awardeePartyId)?.register;
            if (!parties || !v.awardeePartyId) return null;
            return (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                  <span className="font-semibold">On the supplier register:</span>
                  {reg ? <><span className="break-words">{reg.supplier}</span><Badge tone={reg.tone} dot>{reg.words}</Badge></> : <span className="text-ink-3">Not linked</span>}
                </p>
                {reg?.warning && <Callout tone="warn" title="The bidder's supplier is barred on the register">{reg.warning}</Callout>}
              </div>
            );
          })()}
          <Field label="Awardee" required htmlFor="awardeeName" error={err("awardeeName")}>
            <Input id="awardeeName" name="awardeeName" value={v.awardeeName ?? ""} onChange={set("awardeeName")} />
          </Field>
          <Field label="Registration number" htmlFor="awardeeRegistrationNo" error={err("awardeeRegistrationNo")}>
            <Input id="awardeeRegistrationNo" name="awardeeRegistrationNo" value={v.awardeeRegistrationNo ?? ""} onChange={set("awardeeRegistrationNo")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" htmlFor="awardeeAddress" error={err("awardeeAddress")}>
              <Textarea id="awardeeAddress" name="awardeeAddress" rows={2} value={v.awardeeAddress ?? ""} onChange={set("awardeeAddress")} />
            </Field>
          </div>
        </CardBody>
      </Card>
      {recommended && (
        <div><InfoChip outline detail="The awardee is the recommended tenderer and cannot differ. The value and period may differ, each with its reason.">{`Pre-filled from evaluation version ${recommended.version}`}</InfoChip></div>
      )}
      <Card>
        <CardHeader title="Value and period" subtitle="Within the requisition's approval" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Awarded value" required htmlFor="awardedValue" hint={valueHint} error={err("awardedValue")}>
            <Input id="awardedValue" name="awardedValue" inputMode="decimal" value={v.awardedValue ?? ""} onChange={set("awardedValue")} />
          </Field>
          <Field label="Stated start date" htmlFor="startDate" hint="Can be set later, before issue." error={err("startDate")}>
            <Input id="startDate" name="startDate" type="date" value={v.startDate ?? ""} onChange={set("startDate")} />
          </Field>
          <Field label="Completion period" required htmlFor="completionPeriod" error={err("completionPeriod")}>
            <Input id="completionPeriod" name="completionPeriod" inputMode="numeric" value={v.completionPeriod ?? ""} onChange={set("completionPeriod")} />
          </Field>
          <Field label="Counted in" required htmlFor="completionUnit" error={err("completionUnit")}>
            <Select id="completionUnit" name="completionUnit" value={v.completionUnit ?? ""} onChange={set("completionUnit")}>
              <option value="">Choose</option>
              <option value="DAYS">Days</option>
              <option value="WEEKS">Weeks</option>
              <option value="MONTHS">Months</option>
            </Select>
          </Field>
          {recommended && (
            <>
              <Field label="Why the value differs from the recommendation" htmlFor="recValueDiffersReason" hint={`Recommended: ${recommended.valueText}.`} error={err("recValueDiffersReason")}>
                <Textarea id="recValueDiffersReason" name="recValueDiffersReason" rows={2} value={v.recValueDiffersReason ?? ""} onChange={set("recValueDiffersReason")} />
              </Field>
              <Field label="Why the period differs from the recommendation" htmlFor="recPeriodDiffersReason" hint="Only where the period differs." error={err("recPeriodDiffersReason")}>
                <Textarea id="recPeriodDiffersReason" name="recPeriodDiffersReason" rows={2} value={v.recPeriodDiffersReason ?? ""} onChange={set("recPeriodDiffersReason")} />
              </Field>
            </>
          )}
        </CardBody>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost" size="md">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} icon={<SaveIcon size={15} />}>
          {pending ? "Saving…" : "Open the award"}
        </Button>
      </div>
    </form>
  );
}
