"use client";

import { useState } from "react";

import { useActorName, useActorPersonId } from "@/components/auth/actor-context";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { actFieldNames, actFieldNameList } from "@/lib/auth/act-field-names";
import { ACT_TEXT } from "@/lib/auth/act-text";
import type { ActorFieldSpec } from "@/lib/auth/actor-field";

/**
 * The shared part of every act's form that says who is acting (ADR 0034 D12, Phase 2b). One component, so no two acts ask it differently.
 *
 * - The person is the one signed in, shown and not chosen.
 * - A signature-class act asks the password again, every time.
 * - Where the act may come from a paper record (`onBehalf`), a switch opens the person it is recorded for, the paper's reference and the reason. Recorded
 *   that way it is not signed, and says so wherever it is read.
 * - A signed act is dated today by the server. Where it may be dated earlier (`backdate`), a switch opens the reason and the officer who authorised it.
 *
 * The names it posts are those of `ACT_FIELDS` (`src/app/_auth/act.ts`), which is the only place they are read.
 */

/// The field names this component posts besides the person's own: the record editor places these so that a refusal on one is shown beside it.
export const actPostedNames = actFieldNameList;

export function ActAttributionFields({ spec, errors, initial }: { spec: ActorFieldSpec; errors?: Record<string, string>; initial?: string | boolean | null }) {
  const actorName = useActorName();
  const actorId = useActorPersonId();
  const [chosenPaper, setPaper] = useState(false);
  const [named, setNamed] = useState(typeof initial === "string" ? initial : "");
  const [back, setBack] = useState(false);
  const id = `act-${spec.name}`;
  const n = actFieldNames(spec.name);
  // An act for one named person (a panel member's authorisation): the person's own where they are the one signed in, and otherwise a paper record of theirs.
  const forOther = spec.forPerson != null && actorId !== spec.forPerson.id;
  const paper = chosenPaper || forOther;
  const asYou = forOther ? spec.forPerson!.name : actorName ? `${actorName} (you, signed in)` : "The person signed in";

  if (spec.named) {
    // The form names whom the act is about. The signed-in person is the plain case; another is recorded for from their paper.
    const options = spec.named.options;
    const mine = actorId != null && options.some((o) => o.value === actorId) ? actorId : null;
    const chosen = named === "" && !spec.named.optional ? (mine ?? "") : named;
    const another = chosen !== "" && chosen !== actorId;
    return (
      <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
        <Field label={spec.label} required={!spec.named.optional} htmlFor={`${id}-named`} hint={another ? ACT_TEXT.recordedFromPaperNotByThem : (spec.hint ?? ACT_TEXT.namedDefault)} error={errors?.[spec.name]}>
          <Select id={`${id}-named`} name={spec.name} value={chosen} onChange={(e) => setNamed(e.target.value)} aria-invalid={errors?.[spec.name] ? true : undefined}>
            <option value="">{spec.named.optional ? "None" : "Choose"}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.value === actorId ? `${o.label} (you)` : o.label}
              </option>
            ))}
          </Select>
        </Field>
        {another && (
          <>
            <Field label="Paper reference" htmlFor={`${id}-paper`} hint={ACT_TEXT.paperReferenceNamed} error={errors?.[n.paperReference]}>
              <Input id={`${id}-paper`} name={n.paperReference} aria-invalid={errors?.[n.paperReference] ? true : undefined} />
            </Field>
            <Field label="Why it is recorded for them" htmlFor={`${id}-why`} hint={ACT_TEXT.reasonNeeded} error={errors?.[n.reason]}>
              <Textarea id={`${id}-why`} name={n.reason} rows={2} aria-invalid={errors?.[n.reason] ? true : undefined} />
            </Field>
          </>
        )}
      </div>
    );
  }

  if (forOther) {
    return (
      <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
        <input type="hidden" name={n.onBehalf} value="on" />
        <input type="hidden" name={spec.name} value={spec.forPerson!.id} />
        <Field label={spec.label} hint={ACT_TEXT.forOtherHint} error={errors?.[spec.name] ?? errors?.[n.onBehalf]}>
          <div className="flex h-10 items-center rounded-control bg-sunken px-3.5 text-[14px] text-ink-2">{asYou}</div>
        </Field>
        <Field label="Paper reference" htmlFor={`${id}-paper`} hint={ACT_TEXT.paperReferenceAuthorisation} error={errors?.[n.paperReference]}>
          <Input id={`${id}-paper`} name={n.paperReference} aria-invalid={errors?.[n.paperReference] ? true : undefined} />
        </Field>
        <Field label="Why it is recorded for them" htmlFor={`${id}-why`} hint={ACT_TEXT.reasonNeeded} error={errors?.[n.reason]}>
          <Textarea id={`${id}-why`} name={n.reason} rows={2} aria-invalid={errors?.[n.reason] ? true : undefined} />
        </Field>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
      <Field label={spec.label} hint={paper ? ACT_TEXT.recordedFromPaper : (spec.hint ?? ACT_TEXT.yourOwn)} error={paper ? undefined : errors?.[spec.name]}>
        <div className="flex h-10 items-center rounded-control bg-sunken px-3.5 text-[14px] text-ink-2">{asYou}</div>
      </Field>

      {spec.signature && !paper && (
        <Field label="Your password" required htmlFor={`${id}-password`} hint={ACT_TEXT.passwordHint} error={errors?.[n.password]}>
          <Input id={`${id}-password`} type="password" name={n.password} autoComplete="current-password" aria-invalid={errors?.[n.password] ? true : undefined} />
        </Field>
      )}

      {spec.backdate && !paper && (
        <>
          <div>
            <Switch name={n.backdate} checked={back} onChange={(e) => setBack(e.target.checked)} label="Dated earlier than today" description={ACT_TEXT.backdateDescription} />
            {errors?.[n.backdate] && <p className="mt-1.5 text-[12.5px] font-medium text-rose-600">{errors[n.backdate]}</p>}
          </div>
          {back && (
            <>
              <Field label="Why it is dated earlier" required htmlFor={`${id}-backdate-reason`} error={errors?.[n.backdateReason]}>
                <Textarea id={`${id}-backdate-reason`} name={n.backdateReason} rows={2} aria-invalid={errors?.[n.backdateReason] ? true : undefined} />
              </Field>
              <Field label="Authorised by" required htmlFor={`${id}-backdate-by`} hint={ACT_TEXT.backdateAuthoriserHint} error={errors?.[n.backdateAuthorisedBy]}>
                <Select id={`${id}-backdate-by`} name={n.backdateAuthorisedBy} defaultValue="" aria-invalid={errors?.[n.backdateAuthorisedBy] ? true : undefined}>
                  <option value="">Choose</option>
                  {spec.backdate.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </>
      )}

      {spec.onBehalf && !spec.forPerson && (
        <>
          <div>
            <Switch name={n.onBehalf} checked={chosenPaper} onChange={(e) => setPaper(e.target.checked)} label="Recorded from a paper record for someone else" description={ACT_TEXT.paperDescription} />
            {errors?.[n.onBehalf] && <p className="mt-1.5 text-[12.5px] font-medium text-rose-600">{errors[n.onBehalf]}</p>}
          </div>
          {chosenPaper && (
            <>
              <Field label="Recorded on behalf of" required htmlFor={`${id}-person`} error={errors?.[spec.name]}>
                <Select id={`${id}-person`} name={spec.name} defaultValue="" aria-invalid={errors?.[spec.name] ? true : undefined}>
                  <option value="">Choose</option>
                  {spec.onBehalf.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paper reference" htmlFor={`${id}-paper`} hint={ACT_TEXT.paperReferenceSignature} error={errors?.[n.paperReference]}>
                <Input id={`${id}-paper`} name={n.paperReference} aria-invalid={errors?.[n.paperReference] ? true : undefined} />
              </Field>
              <Field label="Why it is recorded for them" htmlFor={`${id}-why`} hint={ACT_TEXT.reasonNeeded} error={errors?.[n.reason]}>
                <Textarea id={`${id}-why`} name={n.reason} rows={2} aria-invalid={errors?.[n.reason] ? true : undefined} />
              </Field>
            </>
          )}
        </>
      )}
    </div>
  );
}
