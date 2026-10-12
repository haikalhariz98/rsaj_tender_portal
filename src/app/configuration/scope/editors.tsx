import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { adoptRateDraft, discardRateIssue, issueRateSchedule, removeRateItem, saveBasisBqRule, saveBqTemplate, saveBqTemplateSection, saveMethodEstimateRule, saveMethodScopeRule, savePersonQualification, saveQualification, saveRateItem, saveScopePolicy, saveSpecPanelColumn, startRateIssue } from "./actions";

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
        { kind: "select", name: "specPanelUsed", label: "Specification panel used", placeholder: "Not set", options: [{ value: "yes", label: "Used" }, { value: "no", label: "Not used" }], hint: "Each exercise takes this when it is made and keeps it. Not used removes the panel and its signed form from the exercise and from submission." },
        { kind: "select", name: "onScreenBillUsed", label: "On-screen bill used", placeholder: "Not set", options: [{ value: "yes", label: "Built on screen" }, { value: "no", label: "An uploaded Excel file" }], hint: "Each exercise takes this when it is made and keeps it. An uploaded file is a document line under Tender documents, with its template; its prime cost and provisional sums are entered at the contract baseline." },
        { kind: "text", name: "measurementStandardLabel", label: "Measurement standard a bill follows", hint: "As the organisation names it." },
        provenance("measurementStandardProvenance"),
        { kind: "select", name: "bqPreparerQualificationCode", label: "Qualification a bill's preparer holds", placeholder: "Not set", options: qualifications },
        { kind: "note", text: "A bill cannot be finalised until the standard and the qualification are set." },
        { kind: "number", name: "estimateLeadDays", label: "Estimate made at least this many days before closing", min: 0 },
        provenance("estimateLeadProvenance"),
        { kind: "select", name: "estimateCustodianRoleCode", label: "Office holding the estimate's copies", placeholder: "Not set", options: offices, hint: "With the estimate's preparer and the auditing office, this office reads the figure once the opening has disclosed it. Held for a department, it counts for that department's estimates only. While either office is unset, nobody reads it." },
        { kind: "select", name: "estimateAuditRoleCode", label: "Office auditing the estimate", placeholder: "Not set", options: offices, hint: "Reads the disclosed figure, as the holding office does." },
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

// ------------------------------------------------------------------ increment 2

