import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { retireRow, saveAwardPolicy, saveBand, saveConditionKind, saveIssuer, saveRecipient, saveRequirement, saveVariant } from "./actions";

/**
 * The Award controls drawers. No field carries a default: an unset field is not set,
 * and the screen says what that stops.
 */

type Option = { value: string; label: string };
type Values = Record<string, string | boolean | null>;
const hidden = (name: string): Field => ({ kind: "hidden", name });
const INSTRUMENTS: Option[] = [
  { value: "LETTER_OF_ACCEPTANCE", label: "Letter of Acceptance" },
  { value: "WORK_INDENT", label: "Work indent and appointment letter" },
];
const PROVENANCE: Field = {
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
};
const ORDER: Field = { kind: "number", name: "sortOrder", label: "Order", min: 0 };
const NOTES: Field = { kind: "textarea", name: "notes", label: "Notes" };
const code = (editing: boolean): Field[] => (editing ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Used internally. Never shown on a screen." }]);
const edit = (label: string) => ({ label: `Edit ${label}`, iconOnly: <PencilIcon size={15} /> });

export function EditAwardPolicy({ values, templates, units, label = "Edit controls", quiet }: { values: Values; templates: Option[]; units: Option[]; label?: string; quiet?: boolean }) {
  return (
    <RecordEditor
      title="Award controls"
      description="How this organisation awards. Every setting starts unset; an unset one refuses what depends on it rather than assuming."
      fields={[
        { kind: "select", name: "tenderInstrument", label: "Instrument in the tender band", placeholder: "Not set", options: INSTRUMENTS },
        { kind: "select", name: "quotationInstrument", label: "Instrument in the quotation band", placeholder: "Not set", options: INSTRUMENTS },
        { kind: "number", name: "indentValidityDays", label: "Days an indent is valid from its receipt", min: 1 },
        { kind: "number", name: "commencementGraceDays", label: "Days after the start date before non-commencement is raised", min: 0 },
        { kind: "number", name: "acceptanceReturnDays", label: "Days the awardee has to return the instrument", min: 1 },
        {
          kind: "select",
          name: "quotationContractKey",
          label: "A quotation award's contract number",
          placeholder: "Not set",
          options: [
            { value: "INDENT_NUMBER", label: "The indent's own number" },
            { value: "CONTRACT_SERIES", label: "The contract type's series" },
          ],
        },
        { kind: "select", name: "preContractUnitCode", label: "Section that owns the case before award", placeholder: "Not set", options: units },
        { kind: "select", name: "postContractUnitCode", label: "Section that owns it after", placeholder: "Not set", options: units },
        { kind: "text", name: "regulatedActivityLabel", label: "The regulated activity, in the organisation's words", placeholder: "e.g. regulated utility works", hint: "A recipient's copy can depend on it." },
        {
          kind: "select",
          name: "publishAwardedValue",
          label: "Show the awarded value on the public Results page",
          placeholder: "Not set (the value is not shown)",
          options: [
            { value: "YES", label: "Yes, show the awarded value" },
            { value: "NO", label: "No, show the winner but not the value" },
          ],
          hint: "The public sees the winner's name either way. Only a Yes shows the figure.",
        },
        { kind: "select", name: "publishAwardedValueProvenance", label: "Where the publishing choice came from", placeholder: "Not recorded", options: (PROVENANCE as Extract<Field, { kind: "select" }>).options },
        { kind: "select", name: "loaTemplateId", label: "Template: Letter of Acceptance", placeholder: "Not set", options: templates },
        { kind: "select", name: "declarationTemplateId", label: "Template: successful bidder's declaration", placeholder: "Not set", options: templates },
        { kind: "select", name: "coveringMemoTemplateId", label: "Template: indent covering memo", placeholder: "Not set", options: templates },
        { kind: "select", name: "provenance", label: "Where these controls came from", placeholder: "Not recorded", options: (PROVENANCE as Extract<Field, { kind: "select" }>).options },
        NOTES,
      ]}
      values={values}
      action={saveAwardPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label, className: buttonClass(quiet ? "secondary" : "primary", "sm") }}
      size="lg"
    />
  );
}

