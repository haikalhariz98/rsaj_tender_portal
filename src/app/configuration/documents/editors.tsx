import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { DocumentClass } from "@/lib/records/load";

import { actorField } from "@/lib/auth/actor-field";
import { classClassificationChoices, lowers } from "@/lib/documents/classification";
import { CLASS_CLASSIFICATION_HINT, classificationChoiceText, classificationLabel, LOWER_NOTE, DISPOSAL_METHOD_LABEL, MEDIA_LABEL, RETENTION_TRIGGER_LABEL } from "@/lib/documents/labels";
import { bytesToMegabytes } from "@/lib/documents/policy";
import { DISPOSAL_METHODS, KNOWN_MEDIA_TYPES, RETENTION_TRIGGERS, SECURITY_CLASSES, type SecurityClass } from "@/lib/documents/types";
import { buttonClass } from "@/components/ui/button";

import { releaseLegalHold } from "@/app/documents/actions";

import { lowerClassClassification, saveDocumentClass, saveStorePolicy } from "./actions";

export type OfficeOption = { value: string; label: string };

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];

/// The class's classification field: only the changes the rule allows can be chosen; the
/// rest are listed with the reason (BD-DS-11 as ruled). Judged by the same lib check the save runs.
function classificationField(current: SecurityClass | null): Field {
  const choices = classClassificationChoices(current);
  const unset = choices.find((c) => c.value == null)!;
  return {
    kind: "select",
    name: "classification",
    label: "Classification",
    placeholder: classificationChoiceText(unset),
    placeholderDisabled: !unset.allowed,
    options: choices.filter((c) => c.value != null).map((c) => ({ value: c.value!, label: classificationChoiceText(c), disabled: !c.allowed })),
    hint: current == null ? "Taken by each document when it is filed. SULIT and not set are listed but never opened in the portal. Once set, it is not taken away or lowered by one person." : CLASS_CLASSIFICATION_HINT,
  };
}

function classFields(editing: boolean, offices: OfficeOption[], classification: SecurityClass | null = null): Field[] {
  return [
    ...(editing
      ? []
      : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true }] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "hidden", name: "nameMs" },
    {
      kind: "number",
      name: "retentionMonths",
      label: "Keep for (months)",
      min: 1,
      hint: "Leave empty where nobody has set a period. Empty is not zero — nothing is disposed of on an assumption.",
    },
    {
      kind: "select",
      name: "retentionTrigger",
      label: "Retention starts",
      placeholder: "Not set",
      options: RETENTION_TRIGGERS.map((t) => ({ value: t, label: RETENTION_TRIGGER_LABEL[t] })),
      hint: "What starts the clock on the period above. Not set means it never starts, so nothing is disposed of.",
    },
    classificationField(classification),
    {
      kind: "select",
      name: "disposalMethod",
      label: "How it is disposed of",
      placeholder: "Not set",
      options: DISPOSAL_METHODS.map((m) => ({ value: m, label: DISPOSAL_METHOD_LABEL[m] })),
      hint: "Recorded for the day retention ends. The portal disposes of nothing.",
    },
    {
      kind: "select",
      name: "disposalAuthorityRoleCode",
      label: "Whose authority disposal needs",
      placeholder: "Not set",
      options: offices,
      orphanLabel: "An office no longer configured",
    },
    {
      kind: "switch",
      name: "controlledCopy",
      label: "Issued copies are numbered and recalled",
    },
    {
      kind: "switch",
      name: "releaseNeedsApproval",
      label: "Release outside the organisation needs approval",
    },
  {
    kind: "select",
    name: "provenance",
    label: "Where this came from",
    required: true,
    placeholder: "Choose",
    options: PROVENANCE_OPTIONS,
  },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddDocumentClass({ offices }: { offices: OfficeOption[] }) {
  return (
    <RecordEditor
      title="Add a document class"
      description="A kind of document, and what the organisation must do with it."
      fields={classFields(false, offices)}
      action={saveDocumentClass}
      submitLabel="Add class"
      trigger={{ label: "Add class", icon: true }}
    />
  );
}

