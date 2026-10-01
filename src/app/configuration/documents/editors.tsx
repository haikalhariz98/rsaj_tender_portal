import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { DocumentClass } from "@/lib/records/load";

import { CLASSIFICATION_LABEL, DISPOSAL_METHOD_LABEL, MEDIA_LABEL, RETENTION_TRIGGER_LABEL } from "@/lib/documents/labels";
import { bytesToMegabytes } from "@/lib/documents/policy";
import { DISPOSAL_METHODS, KNOWN_MEDIA_TYPES, RETENTION_TRIGGERS, SECURITY_CLASSES } from "@/lib/documents/types";
import { buttonClass } from "@/components/ui/button";

import { releaseLegalHold } from "@/app/documents/actions";

import { saveDocumentClass, saveStorePolicy } from "./actions";

export type OfficeOption = { value: string; label: string };

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];

function classFields(editing: boolean, offices: OfficeOption[]): Field[] {
  return [
    ...(editing
      ? []
      : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true }] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
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
    {
      kind: "select",
      name: "classification",
      label: "Classification",
      placeholder: "Not set",
      options: SECURITY_CLASSES.map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] })),
      hint: "Taken by each document when it is filed. SULIT and not set are listed but never opened in the portal.",
    },
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

export function EditDocumentClass({ row, offices }: { row: DocumentClass; offices: OfficeOption[] }) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...classFields(true, offices)]}
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
export function EditStorePolicy({ policy }: { policy: { allowedMediaTypes: readonly string[]; maxBytes: string | null; provenance: string | null; notes: string } }) {
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
          hint: "Only types the portal can recognise from a file's own contents are offered. Leave it empty and uploads are refused until it is set.",
        },
        {
          kind: "text",
          name: "maxMegabytes",
          label: "Largest file (MB)",
          placeholder: "e.g. 20",
          hint: "1 MB here is 1,048,576 bytes. Leave it empty and uploads are refused until it is set. The deployment may hold a lower limit of its own.",
        },
        { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      reason={{ label: "Why is it being changed?" }}
      action={saveStorePolicy}
      trigger={{ label: "Edit upload rules", iconOnly: <PencilIcon size={15} /> }}
      values={{
        allowedMediaTypes: policy.allowedMediaTypes.join("\n"),
        maxMegabytes: policy.maxBytes ? bytesToMegabytes(BigInt(policy.maxBytes)) : null,
        provenance: policy.provenance,
        notes: policy.notes,
      }}
    />
  );
}

/// Release a standing legal hold: by a named person, with the reason.
export function ReleaseHold({ holdId, title, reason, people }: { holdId: string; title: string; reason: string; people: { value: string; label: string }[] }) {
  return (
    <RecordEditor
      title={`Release the legal hold on ${title}`}
      fields={[
        { kind: "hidden", name: "holdId" },
        { kind: "note", text: `The hold was placed because: ${reason}` },
        { kind: "select", name: "personId", label: "Released by", required: true, placeholder: "Choose who is recording it", options: people, hint: "Recorded on their behalf, not signed: nobody is signed in." },
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