const recipientFields = (editing: boolean): Field[] => [
  ...code(editing),
  { kind: "select", name: "instrumentKind", label: "Receives a copy of", required: true, placeholder: "Choose", options: INSTRUMENTS },
  { kind: "text", name: "nameEn", label: "Recipient", required: true },
  { kind: "text", name: "nameMs", label: "Recipient (Malay)" },
  { kind: "switch", name: "mandatory", label: "Mandatory: distribution is not complete without this copy" },
  { kind: "switch", name: "onlyWhenRegulated", label: "Only where the works are the regulated activity" },
  PROVENANCE,
  ORDER,
  NOTES,
];

export function AddRecipient() {
  return <RecordEditor title="Add a recipient" description="Who receives a copy of an instrument when it is issued." fields={recipientFields(false)} values={{ mandatory: true }} action={saveRecipient} submitLabel="Add recipient" trigger={{ label: "Add recipient", icon: true }} size="md" />;
}
export function EditRecipient({ id, values, name }: { id: string; values: Values; name: string }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...recipientFields(true)]} values={{ id, ...values }} action={saveRecipient} trigger={edit(name)} size="md" />;
}

const variantFields = (editing: boolean, templates: Option[], types: Option[], bands: Option[]): Field[] => [
  ...code(editing),
  { kind: "text", name: "nameEn", label: "Name", required: true },
  { kind: "select", name: "templateId", label: "Template", required: true, placeholder: "Choose", options: templates },
  { kind: "tokens", name: "contractTypeCodes", label: "Contract types", placeholder: "Any type", options: types, hint: "Empty: any contract type." },
  { kind: "select", name: "termsBandKey", label: "Contract terms band", placeholder: "Any band", options: bands, hint: "The exercise's terms band on the approval matrix in force." },
  {
    kind: "select",
    name: "nonCommencement",
    label: "If work does not commence",
    placeholder: "Not set",
    options: [
      { value: "CANCEL_AND_BLACKLIST", label: "Cancellation, with blacklisting recommended" },
      { value: "WARNING_LETTER", label: "A warning letter only" },
    ],
  },
  PROVENANCE,
  ORDER,
  NOTES,
];

export function AddVariant({ templates, types, bands }: { templates: Option[]; types: Option[]; bands: Option[] }) {
  return <RecordEditor title="Add an appointment-letter variant" description="Picked by the exercise's contract type and terms band. The most specific variant wins; two equally specific are refused." fields={variantFields(false, templates, types, bands)} action={saveVariant} submitLabel="Add variant" trigger={{ label: "Add variant", icon: true }} size="md" />;
}
export function EditVariant({ id, values, name, templates, types, bands }: { id: string; values: Values; name: string; templates: Option[]; types: Option[]; bands: Option[] }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...variantFields(true, templates, types, bands)]} values={{ id, ...values }} action={saveVariant} trigger={edit(name)} size="md" />;
}

const conditionFields = (editing: boolean): Field[] => [...code(editing), { kind: "text", name: "nameEn", label: "Condition", required: true }, { kind: "switch", name: "excludesEotReason", label: "A delay in meeting it gives no extension of time" }, PROVENANCE, ORDER, NOTES];
export function AddConditionKind() {
  return <RecordEditor title="Add a condition precedent" fields={conditionFields(false)} action={saveConditionKind} submitLabel="Add condition" trigger={{ label: "Add condition", icon: true }} size="md" />;
}
export function EditConditionKind({ id, values, name }: { id: string; values: Values; name: string }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...conditionFields(true)]} values={{ id, ...values }} action={saveConditionKind} trigger={edit(name)} size="md" />;
}

