import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { CHECK_KIND_WORDS, KIND_WORDS, SUBJECT_WORDS } from "@/lib/certificate/labels";
import { CERTIFICATE_KINDS, ROUTING_CHECK_KINDS, ROUTING_SUBJECTS } from "@/lib/certificate/types";

import { removeCheckDef, removeTarget, retireRoutingType, saveCheckDef, saveRoutingType, saveTarget } from "./actions";

/**
 * Routing sheet configuration drawers (6.14 increment 1). No field carries a default: which side of a band's
 * edge a value exactly on it falls is the customer's to say (ADR 0024), and every target, check and office is
 * theirs.
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
    { value: "STATED", label: "Stated — printed on the sheet or in a governing document" },
    { value: "OBSERVED", label: "Observed — seen in practice" },
    { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
  ],
};

function typeFields(editing: boolean, templates: Option[]): Field[] {
  return [
    { kind: "hidden", name: "id" },
    ...(editing ? [] : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Small letters, digits and underscores. Set once." }] as Field[])),
    { kind: "text", name: "labelEn", label: "Name, as printed", required: true },
    { kind: "text", name: "labelMs", label: "Name (Malay)" },
    { kind: "select", name: "subject", label: "Drawn over", required: true, placeholder: "Choose", options: ROUTING_SUBJECTS.map((s) => ({ value: s, label: SUBJECT_WORDS[s].en })) },
    { kind: "select", name: "certificateKind", label: "For the certificate", placeholder: "Any kind", options: CERTIFICATE_KINDS.map((k) => ({ value: k, label: KIND_WORDS[k].en })) },
    { kind: "select", name: "templateId", label: "The printed sheet", placeholder: "None chosen", options: templates },
    { kind: "select", name: "upperEdgeInclusive", label: "A percentage exactly on a band's edge falls in", placeholder: "Not decided: such a value has no target", options: [{ value: "upper", label: "The band it closes: \"up to 20%\" includes 20.00%" }, { value: "lower", label: "The band it opens: \"20% and above\" includes 20.00%" }], hint: "Only matters where the targets are banded by percentage." },
    PROVENANCE,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddRoutingType({ templates }: { templates: Option[] }) {
  return (
    <RecordEditor
      title="Add a routing sheet type"
      description="One kind of routing sheet. A sheet starts on a certificate when it is sent for routing, or on an award, and freezes the type as it stands then."
      fields={typeFields(false, templates)}
      showWhen={{ certificateKind: { name: "subject", in: ["CERTIFICATE"] } }}
      action={saveRoutingType}
      submitLabel="Add type"
      trigger={{ label: "Add type", icon: true }}
    />
  );
}

export function EditRoutingType({ templates, row }: { templates: Option[]; row: { id: string; labelEn: string; labelMs: string | null; subject: string; certificateKind: string | null; templateId: string | null; upperEdgeInclusive: boolean | null; provenance: string; sortOrder: number; notes: string } }) {
  return (
    <RecordEditor
      title={`Edit ${row.labelEn}`}
      description="A sheet already started keeps the type as it was frozen."
      fields={typeFields(true, templates)}
      values={{ id: row.id, labelEn: row.labelEn, labelMs: row.labelMs, subject: row.subject, certificateKind: row.certificateKind, templateId: row.templateId, upperEdgeInclusive: row.upperEdgeInclusive == null ? null : row.upperEdgeInclusive ? "upper" : "lower", provenance: row.provenance, sortOrder: String(row.sortOrder), notes: row.notes }}
      showWhen={{ certificateKind: { name: "subject", in: ["CERTIFICATE"] } }}
      action={saveRoutingType}
      trigger={{ label: `Edit ${row.labelEn}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RetireRoutingType({ id, label, blocker }: { id: string; label: string; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="From today no new sheet starts on it. Sheets already started keep it as frozen."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is retired" }}
      action={retireRoutingType}
      submitLabel="Retire"
      cancelLabel="Keep it"
      submitBlock={blocker}
      trigger={{ label: "Retire", className: ghost, ariaLabel: `Retire ${label}` }}
    />
  );
}

function checkFields(offices: Option[]): Field[] {
  return [
    { kind: "hidden", name: "typeId" },
    { kind: "hidden", name: "id" },
    { kind: "number", name: "order", label: "Place on the sheet", required: true, min: 1 },
    { kind: "select", name: "kind", label: "Kind of check", required: true, placeholder: "Choose", options: ROUTING_CHECK_KINDS.map((k) => ({ value: k, label: CHECK_KIND_WORDS[k].en })) },
    { kind: "text", name: "labelEn", label: "Label, as printed", required: true },
    { kind: "text", name: "labelMs", label: "Label (Malay)" },
    { kind: "select", name: "officeCode", label: "The office that records it", placeholder: "Any officer (shown so)", options: offices },
    { kind: "number", name: "targetDays", label: "Printed days for this stage", min: 1, hint: "Where the sheet prints a stage's days. With every stage's days set, their sum is shown beside the printed total." },
  ];
}

export function AddCheck({ typeId, offices }: { typeId: string; offices: Option[] }) {
  return <RecordEditor title="Add a check" description="An internal step of the sheet before the approval matrix's own (checked, verified, endorsed)." fields={checkFields(offices)} values={{ typeId }} action={saveCheckDef} submitLabel="Add check" trigger={{ label: "Add check", icon: true }} />;
}

export function EditCheck({ typeId, offices, row }: { typeId: string; offices: Option[]; row: { id: string; order: number; kind: string; labelEn: string; labelMs: string | null; officeCode: string | null; targetDays: number | null } }) {
  return (
    <RecordEditor
      title={`Edit ${row.labelEn}`}
      fields={checkFields(offices)}
      values={{ typeId, id: row.id, order: String(row.order), kind: row.kind, labelEn: row.labelEn, labelMs: row.labelMs, officeCode: row.officeCode, targetDays: row.targetDays == null ? null : String(row.targetDays) }}
      action={saveCheckDef}
      trigger={{ label: `Edit ${row.labelEn}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemoveCheck({ typeId, id, label }: { typeId: string; id: string; label: string }) {
  return <RecordEditor title={`Take ${label} off the sheet`} description="Sheets already started keep it." fields={[{ kind: "hidden", name: "typeId" }, { kind: "hidden", name: "id" }]} values={{ typeId, id }} destructive={{ reasonLabel: "Why it comes off" }} action={removeCheckDef} submitLabel="Take it off" cancelLabel="Keep it" trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }} />;
}

function targetFields(): Field[] {
  return [
    { kind: "hidden", name: "typeId" },
    { kind: "hidden", name: "id" },
    { kind: "number", name: "targetDays", label: "Target, in calendar days", required: true, min: 1, hint: "Weeks as days: 2 weeks is 14." },
    { kind: "text", name: "pctMin", label: "Band from (%)", hint: "Leave both edges empty for a target that applies whatever the percentage." },
    { kind: "text", name: "pctMax", label: "Band to (%)" },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddTarget({ typeId }: { typeId: string }) {
  return <RecordEditor title="Add a target" description="The target the elapsed days are judged against, for every percentage or for one band." fields={targetFields()} values={{ typeId }} action={saveTarget} submitLabel="Add target" trigger={{ label: "Add target", icon: true }} />;
}

export function EditTarget({ typeId, row }: { typeId: string; row: { id: string; pctMin: string | null; pctMax: string | null; targetDays: number; provenance: string; notes: string } }) {
  return <RecordEditor title="Edit the target" fields={targetFields()} values={{ typeId, id: row.id, pctMin: row.pctMin, pctMax: row.pctMax, targetDays: String(row.targetDays), provenance: row.provenance, notes: row.notes }} action={saveTarget} trigger={{ label: "Edit the target", iconOnly: <PencilIcon size={15} /> }} />;
}

export function RemoveTarget({ typeId, id }: { typeId: string; id: string }) {
  return <RecordEditor title="Take the target off" description="Sheets already started keep it." fields={[{ kind: "hidden", name: "typeId" }, { kind: "hidden", name: "id" }]} values={{ typeId, id }} destructive={{ reasonLabel: "Why it comes off" }} action={removeTarget} submitLabel="Take it off" cancelLabel="Keep it" trigger={{ label: "Remove", className: ghost, ariaLabel: "Remove the target" }} />;
}
