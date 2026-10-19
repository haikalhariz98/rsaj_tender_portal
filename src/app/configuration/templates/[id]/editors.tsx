import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { BLOCK_KIND_WORDS, CONDITION_WORDS, OFFICE_RULE_WORDS } from "@/lib/certificate/labels";
import { DISTRIBUTION_CONDITIONS, SIGNATURE_BLOCK_KINDS, SIGNATURE_OFFICE_RULES } from "@/lib/certificate/types";

import { removeDistributionRow, removePrintedField, removeSignatureBlock, saveDistributionRow, savePageCount, savePrintedField, saveSignatureBlock } from "../form-actions";

/**
 * A form's signature blocks and distribution list (6.14 increment 1). No field carries a default: whether a
 * delegate may sign, whether a copy is mandatory, whether its acknowledgement is asked for and who receives
 * the original are each the customer's to say.
 */

type Option = { value: string; label: string };
const ghost = buttonClass("ghost", "sm");
const PROVENANCE: Field = {
  kind: "select",
  name: "provenance",
  label: "Where it came from",
  required: true,
  placeholder: "Choose",
  options: [
    { value: "STATED", label: "Stated — printed on the controlled form or in a governing document" },
    { value: "OBSERVED", label: "Observed — seen in practice" },
    { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
  ],
};
const YES_NO = (yes: string, no: string) => [
  { value: "yes", label: yes },
  { value: "no", label: no },
];

function blockFields(offices: Option[]): Field[] {
  return [
    { kind: "hidden", name: "templateId" },
    { kind: "hidden", name: "id" },
    { kind: "number", name: "blockOrder", label: "Place in the printed order", required: true, min: 1, hint: "1 signs first. A later block is refused until every earlier one is recorded." },
    { kind: "text", name: "labelEn", label: "Label, as printed", required: true },
    { kind: "text", name: "labelMs", label: "Label (Malay)" },
    { kind: "select", name: "blockKind", label: "What the block is for", required: true, placeholder: "Choose", options: SIGNATURE_BLOCK_KINDS.map((k) => ({ value: k, label: BLOCK_KIND_WORDS[k].en })) },
    { kind: "select", name: "officeRule", label: "Who signs it", required: true, placeholder: "Choose", options: SIGNATURE_OFFICE_RULES.map((k) => ({ value: k, label: OFFICE_RULE_WORDS[k].en })), hint: "The Superintending Officer's blocks are resolved from the contract's supervision, which the post-award module records." },
    { kind: "select", name: "officeCode", label: "The office", placeholder: "Choose", options: offices },
    { kind: "select", name: "delegable", label: "May a delegate of the office sign it?", placeholder: "Not decided: nobody signs on it until it is", options: YES_NO("Yes: a delegate of the whole office may sign", "No: only the office itself") },
    { kind: "switch", name: "datesCertificate", label: "This block's act dates the certificate" },
    { kind: "switch", name: "carriesDecision", label: "Carries a supported or not-supported answer" },
    { kind: "switch", name: "refusalAllowed", label: "The contractor may refuse to sign, and the refusal is recorded" },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const blockShow = { officeCode: { name: "officeRule", in: ["NAMED_OFFICE"] }, refusalAllowed: { name: "officeRule", in: ["CONTRACTOR"] } };

export function AddBlock({ templateId, offices }: { templateId: string; offices: Option[] }) {
  return (
    <RecordEditor
      title="Add a signature block"
      description="A block in printed order. Signing certificates keep the pinned form."
      fields={blockFields(offices)}
      values={{ templateId }}
      showWhen={blockShow}
      action={saveSignatureBlock}
      submitLabel="Add block"
      trigger={{ label: "Add block", icon: true }}
    />
  );
}

export function EditBlock({ templateId, offices, row }: { templateId: string; offices: Option[]; row: { id: string; blockOrder: number; labelEn: string; labelMs: string | null; blockKind: string; officeRule: string; officeCode: string | null; delegable: boolean | null; datesCertificate: boolean; carriesDecision: boolean; refusalAllowed: boolean; provenance: string; notes: string } }) {
  return (
    <RecordEditor
      title={`Edit ${row.labelEn}`}
      fields={blockFields(offices)}
      values={{ templateId, id: row.id, blockOrder: String(row.blockOrder), labelEn: row.labelEn, labelMs: row.labelMs, blockKind: row.blockKind, officeRule: row.officeRule, officeCode: row.officeCode, delegable: row.delegable == null ? null : row.delegable ? "yes" : "no", datesCertificate: row.datesCertificate, carriesDecision: row.carriesDecision, refusalAllowed: row.refusalAllowed, provenance: row.provenance, notes: row.notes }}
      showWhen={blockShow}
      action={saveSignatureBlock}
      trigger={{ label: `Edit ${row.labelEn}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemoveBlock({ templateId, id, label }: { templateId: string; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Take ${label} off the form`}
      description="Pinned certificates keep it. New ones sign without it."
      fields={[{ kind: "hidden", name: "templateId" }, { kind: "hidden", name: "id" }]}
      values={{ templateId, id }}
      destructive={{ reasonLabel: "Why it comes off" }}
      action={removeSignatureBlock}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}

function rowFields(): Field[] {
  return [
    { kind: "hidden", name: "templateId" },
    { kind: "hidden", name: "id" },
    { kind: "text", name: "recipientCode", label: "Code", required: true, mono: true, hint: "Small letters, digits and underscores. Kept on each copy made from this row." },
    { kind: "text", name: "labelEn", label: "Recipient, as the form addresses them", required: true },
    { kind: "text", name: "labelMs", label: "Recipient (Malay)" },
    { kind: "select", name: "condition", label: "Sent", required: true, placeholder: "Choose", options: DISTRIBUTION_CONDITIONS.map((c) => ({ value: c, label: CONDITION_WORDS[c].en })) },
    { kind: "select", name: "mandatory", label: "Mandatory?", required: true, placeholder: "Choose: there is no default", options: YES_NO("Yes: the certificate is not distributed until it goes", "No") },
    { kind: "select", name: "ackRequired", label: "Acknowledgement asked for?", required: true, placeholder: "Choose: there is no default", options: YES_NO("Yes", "No") },
    { kind: "select", name: "isOriginal", label: "Receives the original?", required: true, placeholder: "Choose: there is no default", options: YES_NO("Yes: the original", "No: a copy") },
    { kind: "number", name: "sortOrder", label: "Order on the list", min: 0 },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes", hint: "Where the SOP's list and the printed form's differ, say which this follows." },
  ];
}

export function AddRecipient({ templateId }: { templateId: string }) {
  return (
    <RecordEditor title="Add a recipient" description="A row of the distribution list. Copies follow the list pinned at issue." fields={rowFields()} values={{ templateId }} action={saveDistributionRow} submitLabel="Add recipient" trigger={{ label: "Add recipient", icon: true }} />
  );
}

export function EditRecipient({ templateId, row }: { templateId: string; row: { id: string; recipientCode: string; labelEn: string; labelMs: string | null; condition: string; mandatory: boolean; ackRequired: boolean; isOriginal: boolean; sortOrder: number; provenance: string; notes: string } }) {
  const yn = (b: boolean) => (b ? "yes" : "no");
  return (
    <RecordEditor
      title={`Edit ${row.labelEn}`}
      fields={rowFields()}
      values={{ templateId, id: row.id, recipientCode: row.recipientCode, labelEn: row.labelEn, labelMs: row.labelMs, condition: row.condition, mandatory: yn(row.mandatory), ackRequired: yn(row.ackRequired), isOriginal: yn(row.isOriginal), sortOrder: String(row.sortOrder), provenance: row.provenance, notes: row.notes }}
      action={saveDistributionRow}
      trigger={{ label: `Edit ${row.labelEn}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemoveRecipient({ templateId, id, label }: { templateId: string; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Take ${label} off the list`}
      description="Certificates already pinned keep it; certificates pinned from now on are not sent to it."
      fields={[{ kind: "hidden", name: "templateId" }, { kind: "hidden", name: "id" }]}
      values={{ templateId, id }}
      destructive={{ reasonLabel: "Why it comes off" }}
      action={removeDistributionRow}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}

// ------------------------------------------------------------------ 6.14 increment 2: the printed form

export function EditPageCount({ templateId, pageCount }: { templateId: string; pageCount: number | null }) {
  return (
    <RecordEditor
      title="Printed pages"
      description="Pages the printed form runs to. Blank: not recorded, and the certificate says so."
      fields={[{ kind: "hidden", name: "templateId" }, { kind: "number", name: "pageCount", label: "Pages", min: 1, placeholder: "Not recorded" }]}
      values={{ templateId, pageCount: pageCount == null ? null : String(pageCount) }}
      action={savePageCount}
      trigger={{ label: "Edit pages", className: ghost }}
    />
  );
}

function printedFields(values: Option[]): Field[] {
  return [
    { kind: "hidden", name: "templateId" },
    { kind: "hidden", name: "id" },
    { kind: "text", name: "key", label: "Code", required: true, mono: true, hint: "Small letters, digits and underscores, unique on the form." },
    { kind: "text", name: "labelEn", label: "Label, as printed", required: true, hint: "The form's own wording for the field." },
    { kind: "text", name: "labelMs", label: "Label (Malay), as printed" },
    { kind: "select", name: "filled", label: "How it is filled", required: true, placeholder: "Choose", options: [{ value: "PORTAL", label: "By the portal, from the certificate or its routing sheet (never typed in)" }, { value: "HAND", label: "By hand on the paper (left blank): not for a value the portal holds, which it fills" }] },
    { kind: "select", name: "computedKey", label: "The value it prints", placeholder: "Choose", options: values, hint: "A routing sheet's value prints only on a certificate with a routing type: on one without, the first signature is refused rather than printing blank." },
    { kind: "number", name: "sortOrder", label: "Place on the form", min: 0 },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const printedShow = { computedKey: { name: "filled", in: ["PORTAL"] } };

export function AddPrintedField({ templateId, values }: { templateId: string; values: Option[] }) {
  return (
    <RecordEditor
      title="Add a printed field"
      description="A field of the printed form. Signing certificates keep the pinned form."
      fields={printedFields(values)}
      values={{ templateId }}
      showWhen={printedShow}
      action={savePrintedField}
      submitLabel="Add field"
      trigger={{ label: "Add field", icon: true }}
    />
  );
}

export function EditPrintedField({ templateId, values, row }: { templateId: string; values: Option[]; row: { id: string; key: string; labelEn: string; labelMs: string | null; bound: boolean; computedKey: string | null; sortOrder: number; provenance: string; notes: string } }) {
  return (
    <RecordEditor
      title={`Edit ${row.labelEn}`}
      fields={printedFields(values)}
      values={{ templateId, id: row.id, key: row.key, labelEn: row.labelEn, labelMs: row.labelMs, filled: row.bound ? "PORTAL" : "HAND", computedKey: row.computedKey, sortOrder: String(row.sortOrder), provenance: row.provenance, notes: row.notes }}
      showWhen={printedShow}
      action={savePrintedField}
      trigger={{ label: `Edit ${row.labelEn}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemovePrintedField({ templateId, id, label }: { templateId: string; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Take ${label} off the form`}
      description="Certificates already pinned to the form keep it."
      fields={[{ kind: "hidden", name: "templateId" }, { kind: "hidden", name: "id" }]}
      values={{ templateId, id }}
      destructive={{ reasonLabel: "Why it comes off" }}
      action={removePrintedField}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}