const requirementFields = (editing: boolean, types: Option[]): Field[] => [
  ...code(editing),
  { kind: "text", name: "nameEn", label: "Name", required: true },
  {
    kind: "select",
    name: "kind",
    label: "Policy",
    required: true,
    placeholder: "Choose",
    options: [
      { value: "WORKS", label: "Works" },
      { value: "PUBLIC_LIABILITY", label: "Public liability" },
      { value: "WORKMENS_COMPENSATION", label: "Workmen's compensation" },
      { value: "CAR", label: "Contractor's all risks" },
      { value: "EAR", label: "Erection all risks" },
    ],
  },
  { kind: "select", name: "contractTypeCode", label: "For contract type", placeholder: "Every type", options: types, hint: "A type's own row takes the place of the general row of the same policy." },
  { kind: "switch", name: "required", label: "Required" },
  { kind: "text", name: "percent", label: "Percentage of the contract sum", hint: "Workmen's compensation on a percentage basis only." },
  { kind: "number", name: "tailMonths", label: "Runs past completion and defects liability: months", min: 0 },
  { kind: "number", name: "tailDays", label: "…and days", min: 0 },
  PROVENANCE,
  ORDER,
  NOTES,
];
export function AddRequirement({ types }: { types: Option[] }) {
  return <RecordEditor title="Add an insurance requirement" fields={requirementFields(false, types)} values={{ required: true }} action={saveRequirement} submitLabel="Add requirement" trigger={{ label: "Add requirement", icon: true }} size="md" />;
}
export function EditRequirement({ id, values, name, types }: { id: string; values: Values; name: string; types: Option[] }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...requirementFields(true, types)]} values={{ id, ...values }} action={saveRequirement} trigger={edit(name)} size="md" />;
}

const bandFields = (editing: boolean): Field[] => [
  ...code(editing),
  { kind: "money", name: "minValue", label: "Contract price above", hint: "Empty: from nothing. The band holds prices above this figure." },
  { kind: "money", name: "maxValue", label: "…and up to", hint: "Empty: no upper edge. The band holds this figure itself." },
  { kind: "money", name: "limitAmount", label: "Public liability limit", required: true },
  PROVENANCE,
  ORDER,
  NOTES,
];
export function AddBand() {
  return <RecordEditor title="Add a liability band" description="Above the lower figure, up to and including the upper. A band that would overlap another is refused." fields={bandFields(false)} action={saveBand} submitLabel="Add band" trigger={{ label: "Add band", icon: true }} size="md" />;
}
export function EditBand({ id, values, name }: { id: string; values: Values; name: string }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...bandFields(true)]} values={{ id, ...values }} action={saveBand} trigger={edit(name)} size="md" />;
}

const issuerFields = (editing: boolean): Field[] => [
  ...code(editing),
  { kind: "text", name: "name", label: "Name", required: true },
  {
    kind: "select",
    name: "kind",
    label: "Kind",
    required: true,
    placeholder: "Choose",
    options: [
      { value: "BANK", label: "Bank" },
      { value: "INSURER", label: "Insurer" },
      { value: "TAKAFUL", label: "Takaful operator" },
    ],
  },
  { kind: "text", name: "listSource", label: "The approved list it is on" },
  { kind: "date", name: "listAsAt", label: "List as at" },
  PROVENANCE,
  ORDER,
  NOTES,
];
export function AddIssuer() {
  return <RecordEditor title="Add an approved issuer" fields={issuerFields(false)} action={saveIssuer} submitLabel="Add issuer" trigger={{ label: "Add issuer", icon: true }} size="md" />;
}
export function EditIssuer({ id, values, name }: { id: string; values: Values; name: string }) {
  return <RecordEditor title={`Edit ${name}`} fields={[hidden("id"), ...issuerFields(true)]} values={{ id, ...values }} action={saveIssuer} trigger={edit(name)} size="md" />;
}

export function RetireRow({ entity, id, label, today }: { entity: string; id: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="It stops being offered from the day given. Awards already made under it keep showing it."
      fields={[hidden("entity"), hidden("id"), { kind: "date", name: "retiredOn", label: "Retired from", required: true }]}
      values={{ entity, id, retiredOn: today }}
      action={retireRow}
      submitLabel="Retire"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{ label: "Retire", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}
