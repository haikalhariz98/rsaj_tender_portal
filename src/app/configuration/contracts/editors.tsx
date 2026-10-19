import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { retireContractRow, saveContractPolicy, saveCopyRecipient, saveDocumentPart } from "./actions";

/**
 * The Contract controls drawers. No field carries a default: an unset field is not set, and the screen
 * says what that stops.
 */

type Option = { value: string; label: string };
type Values = Record<string, string | boolean | null>;
const hidden = (name: string): Field => ({ kind: "hidden", name });
const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];
const PROVENANCE: Field = { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS };
const ORDER: Field = { kind: "number", name: "sortOrder", label: "Order", min: 0 };
const NOTES: Field = { kind: "textarea", name: "notes", label: "Notes" };
const code = (editing: boolean): Field[] => (editing ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Used internally. Never shown on a screen." }]);
const edit = (label: string) => ({ label: `Edit ${label}`, iconOnly: <PencilIcon size={15} /> });

export function EditContractPolicy({ values, units, conditions, offices }: { values: Values; units: Option[]; conditions: Option[]; offices: Option[] }) {
  return (
    <RecordEditor
      title="Contract controls"
      description="Every setting starts unset. Preparation will not start on an unset one."
      fields={[
        { kind: "select", name: "legalOfficeCode", label: "The legal office that reviews contracts", placeholder: "Not set", options: units },
        { kind: "select", name: "signatoryCond", label: "The approval matrix's signatory rows for the contract agreement", placeholder: conditions.length ? "Not set" : "No signatory rows other than the award's instruments", options: conditions, hint: "Rows on the matter of who signs, set on the approval matrix." },
        { kind: "select", name: "employerSigningRoleCode", label: "The office that signs a reconciliation amendment for the employer", placeholder: "Not set", options: offices, orphanLabel: "An office no longer configured", hint: "Unset, an amendment is still recorded, with the offices its signer held on the day, and the screen says the office is not set. Set, only a holder of this office on the day can sign for the employer." },
        { kind: "text", name: "controlledCopyStampEn", label: "Words stamped on a controlled copy", placeholder: "e.g. Controlled copy" },
        { kind: "text", name: "controlledCopyStampMs", label: "The same words in Malay" },
        { kind: "text", name: "frontLoadingRatio", label: "Front loading: list rates above this multiple of the estimate's", placeholder: "e.g. 1.5", hint: "Unset: no list, the officer's judgement only." },
        { kind: "select", name: "provenance", label: "Where these controls came from", placeholder: "Not recorded", options: PROVENANCE_OPTIONS },
        NOTES,
      ]}
      values={values}
      action={saveContractPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit controls", className: buttonClass("primary", "sm") }}
      size="lg"
    />
  );
}

const partFields = (editing: boolean, bases: Option[]): Field[] => [
  ...code(editing),
  { kind: "select", name: "contractBasisCode", label: "Contract basis", required: true, placeholder: "Choose", options: bases },
  { kind: "text", name: "printedNumber", label: "Printed number", placeholder: "e.g. 3" },
  { kind: "text", name: "labelEn", label: "Part", required: true },
  { kind: "text", name: "labelMs", label: "Part (Malay)" },
  PROVENANCE,
  ORDER,
  NOTES,
];

export function AddDocumentPart({ bases }: { bases: Option[] }) {
  return <RecordEditor title="Add a Contract Document part" description="A part of the Contract Document for a basis, in its prescribed order." fields={partFields(false, bases)} action={saveDocumentPart} submitLabel="Add part" trigger={{ label: "Add part", icon: true }} size="md" />;
}
export function EditDocumentPart({ id, values, name, bases }: { id: string; values: Values; name: string; bases: Option[] }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...partFields(true, bases)]} values={{ id, ...values }} action={saveDocumentPart} trigger={edit(name)} size="md" />;
}

const recipientFields = (editing: boolean): Field[] => [
  ...code(editing),
  { kind: "text", name: "nameEn", label: "Recipient", required: true },
  { kind: "text", name: "nameMs", label: "Recipient (Malay)" },
  { kind: "text", name: "copyForm", label: "What they receive", placeholder: "e.g. one original with drawings and a PDF" },
  { kind: "switch", name: "mandatory", label: "Mandatory: distribution is not complete without this copy" },
  { kind: "switch", name: "onlyWithConsultingEngineer", label: "Only where a consulting engineer is engaged" },
  PROVENANCE,
  ORDER,
  NOTES,
];

export function AddCopyRecipient() {
  return <RecordEditor title="Add a controlled-copy recipient" description="Who receives a controlled copy of an executed contract." fields={recipientFields(false)} action={saveCopyRecipient} submitLabel="Add recipient" trigger={{ label: "Add recipient", icon: true }} size="md" />;
}
export function EditCopyRecipient({ id, values, name }: { id: string; values: Values; name: string }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...recipientFields(true)]} values={{ id, ...values }} action={saveCopyRecipient} trigger={edit(name)} size="md" />;
}

export function RetireContractRow({ entity, id, label, today }: { entity: string; id: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="No longer offered from the day given. Contracts in preparation keep it."
      fields={[hidden("entity"), hidden("id"), { kind: "date", name: "retiredOn", label: "Retired from", required: true }]}
      values={{ entity, id, retiredOn: today }}
      action={retireContractRow}
      submitLabel="Retire"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{ label: "Retire", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}