/// OD-9: whether a method's scope is approved by a committee, and which. Not set blocks, naming this setting.
export function EditMethodScopeRule({ id, name, raw, committees, acts }: { id: string; name: string; raw: { scopeApprovalRequired: string; scopeApprovalProvenance: string; scopeCommitteeCode: string; scopeAct: string; scopeActProvenance: string }; committees: Option[]; acts: Option[] }) {
  return (
    <RecordEditor
      title={`Is the scope approved by a committee under ${name}?`}
      description="Where it is, the finalised bill is tabled at a sitting of that committee and carried before the documents go for approval. Not set blocks that check, naming this setting; it is never read as No."
      fields={[
        hidden("id"),
        { kind: "select", name: "scopeApprovalRequired", label: "Scope approved by a committee", required: true, placeholder: "Choose", placeholderDisabled: true, options: [...TRI, { value: "unset", label: "Not set" }] },
        { kind: "select", name: "scopeCommitteeCode", label: "The committee that approves it", placeholder: "Not set", options: committees, hint: "Left empty with Yes, the check reads “Committee not set” and blocks." },
        provenance("scopeApprovalProvenance", "Where this came from", false),
        { kind: "note", text: "Say where the answer came from whenever it is Yes or No." },
        { kind: "select", name: "scopeAct", label: "The committee's act on the scope", placeholder: "Not set", options: acts, hint: "Tabling writes this act, and only a matter carried under it approves the scope. Left empty with Yes, it reads “Act not set” and blocks tabling." },
        provenance("scopeActProvenance", "Where the act came from", false),
      ]}
      values={{ id, ...raw }}
      showWhen={{ scopeCommitteeCode: { name: "scopeApprovalRequired", in: ["yes"] }, scopeAct: { name: "scopeApprovalRequired", in: ["yes"] }, scopeActProvenance: { name: "scopeApprovalRequired", in: ["yes"] } }}
      action={saveMethodScopeRule}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the scope approval rule for ${name}` }}
      size="md"
    />
  );
}

/// FR-EST-004: a new schedule, or the next issue of one (its items copied from the latest issue).
export function StartRateIssueDrawer({ label }: { label?: string }) {
  return (
    <RecordEditor
      title={label ? `Start the next issue of ${label}` : "Add a schedule of rates"}
      description={label ? "A draft, with the latest issue's items copied in to edit. It takes effect only when it is issued." : "A draft first issue. Add its items, then issue it with the day it takes effect from."}
      fields={[
        ...(label ? [hidden("label")] : [{ kind: "text", name: "label", label: "Schedule", required: true, hint: "As the organisation names it." } as Field]),
        provenance("provenance", "Where its rates come from", true),
        { kind: "text", name: "governingSource", label: "Governing source", hint: "The circular or letter that issues it, if any." },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={label ? { label } : undefined}
      action={startRateIssue}
      submitLabel={label ? "Start the issue" : "Add the schedule"}
      trigger={label ? { label: "Next issue", className: secondary, ariaLabel: `Start the next issue of ${label}` } : { label: "Add a schedule", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RateItemDrawer({ scheduleId, title, item }: { scheduleId: string; title: string; item?: { id: string; code: string; raw: Record<string, string> } }) {
  return (
    <RecordEditor
      title={item ? `Edit item ${item.code}` : `Add an item to ${title}`}
      description="An issued issue is never changed; its items are edited only while it is a draft."
      columns={2}
      fields={[
        hidden("scheduleId"),
        hidden("itemId"),
        { kind: "text", name: "code", label: "Code", required: true, mono: true },
        { kind: "text", name: "unit", label: "Unit", placeholder: "e.g. m, m³, item" },
        { kind: "textarea", name: "descriptionEn", label: "Description", required: true },
        { kind: "money", name: "rate", label: "Rate", required: true },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ scheduleId, itemId: item?.id ?? "", ...(item?.raw ?? {}) }}
      action={saveRateItem}
      submitLabel={item ? "Save the item" : "Add the item"}
      trigger={item ? { label: "Edit", className: ghost, ariaLabel: `Edit item ${item.code}` } : { label: "Add an item", icon: true, className: secondary, ariaLabel: `Add an item to ${title}` }}
      size="lg"
    />
  );
}

export function RemoveRateItemDrawer({ scheduleId, item }: { scheduleId: string; item: { id: string; code: string } }) {
  return (
    <RecordEditor
      title={`Remove item ${item.code}`}
      description="Taken off the draft issue. Its whole row is kept in the history."
      fields={[hidden("scheduleId"), hidden("itemId")]}
      values={{ scheduleId, itemId: item.id }}
      danger
      cancelLabel="Keep the item"
      action={removeRateItem}
      submitLabel="Remove the item"
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm"), ariaLabel: `Remove item ${item.code}` }}
      size="sm"
    />
  );
}

/// `blocked`: why the person looking may not issue it (they made it, or nobody is on record as having), in words; null where they may.
export function IssueRateScheduleDrawer({ scheduleId, title, today, blocked }: { scheduleId: string; title: string; today: string | null; blocked: string | null }) {
  return (
    <RecordEditor
      title={`Issue ${title}`}
      description="From the day it takes effect, lines priced from this schedule take its rates. The issue in force before it is superseded today; lines already priced from it keep what it said."
      fields={[
        hidden("scheduleId"),
        { kind: "date", name: "effectiveFrom", label: "Takes effect from", required: true, hint: "The organisation's day. After the day the current issue took effect." },
        actorField("RateSchedule.issuedBy", { name: "issuedByPersonId", hint: "You issue it, from your sign-in." }),
        ...(today ? [] : [{ kind: "note", text: "Set the organisation's time zone under Configuration, Organisation first: the day it is issued is the organisation's." } as Field]),
      ]}
      values={{ scheduleId }}
      action={issueRateSchedule}
      submitLabel="Issue it"
      submitBlock={blocked}
      trigger={{ label: "Issue", className: buttonClass("primary", "sm"), ariaLabel: `Issue ${title}` }}
      size="md"
    />
  );
}

/// Take over a draft issue nobody is on record as having made, so that a different person issues it.
export function AdoptRateDraftDrawer({ scheduleId, title }: { scheduleId: string; title: string }) {
  return (
    <RecordEditor
      title={`Adopt ${title}`}
      description="Nobody is on record as having made this draft. Adopting it makes you its maker, so that a different person issues it. You cannot issue a draft you adopted."
      fields={[hidden("scheduleId")]}
      values={{ scheduleId }}
      action={adoptRateDraft}
      submitLabel="Adopt draft"
      reason={{ label: "Why are you adopting it?" }}
      trigger={{ label: "Adopt draft", className: buttonClass("secondary", "sm"), ariaLabel: `Adopt ${title}` }}
      size="sm"
    />
  );
}

export function DiscardRateIssueDrawer({ scheduleId, title }: { scheduleId: string; title: string }) {
  return (
    <RecordEditor
      title={`Discard the draft ${title}`}
      description="The draft and its items are removed. Every row is kept in the history. An issued issue is never discarded."
      fields={[hidden("scheduleId")]}
      values={{ scheduleId }}
      danger
      cancelLabel="Keep the draft"
      action={discardRateIssue}
      submitLabel="Discard the draft"
      trigger={{ label: "Discard", className: buttonClass("destructive", "sm"), ariaLabel: `Discard the draft ${title}` }}
      size="sm"
    />
  );
}
