import { RecordEditor, type Field } from "@/components/record-editor";
import type { DocumentClass } from "@/lib/records/load";

import { saveDocumentClass } from "./actions";

function classFields(editing: boolean): Field[] {
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
    options: [
      { value: "STATED", label: "Stated — written in a governing document" },
      { value: "OBSERVED", label: "Observed — seen in practice" },
      { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
    ],
  },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddDocumentClass() {
  return (
    <RecordEditor
      title="Add a document class"
      description="A kind of document, and what the organisation must do with it."
      fields={classFields(false)}
      action={saveDocumentClass}
      submitLabel="Add class"
      trigger={{ label: "Add class", icon: true }}
    />
  );
}

export function EditDocumentClass({ row }: { row: DocumentClass }) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...classFields(true)]}
      action={saveDocumentClass}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
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
      }}
    />
  );
}
