import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { saveBasisBqRule, saveBqTemplate, saveBqTemplateSection, saveMethodEstimateRule, savePersonQualification, saveQualification, saveScopePolicy, saveSpecPanelColumn } from "./actions";

/**
 * Configuration › Scope and estimate drawers. No field carries a default: an unset value
 * is not set, and the screen says what that stops. Where a value is set it says where it
 * came from.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");
const PROVENANCE_OPTIONS: Option[] = [
  { value: "STATED", label: "Stated: written in a governing document" },
  { value: "OBSERVED", label: "Observed: seen in practice" },
  { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
];
const provenance = (name: string, label = "Where this came from", required = false): Field => ({ kind: "select", name, label, required, placeholder: required ? "Choose" : "Not set", options: PROVENANCE_OPTIONS });

/// One drawer for the whole policy: it saves every field, so a field left alone is saved as it was.
export function EditScopePolicy({ values, qualifications, offices, lists }: { values: Record<string, string>; qualifications: Option[]; offices: Option[]; lists: Option[] }) {
  return (
    <RecordEditor
      title="Edit the scope and estimate policy"
      description="Every value is the organisation's own choice. Leave one empty to leave it unset; a value set says where it came from."
      columns={2}
      fields={[
        { kind: "text", name: "measurementStandardLabel", label: "Measurement standard a bill follows", hint: "As the organisation names it." },
        provenance("measurementStandardProvenance"),
        { kind: "select", name: "bqPreparerQualificationCode", label: "Qualification a bill's preparer holds", placeholder: "Not set", options: qualifications },
        { kind: "note", text: "A bill cannot be finalised until the standard and the qualification are set." },
        { kind: "number", name: "estimateLeadDays", label: "Estimate made at least this many days before closing", min: 0 },
        provenance("estimateLeadProvenance"),
        { kind: "select", name: "estimateCustodianRoleCode", label: "Office holding the estimate's copies", placeholder: "Not set", options: offices },
        { kind: "select", name: "estimateAuditRoleCode", label: "Office auditing the estimate", placeholder: "Not set", options: offices },
        { kind: "select", name: "estimateOverrideRoleCode", label: "Office that may accept a late estimate", placeholder: "Not set: none may", options: offices, hint: "Left unset, no late estimate is accepted." },
        { kind: "number", name: "panelSignatoryLimit", label: "Most verifiers on a specification panel", min: 1, hint: "Left empty, the number of verifiers is not checked." },
        provenance("panelSignatoryLimitProvenance"),
        { kind: "select", name: "panelContractKindTaxonomyCode", label: "List of contract kinds", placeholder: "Not set", options: lists },
        { kind: "select", name: "panelProjectStatusTaxonomyCode", label: "List of project statuses", placeholder: "Not set", options: lists },
        { kind: "text", name: "benchmarkLabelEn", label: "Opening benchmark row is called (English)" },
        { kind: "text", name: "benchmarkLabelMs", label: "Opening benchmark row is called (Malay)" },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={saveScopePolicy}
      submitLabel="Save the policy"
      trigger={{ label: "Edit the policy", className: buttonClass("primary", "sm") }}
      size="xl"
    />
  );
}

const TRI: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function EditMethodRule({ id, name, raw, provenance: p }: { id: string; name: string; raw: string; provenance: string }) {
  return (
    <RecordEditor
      title={`Does ${name} need a company estimate?`}
      description="Where it does, the documents cannot go for approval until the estimate is lodged. Not set blocks that check, naming this setting."
      fields={[
        hidden("id"),
        { kind: "select", name: "requiresCompanyEstimate", label: "Needs a company estimate", required: true, placeholder: "Choose", placeholderDisabled: true, options: [...TRI, { value: "unset", label: "Not set" }] },
        provenance("requiresCompanyEstimateProvenance", "Where this came from", false),
        { kind: "note", text: "Say where the answer came from whenever it is Yes or No." },
      ]}
      values={{ id, requiresCompanyEstimate: raw, requiresCompanyEstimateProvenance: p }}
      action={saveMethodEstimateRule}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the estimate rule for ${name}` }}
      size="md"
    />
  );
}

export function EditBasisRule({ id, name, raw, provenance: p }: { id: string; name: string; raw: string; provenance: string }) {
  return (
    <RecordEditor
      title={`Is ${name} let on a bill of quantities?`}
      description="Where it is, a finalised bill must go with the documents. Not set blocks that check, naming this setting."
      fields={[
        hidden("id"),
        { kind: "select", name: "requiresBq", label: "Let on a bill of quantities", required: true, placeholder: "Choose", placeholderDisabled: true, options: [...TRI, { value: "unset", label: "Not set" }] },
        provenance("requiresBqProvenance", "Where this came from", false),
        { kind: "note", text: "Say where the answer came from whenever it is Yes or No." },
      ]}
      values={{ id, requiresBq: raw, requiresBqProvenance: p }}
      action={saveBasisBqRule}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the bill rule for ${name}` }}
      size="md"
    />
  );
}

export function QualificationDrawer({ q }: { q?: { id: string; name: string; nameMs: string; governingSource: string; rawProvenance: string; retiredOn: string | null } }) {
  return (
    <RecordEditor
      title={q ? `Edit ${q.name}` : "Add a qualification"}
      fields={[
        hidden("id"),
        ...(q ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A short key, not shown to officers. It cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name in Malay" },
        { kind: "text", name: "governingSource", label: "Where it is required", hint: "The document that asks for it." },
        provenance("provenance", "Where this came from", true),
        ...(q ? [{ kind: "date", name: "retiredOn", label: "Retired from", hint: "From this day nobody counts as holding it." } as Field] : []),
      ]}
      values={{ id: q?.id ?? "", nameEn: q?.name ?? "", nameMs: q?.nameMs ?? "", governingSource: q?.governingSource ?? "", provenance: q?.rawProvenance ?? "", retiredOn: q?.retiredOn ?? "" }}
      action={saveQualification}
      submitLabel={q ? "Save" : "Add the qualification"}
      trigger={q ? { label: "Edit", className: ghost, ariaLabel: `Edit ${q.name}` } : { label: "Add a qualification", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function HoldingDrawer({ qualificationCode, qualificationName, people, holding }: { qualificationCode: string; qualificationName: string; people: Option[]; holding?: { id: string; personId: string; validFrom: string; validTo: string; evidenceNote: string; person: string } }) {
  return (
    <RecordEditor
      title={holding ? `Edit ${holding.person}'s ${qualificationName}` : `Record who holds ${qualificationName}`}
      description="Held from its first day to its last, both counted. A bill's preparer is judged on the day the bill is finalised."
      fields={[
        hidden("id"),
        hidden("qualificationCode"),
        { kind: "select", name: "personId", label: "Person", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "validFrom", label: "Held from", required: true },
        { kind: "date", name: "validTo", label: "Held to", hint: "Empty while it has no end." },
        { kind: "textarea", name: "evidenceNote", label: "Evidence", hint: "The certificate or register entry seen." },
      ]}
      values={{ id: holding?.id ?? "", qualificationCode, personId: holding?.personId ?? "", validFrom: holding?.validFrom ?? "", validTo: holding?.validTo ?? "", evidenceNote: holding?.evidenceNote ?? "" }}
      action={savePersonQualification}
      submitLabel={holding ? "Save" : "Record the holder"}
      trigger={holding ? { label: "Edit", className: ghost, ariaLabel: `Edit ${holding.person}'s holding` } : { label: "Record a holder", icon: true, className: ghost }}
      size="md"
    />
  );
}

const DELIVERABLES: Option[] = [
  { value: "GOODS_DELIVERED", label: "Goods delivered" },
  { value: "MEASURED_CONSTRUCTION", label: "Measured construction" },
  { value: "TERM_PERFORMANCE", label: "Performance over a term" },
];

export function TemplateDrawer({ t }: { t?: { id: string; name: string; nameMs: string; deliverableKind: string; rawProvenance: string; retiredOn: string | null } }) {
  return (
    <RecordEditor
      title={t ? `Edit ${t.name}` : "Add a bill template"}
      description="A template brings its section headings to a new bill, and no lines."
      fields={[
        hidden("id"),
        ...(t ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A short key, not shown to officers. It cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name in Malay" },
        { kind: "select", name: "deliverableKind", label: "What the contract delivers", placeholder: "Any", options: DELIVERABLES },
        provenance("provenance", "Where this came from", true),
        ...(t ? [{ kind: "date", name: "retiredOn", label: "Retired from" } as Field] : []),
      ]}
      values={{ id: t?.id ?? "", nameEn: t?.name ?? "", nameMs: t?.nameMs ?? "", deliverableKind: t?.deliverableKind ?? "", provenance: t?.rawProvenance ?? "", retiredOn: t?.retiredOn ?? "" }}
      action={saveBqTemplate}
      submitLabel={t ? "Save" : "Add the template"}
      trigger={t ? { label: "Edit", className: ghost, ariaLabel: `Edit ${t.name}` } : { label: "Add a template", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function TemplateSectionDrawer({ templateId, templateName, section }: { templateId: string; templateName: string; section?: { id: string; number: string; title: string; titleMs: string; sortOrder: string } }) {
  return (
    <RecordEditor
      title={section ? `Edit section ${section.number} of ${templateName}` : `Add a section to ${templateName}`}
      fields={[
        hidden("id"),
        hidden("templateId"),
        { kind: "text", name: "number", label: "Number", required: true },
        { kind: "text", name: "titleEn", label: "Heading", required: true },
        { kind: "text", name: "titleMs", label: "Heading in Malay" },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ id: section?.id ?? "", templateId, number: section?.number ?? "", titleEn: section?.title ?? "", titleMs: section?.titleMs ?? "", sortOrder: section?.sortOrder ?? "" }}
      action={saveBqTemplateSection}
      submitLabel={section ? "Save" : "Add the section"}
      trigger={section ? { label: "Edit", className: ghost, ariaLabel: `Edit section ${section.number} of ${templateName}` } : { label: "Add a section", icon: true, className: ghost, ariaLabel: `Add a section to ${templateName}` }}
      size="md"
    />
  );
}

export function ColumnDrawer({ units, c }: { units: Option[]; c?: { id: string; label: string; labelMs: string; orgUnitCode: string; sortOrder: string; rawProvenance: string; retiredOn: string | null } }) {
  return (
    <RecordEditor
      title={c ? `Edit ${c.label}` : "Add a verification column"}
      description="A column of the signed panel form, verified by a named person."
      fields={[
        hidden("id"),
        ...(c ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A short key, not shown to officers. It cannot be changed." } as Field]),
        { kind: "text", name: "labelEn", label: "Heading", required: true },
        { kind: "text", name: "labelMs", label: "Heading in Malay" },
        { kind: "select", name: "orgUnitCode", label: "Unit whose officer verifies", placeholder: "Not tied to a unit", options: units },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        provenance("provenance", "Where this came from", true),
        ...(c ? [{ kind: "date", name: "retiredOn", label: "Retired from" } as Field] : []),
      ]}
      values={{ id: c?.id ?? "", labelEn: c?.label ?? "", labelMs: c?.labelMs ?? "", orgUnitCode: c?.orgUnitCode ?? "", sortOrder: c?.sortOrder ?? "", provenance: c?.rawProvenance ?? "", retiredOn: c?.retiredOn ?? "" }}
      action={saveSpecPanelColumn}
      submitLabel={c ? "Save" : "Add the column"}
      trigger={c ? { label: "Edit", className: ghost, ariaLabel: `Edit ${c.label}` } : { label: "Add a column", icon: true, className: secondary }}
      size="md"
    />
  );
}