/// BD-DS-11 (Phase 5a): a class's classification is lowered by its own act, proposed with a reason and decided by a second person. Offered only where one is set and something is lower.
export function LowerClassClassification({ id, name, current }: { id: string; name: string; current: SecurityClass | null }) {
  const lower = current == null ? [] : SECURITY_CLASSES.filter((c) => lowers(current, c));
  if (lower.length === 0) return null;
  return (
    <RecordEditor
      title={`Lower the classification of ${name}`}
      description={`Now ${classificationLabel(current)}.`}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "note", text: LOWER_NOTE },
        { kind: "select", name: "classification", label: "Lower it to", required: true, placeholder: "Choose", options: lower.map((c) => ({ value: c, label: classificationLabel(c) })) },
      ]}
      values={{ id }}
      reason={{ label: "Why is it being lowered?" }}
      action={lowerClassClassification}
      submitLabel="Propose the lowering"
      trigger={{ label: "Lower classification", className: buttonClass("ghost", "sm"), ariaLabel: `Lower the classification of ${name}` }}
      size="sm"
    />
  );
}

export function EditDocumentClass({ row, offices }: { row: DocumentClass; offices: OfficeOption[] }) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...classFields(true, offices, row.classification)]}
      action={saveDocumentClass}
      trigger={{ label: `Edit ${row.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: row.id,
        code: row.code,
        nameEn: row.nameEn,
        nameMs: row.nameMs,
        retentionMonths: row.retentionMonths == null ? null : String(row.retentionMonths),
        controlledCopy: row.controlledCopy,
        releaseNeedsApproval: row.releaseNeedsApproval,
        provenance: row.provenance,
        sortOrder: String(row.sortOrder),
        notes: row.notes,
        classification: row.classification,
        retentionTrigger: row.retentionTrigger,
        disposalMethod: row.disposalMethod,
        disposalAuthorityRoleCode: row.disposalAuthorityRoleCode,
      }}
    />
  );
}

/// The organisation's upload rules (OD-3). Either may be left unset; uploads are then refused, naming it.
export function EditStorePolicy({ policy, sulitClasses }: { policy: { allowedMediaTypes: readonly string[]; maxBytes: string | null; onlineBidFileClassId: string | null; provenance: string | null; notes: string }; sulitClasses: { value: string; label: string }[] }) {
  return (
    <RecordEditor
      title="Upload rules"
      description="Which files the portal accepts, and how large."
      fields={[
        {
          kind: "tokens",
          name: "allowedMediaTypes",
          label: "Allowed types",
          placeholder: "Not set",
          options: KNOWN_MEDIA_TYPES.map((t) => ({ value: t, label: MEDIA_LABEL[t] })),
          hint: "Only types the portal can recognise from a file's own contents are offered. Excel workbooks and Word documents apply to staff uploads only: suppliers are not offered them and cannot upload them. Leave it empty and uploads are refused until it is set.",
        },
        {
          kind: "text",
          name: "maxMegabytes",
          label: "Largest file (MB)",
          placeholder: "e.g. 20",
          hint: "1 MB here is 1,048,576 bytes. Leave it empty and uploads are refused until it is set. The deployment may hold a lower limit of its own.",
        },
        { kind: "select", name: "onlineBidFileClassId", label: "Class of a filed online bid file", placeholder: "Not set", options: sulitClasses, hint: "An online bid's files are filed in the document store when its opening is finalised, under this class. It must be classified SULIT. Leave it empty and an online opening cannot be finalised until it is set." },
        { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      reason={{ label: "Why is it being changed?" }}
      action={saveStorePolicy}
      trigger={{ label: "Edit upload rules", iconOnly: <PencilIcon size={15} /> }}
      values={{
        allowedMediaTypes: policy.allowedMediaTypes.join("\n"),
        maxMegabytes: policy.maxBytes ? bytesToMegabytes(BigInt(policy.maxBytes)) : null,
        onlineBidFileClassId: policy.onlineBidFileClassId,
        provenance: policy.provenance,
        notes: policy.notes,
      }}
    />
  );
}

/// Release a standing legal hold: by a named person, with the reason.
export function ReleaseHold({ holdId, title, reason }: { holdId: string; title: string; reason: string }) {
  return (
    <RecordEditor
      title={`Release the legal hold on ${title}`}
      fields={[
        { kind: "hidden", name: "holdId" },
        { kind: "note", text: `The hold was placed because: ${reason}` },
        actorField("LegalHold.releasedBy", { name: "personId" }),
      ]}
      values={{ holdId }}
      reason={{ label: "Why is the hold released?" }}
      action={releaseLegalHold}
      submitLabel="Release hold"
      trigger={{ label: "Release", ariaLabel: `Release the legal hold on ${title}`, className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}
