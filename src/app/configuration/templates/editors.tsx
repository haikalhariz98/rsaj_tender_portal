import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { DocumentClass, DocumentTemplate } from "@/lib/records/load";

import { MERGE_FIELDS } from "@/lib/award/fields";

import { saveTemplate } from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function templateFields(editing: boolean, classes: DocumentClass[]): Field[] {
  return [
    ...(editing
      ? []
      : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true }] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "text",
      name: "formCode",
      label: "Form code",
      mono: true,
      hint: "As printed on the controlled form this replaces.",
    },
    { kind: "date", name: "revisionDate", label: "Revision date" },
    {
      kind: "switch",
      name: "bilingual",
      label: "Carries both languages on one page",
    },
    {
      kind: "select",
      name: "documentClassId",
      label: "Document class",
      placeholder: "Not classified",
      hint: "Sets retention and controlled-copy handling for anything issued on this template.",
      options: classes.map((c) => ({ value: c.id, label: c.nameEn })),
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
    {
      kind: "note",
      text: `The text the portal issues on this template: plain paragraphs, a blank line between them, with merge fields in double braces. None ships: an empty text cannot be issued. Merge fields: ${MERGE_FIELDS.map((f) => `{{${f.key}}} ${f.labelEn.toLowerCase()}`).join("; ")}.`,
    },
    { kind: "textarea", name: "bodyMs", label: "Text (Malay)" },
    { kind: "textarea", name: "bodyEn", label: "Text (English)" },
    {
      kind: "select",
      name: "primaryLanguage",
      label: "Issued first in",
      placeholder: "Not set",
      hint: "Needed only where both texts are written.",
      options: [
        { value: "MS", label: "Malay" },
        { value: "EN", label: "English" },
      ],
    },
  ];
}

export function AddTemplate({ classes }: { classes: DocumentClass[] }) {
  return (
    <RecordEditor
      title="Add a template"
      description="A form the portal issues, and the printed original it stands next to."
      fields={templateFields(false, classes)}
      action={saveTemplate}
      size="lg"
      submitLabel="Add template"
      trigger={{ label: "Add template", icon: true }}
    />
  );
}

export function EditTemplate({
  row,
  classes,
}: {
  row: DocumentTemplate;
  classes: DocumentClass[];
}) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...templateFields(true, classes)]}
      action={saveTemplate}
      size="lg"
      trigger={{ label: `Edit ${row.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: row.id,
        code: row.code,
        nameEn: row.nameEn,
        nameMs: row.nameMs,
        formCode: row.formCode,
        revisionDate: day(row.revisionDate),
        bilingual: row.bilingual,
        documentClassId: row.documentClassId,
        provenance: row.provenance,
        sortOrder: String(row.sortOrder),
        notes: row.notes,
        bodyMs: row.bodyMs,
        bodyEn: row.bodyEn,
        primaryLanguage: row.primaryLanguage,
      }}
    />
  );
}
