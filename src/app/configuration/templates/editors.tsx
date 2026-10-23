import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { DocumentClass, DocumentTemplate } from "@/lib/records/load";

import { MERGE_FIELDS } from "@/lib/award/fields";
import { PACK_MERGE_FIELDS } from "@/lib/tender-docs/fields";
import { EVALUATION_MERGE_FIELDS } from "@/lib/evaluation/instrument";
import { CERTIFICATE_MERGE_FIELDS } from "@/lib/certificate/fields";

import { saveTemplate } from "./actions";
import { InsertClause } from "./insert-tools";
import { Disclosure } from "@/components/ui/disclosure";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function templateFields(editing: boolean, classes: DocumentClass[]): Field[] {
  return [
    ...(editing
      ? []
      : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true }] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "hidden", name: "nameMs" },
    {
      kind: "text",
      name: "formCode",
      label: "Form code",
      mono: true,
      hint: "As printed on the controlled form this replaces.",
    },
    { kind: "date", name: "revisionDate", label: "Revision date" },
    {
      kind: "select",
      name: "documentClassId",
      label: "Document class",
      placeholder: "Not classified",
      hint: "Sets retention and controlled-copy handling.",
      options: classes.map((c) => ({ value: c.id, label: c.nameEn })),
    },
  {
    kind: "select",
    name: "provenance",
    label: "Basis",
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
      text: "The text the portal issues on this template: plain paragraphs, a blank line between them, with merge fields in double braces — listed below the form. None ships: an empty text cannot be issued.",
    },
    { kind: "hidden", name: "bodyMs" },
    { kind: "textarea", name: "bodyEn", label: "Text (English)" },
    { kind: "hidden", name: "primaryLanguage" },
  ];
}

/// The merge fields a body may name, as lists to copy from: an award's and an agreement's, and a tender pack's in a group of their own, with a picker for the clauses.
function MergeFieldList({ clauses, terms = [] }: { clauses: { code: string; title: string }[]; terms?: { code: string; wording: string }[] }) {
  const group = (title: string, note: string | null, fields: readonly { key: string; labelEn: string }[]) => (
    <div>
      <p className="font-semibold text-ink-2">{title}</p>
      {note && <p className="mt-0.5 text-[12.5px] text-ink-3">{note}</p>}
      <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {fields.map((f) => (
          <li key={f.key} className="min-w-0 break-words">
            <code className="font-mono text-[12px] text-ink">{`{{${f.key}}}`}</code> <span className="text-ink-3">{f.labelEn}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <InsertClause clauses={clauses} />
      <Disclosure boxed title="Merge fields a text may use">
        <div className="flex flex-col gap-4">
          {group("Tender documents", "The registration and window fields belong in the notice, and the permit field in the instructions to tenderers. They are filled when the documents are submitted for approval.", PACK_MERGE_FIELDS)}
          {group("Awards and agreements", null, MERGE_FIELDS)}
          {group("Evaluation report", "Filled when the report is issued, from the evaluation as it stands then.", EVALUATION_MERGE_FIELDS.REPORT)}
          {group("Proposal paper", "Filled when the paper is produced; the offices are the evaluation policy's.", EVALUATION_MERGE_FIELDS.PROPOSAL.filter((f) => !EVALUATION_MERGE_FIELDS.REPORT.some((x) => x.key === f.key)))}
          {group("Certificates", "Filled when the certificate is issued, from its frozen figures, the baseline version it read and its signatures. A certificate's own figures are named by the module that computes them.", CERTIFICATE_MERGE_FIELDS)}
          {group("Terms", terms.length ? "A certificate prints the term's wording in the text's language, as the glossary holds it when the certificate is first signed." : "No term is in the glossary yet: add one on the Terms tab to cite it here.", terms.map((t) => ({ key: `term:${t.code}`, labelEn: t.wording })))}
        </div>
      </Disclosure>
    </div>
  );
}

export function AddTemplate({ classes, clauses, terms }: { classes: DocumentClass[]; clauses: { code: string; title: string }[]; terms?: { code: string; wording: string }[] }) {
  return (
    <RecordEditor
      title="Add a template"
      description="A form the portal issues, and the printed original it stands next to."
      fields={templateFields(false, classes)}
      sections={<MergeFieldList clauses={clauses} terms={terms} />}
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
  clauses,
  terms,
}: {
  row: DocumentTemplate;
  classes: DocumentClass[];
  clauses: { code: string; title: string }[];
  terms?: { code: string; wording: string }[];
}) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...templateFields(true, classes)]}
      sections={<MergeFieldList clauses={clauses} terms={terms} />}
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
