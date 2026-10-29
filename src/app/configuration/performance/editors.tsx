"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";

import { discardForm, issueForm, removeBand, removeCriterion, retireForm, saveBand, saveCriterion, saveForm } from "./actions";

/**
 * Settings › Performance forms, the drawers (Phase 2 close-out stage D). A draft is edited by its makers and issued by someone else; an issued form is
 * frozen and retired by a proposal a second person applies. Every known set of values is a dropdown.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const primary = buttonClass("primary", "sm");
const secondary = buttonClass("secondary", "sm");
const SCALES: Option[] = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `1 to ${n}` }));
const PROVENANCE: Option[] = [
  { value: "STATED", label: "Written in a governing document" },
  { value: "OBSERVED", label: "Seen in practice" },
  { value: "ASSUMED", label: "Assumed, to be confirmed" },
];
const sourceFields: Field[] = [
  { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE },
  { kind: "text", name: "source", label: "Source" },
];

export function FormDrawer({ types, form }: { types: Option[]; form?: { id: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={form ? "Edit the form" : "New performance form"}
      description="Each form belongs to one contract type."
      fields={[hidden("id"), ...(form ? [] : [{ kind: "select", name: "contractTypeCode", label: "Contract type", required: true, placeholder: types.length ? "Choose" : "No contract types", options: types } as Field]), { kind: "text", name: "nameEn", label: "Name", required: true }, { kind: "select", name: "scaleMax", label: "Scores run", required: true, placeholder: "Choose", options: SCALES }, ...sourceFields]}
      values={form ? { id: form.id, ...form.values } : undefined}
      action={saveForm}
      submitLabel={form ? "Save" : "Create"}
      trigger={form ? { label: "Edit", className: moreItemClass() } : { label: "New form", className: primary }}
    />
  );
}

export function CriterionDrawer({ formId, next }: { formId: string; next: number }) {
  return (
    <RecordEditor
      title="Add a criterion"
      description="The weights of a form total exactly 1."
      fields={[hidden("formId"), { kind: "number", name: "sortOrder", label: "Order", required: true, min: 1 }, { kind: "text", name: "labelEn", label: "Criterion", required: true }, { kind: "text", name: "weight", label: "Weight", required: true, hint: "Up to four places, such as 0.25." }, { kind: "textarea", name: "guideEn", label: "How it is scored" }]}
      values={{ formId, sortOrder: String(next) }}
      action={saveCriterion}
      submitLabel="Add"
      trigger={{ label: "Add criterion", className: secondary }}
    />
  );
}

export function BandDrawer({ formId }: { formId: string }) {
  return (
    <RecordEditor
      title="Add a grade"
      description="A grade runs up to the next one's start. The lowest starts at 0."
      fields={[hidden("formId"), { kind: "text", name: "label", label: "Grade", required: true }, { kind: "text", name: "lowerPct", label: "From score (%)", required: true }]}
      values={{ formId }}
      action={saveBand}
      submitLabel="Add"
      trigger={{ label: "Add grade", className: secondary }}
    />
  );
}

export function RemoveRowDrawer({ formId, kind, options }: { formId: string; kind: "criterion" | "grade"; options: Option[] }) {
  const name = kind === "criterion" ? "criterionId" : "bandId";
  return (
    <RecordEditor
      title={kind === "criterion" ? "Remove a criterion" : "Remove a grade"}
      description="Only a draft changes."
      fields={[hidden("formId"), { kind: "select", name, label: kind === "criterion" ? "Criterion" : "Grade", required: true, placeholder: "Choose", options }]}
      values={{ formId }}
      action={kind === "criterion" ? removeCriterion : removeBand}
      submitLabel="Remove"
      danger
      trigger={{ label: kind === "criterion" ? "Remove a criterion" : "Remove a grade", className: moreItemClass() }}
      size="sm"
    />
  );
}

export function IssueFormDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Issue the form"
      description="Frozen once issued. Reports pin it. Someone who did not make the draft issues it."
      fields={[hidden("id"), actorField("PerformanceForm.issuedBy", { name: "issuedByPersonId" })]}
      values={{ id }}
      action={issueForm}
      submitLabel="Issue"
      submitBlock={blocker}
      trigger={{ label: "Issue", className: primary }}
      size="sm"
    />
  );
}

export function DiscardFormDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Discard the draft"
      description="Removes the draft. Its trail is kept."
      fields={[hidden("id")]}
      values={{ id }}
      action={discardForm}
      submitLabel="Discard"
      destructive={{ reasonLabel: "Why is the draft discarded?" }}
      trigger={{ label: "Discard", className: moreItemClass() }}
      size="sm"
    />
  );
}

export function RetireFormDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Retire the form"
      description="No new report opens on it. Open reports keep it. A second person applies this."
      fields={[hidden("id")]}
      values={{ id }}
      action={retireForm}
      submitLabel="Propose"
      destructive={{ reasonLabel: "Why is it retired?" }}
      trigger={{ label: "Retire", className: moreItemClass() }}
      size="sm"
    />
  );
}
