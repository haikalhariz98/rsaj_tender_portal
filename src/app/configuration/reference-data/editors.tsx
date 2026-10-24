import { PencilIcon } from "@/components/icons";
import type { BehaviourKey } from "@/lib/method/profile";
import { VARIANT_WORDS } from "@/lib/supervision/labels";
import { DELEGATION_VARIANTS } from "@/lib/supervision/types";
import { SUM_ADJUSTMENT_TRIGGER_WORDS, SUM_ADJUSTMENT_TRIGGERS } from "@/lib/method/behaviour-twins";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { ContractType, FundingRoute, SourcingMethod } from "@/lib/reference/types";

import { buttonClass } from "@/components/ui/button";

import {
  removeTaxonomyMapping,
  restoreEntry,
  retireChecklistItem,
  retireEntry,
  saveChecklistItem,
  saveClassificationPolicy,
  saveContractBasis,
  saveContractBehaviours,
  saveContractType,
  saveFundingRoute,
  saveJustificationReason,
  saveSourcingMethod,
  saveTaxonomy,
  saveTaxonomyMapping,
  saveTaxonomyValue,
} from "./actions";
import type { ContractBehaviours, MethodBehaviour } from "@/lib/method/types";
import { BEHAVIOUR_LABEL, PAYMENT_ROUTE_LABEL } from "@/lib/method/labels";
import { PAYMENT_ROUTES } from "@/lib/project-docs/types";

/**
 * The field declarations behind each Reference data record.
 *
 * Held here rather than in the page so the shape of a record is stated once and the
 * add and edit forms cannot drift apart. Nothing carries a default: a pre-ticked band
 * or a pre-chosen provenance would be this product deciding a customer's policy.
 */

const PROVENANCE_FIELD: Field = {
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

/// The lists a method or contract type picks from: committees and numbering series, by name.
export type Choices = { committees: { value: string; label: string }[]; series: { value: string; label: string }[] };
const NO_CHOICES: Choices = { committees: [], series: [] };

const codeField = (hint: string): Field => ({
  kind: "text",
  name: "code",
  label: "Code",
  required: true,
  mono: true,
  hint,
});

function fundingFields(editing: boolean): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally to join this route to a matter. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "hidden", name: "nameMs" },
    {
      kind: "switch",
      name: "organisationProcures",
      label: "The organisation runs the procurement",
      hint: "Off where it only records eligibility, inspection, acceptance.",
    },
    {
      kind: "switch",
      name: "routeDecidedExternally",
      label: "An external body decides the sourcing route",
    },
    {
      kind: "switch",
      name: "supersedesAuthority",
      label: "The funder's rules override the approval matrix",
      hint: "Routed by the funder's rule set where issued.",
    },
    {
      kind: "switch",
      name: "requiresExternalAuthorityRef",
      label: "A matter waits for an external body's authority",
      hint: "Submission needs that authority's reference.",
    },
    {
      kind: "text",
      name: "externalAuthorityRefLabel",
      label: "What that authority is called",
      placeholder: "e.g. the funder's execution letter",
    },
    {
      kind: "select",
      name: "approvalCommitsBudget",
      label: "Approving a requisition on this route commits the organisation's budget",
      placeholder: "Not set — approval commits nothing",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No — the budget is not the organisation's" },
      ],
    },
    {
      kind: "select",
      name: "approvalCommitsBudgetProvenance",
      label: "Where that comes from",
      placeholder: "Not set",
      options: [
        { value: "STATED", label: "Stated" },
        { value: "OBSERVED", label: "Observed" },
        { value: "ASSUMED", label: "Assumed" },
      ],
    },
    {
      kind: "select",
      name: "committeeGateRequired",
      label: "Needs a committee gate before sourcing",
      placeholder: "Not set — no exercise can be opened",
      hint: "Whether a committee must pass the requisition first.",
      options: [
        { value: "yes", label: "Yes — its gate rules apply" },
        { value: "no", label: "No — this route has no committee gate" },
      ],
    },
    {
      kind: "select",
      name: "committeeGateProvenance",
      label: "Where that comes from",
      placeholder: "Not set",
      options: [
        { value: "STATED", label: "Stated" },
        { value: "OBSERVED", label: "Observed" },
        { value: "ASSUMED", label: "Assumed" },
      ],
    },
    { kind: "text", name: "trigger", label: "Triggered by" },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

function methodFields(editing: boolean, choices: Choices): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "hidden", name: "nameMs" },
    {
      kind: "note",
      text: "Which value bands this method may be used in. The thresholds themselves are set on the approval matrix, not here.",
    },
    { kind: "switch", name: "availableInTender", label: "Available in the tender band" },
    { kind: "switch", name: "availableInQuotation", label: "Available in the quotation band" },
    { kind: "switch", name: "availableBelow", label: "Available below the quotation floor" },
    { kind: "switch", name: "requiresAdvertisement", label: "The exercise is advertised" },
    { kind: "switch", name: "invitesNamedSuppliers", label: "Named suppliers are invited" },
    {
      kind: "switch",
      name: "requiresFreshSourcing",
      label: "Sources afresh",
      hint: "Off where the method has no bids.",
    },
    { kind: "text", name: "awardInstrument", label: "Awarded by" },
    { kind: "select", name: "committeeCode", label: "Committee", placeholder: "None", options: choices.committees, orphanLabel: "A committee no longer configured" },
    {
      kind: "text",
      name: "authorityMethodKey",
      label: "Approval matrix method key",
      mono: true,
      placeholder: "e.g. open_tender",
      hint: "Lowercase, numbers, underscores. Approval rows match on it.",
    },
    {
      kind: "note",
      text: "What choosing this method asks of an exercise. The regime proposes the method marked as its default; at most one per band.",
    },
    { kind: "switch", name: "defaultInTender", label: "Proposed in the tender band" },
    { kind: "switch", name: "defaultInQuotation", label: "Proposed in the quotation band" },
    { kind: "switch", name: "defaultBelow", label: "Proposed below the quotation floor" },
    { kind: "switch", name: "requiresJustification", label: "Needs a justification" },
    { kind: "text", name: "justificationPrompt", label: "What the justification must show" },
    { kind: "switch", name: "requiresProposal", label: "Needs a proposal reviewed by Contract & Procurement" },
    { kind: "switch", name: "requiresNameApproval", label: "Needs the name approved" },
    { kind: "switch", name: "restrictedAccess", label: "Restricted to named participants", hint: "Hidden from all but the people named." },
    { kind: "switch", name: "requiresDossier", label: "Keeps a justification dossier with a reason code" },
    { kind: "select", name: "dossierSeriesKey", label: "Dossier numbering series", placeholder: "Not set", options: choices.series, orphanLabel: "A series no longer configured", hint: "The series dossier references use." },
    { kind: "select", name: "exerciseSeriesKey", label: "Exercise numbering series", placeholder: "The standard exercise series", options: choices.series, orphanLabel: "A series no longer configured", hint: "Where an exercise's reference comes from." },
    { kind: "switch", name: "requiresCoordinationRecord", label: "Needs an emergency coordination record" },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const KIND_OPTIONS = [
  { value: "GOODS_DELIVERED", label: "Goods delivered" },
  { value: "MEASURED_CONSTRUCTION", label: "Measured construction or installation" },
  { value: "TERM_PERFORMANCE", label: "Performance over a term" },
];

function contractFields(editing: boolean, choices: Choices): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "hidden", name: "nameMs" },
    {
      kind: "select",
      name: "deliverableKind",
      label: "Default for this deliverable",
      placeholder: "None — chosen only",
      options: KIND_OPTIONS,
      hint: "Default type for this deliverable's exercises.",
    },
    {
      kind: "select",
      name: "contractSeriesKey",
      label: "Contract numbering series",
      placeholder: "Not set",
      options: choices.series,
      orphanLabel: "A series no longer configured",
      hint: "Numbering series for this type's contracts.",
    },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const num = (n: number) => String(n);

export function AddFundingRoute() {
  return (
    <RecordEditor
      title="Add a funding route"
      description="How a matter is funded, and what that decides."
      fields={fundingFields(false)}
      action={saveFundingRoute}
      submitLabel="Add route"
      trigger={{ label: "Add route", icon: true }}
    />
  );
}

export function EditFundingRoute({ route, id }: { route: FundingRoute; id: string }) {
  return (
    <RecordEditor
      title={`Edit ${route.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...fundingFields(true)]}
      action={saveFundingRoute}
      trigger={{ label: `Edit ${route.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id,
        code: route.code,
        nameEn: route.nameEn,
        nameMs: route.nameMs,
        organisationProcures: route.organisationProcures,
        routeDecidedExternally: route.routeDecidedExternally,
        supersedesAuthority: route.supersedesAuthority,
        requiresExternalAuthorityRef: route.requiresExternalAuthorityRef ?? false,
        externalAuthorityRefLabel: route.externalAuthorityRefLabel ?? null,
        approvalCommitsBudget: route.approvalCommitsBudget == null ? null : route.approvalCommitsBudget ? "yes" : "no",
        approvalCommitsBudgetProvenance: route.approvalCommitsBudgetProvenance ?? null,
        committeeGateRequired: route.committeeGateRequired == null ? null : route.committeeGateRequired ? "yes" : "no",
        committeeGateProvenance: route.committeeGateProvenance ?? null,
        trigger: route.trigger,
        governingSource: route.governingSource,
        provenance: route.provenance,
        sortOrder: num(route.sortOrder),
        notes: route.notes,
      }}
    />
  );
}

export function AddSourcingMethod({ choices = NO_CHOICES }: { choices?: Choices }) {
  return (
    <RecordEditor
      title="Add a sourcing method"
      description="How suppliers are approached, and what that decides downstream."
      fields={methodFields(false, choices)}
      action={saveSourcingMethod}
      submitLabel="Add method"
      trigger={{ label: "Add method", icon: true }}
      size="lg"
    />
  );
}

export function EditSourcingMethod({ method, id, choices = NO_CHOICES }: { method: SourcingMethod & Partial<MethodBehaviour>; id: string; choices?: Choices }) {
  return (
    <RecordEditor
      title={`Edit ${method.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...methodFields(true, choices)]}
      action={saveSourcingMethod}
      trigger={{ label: `Edit ${method.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id,
        code: method.code,
        nameEn: method.nameEn,
        nameMs: method.nameMs,
        availableInTender: method.availableInTender,
        availableInQuotation: method.availableInQuotation,
        availableBelow: method.availableBelow,
        requiresAdvertisement: method.requiresAdvertisement,
        invitesNamedSuppliers: method.invitesNamedSuppliers,
        requiresFreshSourcing: method.requiresFreshSourcing,
        awardInstrument: method.awardInstrument,
        committeeCode: method.committeeCode,
        authorityMethodKey: method.authorityMethodKey,
        defaultInTender: method.defaultInTender ?? false,
        defaultInQuotation: method.defaultInQuotation ?? false,
        defaultBelow: method.defaultBelow ?? false,
        requiresJustification: method.requiresJustification ?? false,
        justificationPrompt: method.justificationPrompt ?? "",
        requiresProposal: method.requiresProposal ?? false,
        requiresNameApproval: method.requiresNameApproval ?? false,
        restrictedAccess: method.restrictedAccess ?? false,
        requiresDossier: method.requiresDossier ?? false,
        dossierSeriesKey: method.dossierSeriesKey ?? null,
        exerciseSeriesKey: method.exerciseSeriesKey ?? null,
        requiresCoordinationRecord: method.requiresCoordinationRecord ?? false,
        governingSource: method.governingSource,
        provenance: method.provenance,
        sortOrder: num(method.sortOrder),
        notes: method.notes,
      }}
    />
  );
}

export function AddContractType({ choices = NO_CHOICES }: { choices?: Choices }) {
  return (
    <RecordEditor
      title="Add a contract type"
      description="What is being bought."
      fields={contractFields(false, choices)}
      action={saveContractType}
      submitLabel="Add type"
      trigger={{ label: "Add type", icon: true }}
      size="sm"
    />
  );
}

export function EditContractType({ type, id, choices = NO_CHOICES }: { type: ContractType & { deliverableKind?: string | null; contractSeriesKey?: string | null }; id: string; choices?: Choices }) {
  return (
    <RecordEditor
      title={`Edit ${type.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...contractFields(true, choices)]}
      action={saveContractType}
      trigger={{ label: `Edit ${type.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      size="sm"
      values={{
        id,
        code: type.code,
        nameEn: type.nameEn,
        nameMs: type.nameMs,
        deliverableKind: type.deliverableKind ?? null,
        contractSeriesKey: type.contractSeriesKey ?? null,
        governingSource: type.governingSource,
        provenance: type.provenance,
        sortOrder: num(type.sortOrder),
        notes: type.notes,
      }}
    />
  );
}

/// Retiring, not deleting. A matter already run under an entry must still render it.
export function RetireEntry({
  entity,
  id,
  label,
}: {
  entity: RetirableEntity;
  id: string;
  label: string;
}) {
  return (
    <RecordEditor
      title={`Stop using ${label}`}
      description="It stops being offered from today. Matters already run under it keep showing it."
      fields={[
        { kind: "hidden", name: "entity" },
        { kind: "hidden", name: "id" },
      ]}
      values={{ entity, id }}
      action={retireEntry}
      submitLabel="Stop using"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{
        label: "Stop using",
        className: buttonClass("destructive", "sm"),
      }}
      size="sm"
    />
  );
}

export function RestoreEntry({
  entity,
  id,
  label,
}: {
  entity: RetirableEntity;
  id: string;
  label: string;
}) {
  return (
    <RecordEditor
      title={`Restore ${label}`}
      description="It is offered again from today, under the same code."
      fields={[
        { kind: "hidden", name: "entity" },
        { kind: "hidden", name: "id" },
      ]}
      values={{ entity, id }}
      action={restoreEntry}
      submitLabel="Restore"
      reason={{ label: "Why is it coming back?" }}
      trigger={{ label: "Restore", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export type RetirableEntity = "FundingRoute" | "SourcingMethod" | "ContractType" | "JustificationReason" | "ContractBasis" | "ClassificationTaxonomy";

type Option = { value: string; label: string };
const TRI = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const tri = (b: boolean | null) => (b == null ? null : b ? "yes" : "no");

/// The twelve behaviours of a contract type (FR-MTD-012). Each may stay unset.
export function ContractBehavioursDrawer({ id, name, values, offices }: { id: string; name: string; values: ContractBehaviours; offices: Option[] }) {
  // The same words as the exercise record shows (UX 11).
  const t = (n: BehaviourKey, hint?: string): Field => ({ kind: "text", name: n, label: BEHAVIOUR_LABEL[n], hint });
  const b = (n: BehaviourKey): Field => ({ kind: "select", name: n, label: BEHAVIOUR_LABEL[n], placeholder: "Not set", options: TRI });
  return (
    <RecordEditor
      title={`What ${name} drives`}
      description="Twelve behaviours the type sets. Unset shows as not set, never no."
      fields={[
        { kind: "hidden", name: "id" },
        t("pricingBasis"),
        t("registrationTest"),
        { kind: "tokens", name: "administratorRoleCodes", label: BEHAVIOUR_LABEL.administratorRoleCodes, options: offices, placeholder: "Add an office" },
        b("startRequiresSecurities"),
        t("eotInstrument"),
        t("completionInstrument"),
        b("defectsLiabilityApplies"),
        b("makingGoodCertificate"),
        b("nominationAllowed"),
        t("interimPaymentRule"),
        t("sumAdjustmentDrivers", "Separate them with commas. Kept as the type's own words; the typed list below is what the adjustment certificate reads."),
        // 6.13 Part A step 1 (A7): the typed twin of the drivers. Empty: not set.
        { kind: "tokens", name: "sumAdjustmentTriggers", label: "Contract-sum adjustment triggers", options: SUM_ADJUSTMENT_TRIGGERS.map((k) => ({ value: k, label: SUM_ADJUSTMENT_TRIGGER_WORDS[k].en })), placeholder: "Add a trigger", hint: "Allowed adjustments. Empty refuses adjustment certificates." },
        { kind: "select", name: "claimsApprovalCommitteeCode", label: BEHAVIOUR_LABEL.claimsApprovalCommitteeCode, placeholder: "Not set", options: offices },
        // 6.13 Part A step 2 (FR-SUP-003): not one of the twelve; which letters a delegation on this type's contracts uses.
        { kind: "select", name: "delegationVariant", label: "Delegation letters", placeholder: "Not set", options: DELEGATION_VARIANTS.map((k) => ({ value: k, label: VARIANT_WORDS[k].en })), hint: "Unset: representative delegations are refused." },
        { kind: "select", name: "paymentRoute", label: "How it is paid", placeholder: "Not set", options: PAYMENT_ROUTES.map((k) => ({ value: k, label: PAYMENT_ROUTE_LABEL[k] })) },
      ]}
      values={{
        id,
        pricingBasis: values.pricingBasis,
        registrationTest: values.registrationTest,
        administratorRoleCodes: values.administratorRoleCodes.join("\n"),
        startRequiresSecurities: tri(values.startRequiresSecurities),
        eotInstrument: values.eotInstrument,
        completionInstrument: values.completionInstrument,
        defectsLiabilityApplies: tri(values.defectsLiabilityApplies),
        makingGoodCertificate: tri(values.makingGoodCertificate),
        nominationAllowed: tri(values.nominationAllowed),
        interimPaymentRule: values.interimPaymentRule,
        sumAdjustmentDrivers: values.sumAdjustmentDrivers.join(", "),
        sumAdjustmentTriggers: (values.sumAdjustmentTriggers ?? []).join("\n"),
        claimsApprovalCommitteeCode: values.claimsApprovalCommitteeCode,
        delegationVariant: values.delegationVariant ?? null,
        paymentRoute: values.paymentRoute ?? null,
      }}
      action={saveContractBehaviours}
      submitLabel="Save behaviours"
      trigger={{ label: "Behaviours", className: buttonClass("ghost", "sm") }}
      size="lg"
    />
  );
}


export function ChecklistItemDrawer({ methods, item }: { methods: Option[]; item?: { id: string; sourcingMethodId: string; key: string; labelEn: string; labelMs: string | null; required: boolean; sortOrder: number } }) {
  return (
    <RecordEditor
      title={item ? `Edit ${item.labelEn}` : "Add a proposal item"}
      description="One item of the proposal a method asks for, in the customer's words."
      fields={[
        { kind: "hidden", name: "id" },
        ...(item ? [{ kind: "hidden", name: "sourcingMethodId" } as Field] : [{ kind: "select", name: "sourcingMethodId", label: "Method", required: true, placeholder: "Choose", options: methods } as Field]),
        ...(item ? [] : [{ kind: "text", name: "key", label: "Key", required: true, mono: true, hint: "Never shown." } as Field]),
        { kind: "textarea", name: "labelEn", label: "Item" },
        { kind: "hidden", name: "labelMs" },
        { kind: "switch", name: "required", label: "Must be answered before the proposal is submitted" },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={item ? { id: item.id, sourcingMethodId: item.sourcingMethodId, labelEn: item.labelEn, labelMs: item.labelMs, required: item.required, sortOrder: num(item.sortOrder) } : { required: true }}
      action={saveChecklistItem}
      submitLabel={item ? "Save" : "Add item"}
      trigger={item ? { label: `Edit ${item.labelEn}`, iconOnly: <PencilIcon size={15} /> } : { label: "Add item", icon: true }}
      size="md"
    />
  );
}

export function RetireChecklistItem({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Stop using ${label}`}
      description="It is no longer asked for. Answers already given are kept."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={retireChecklistItem}
      submitLabel="Stop using"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{ label: "Stop using", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function ReasonDrawer({ methods, reason }: { methods: Option[]; reason?: { id: string; nameEn: string; nameMs: string | null; sourcingMethodCode: string | null; governingSource: string; provenance: string; sortOrder: number } }) {
  return (
    <RecordEditor
      title={reason ? `Edit ${reason.nameEn}` : "Add a justification reason"}
      description="A reason a direct appointment may be justified by."
      fields={[
        { kind: "hidden", name: "id" },
        ...(reason ? [] : [codeField("Never shown.")]),
        { kind: "text", name: "nameEn", label: "Reason", required: true },
        { kind: "hidden", name: "nameMs" },
        { kind: "select", name: "sourcingMethodCode", label: "Offered for", placeholder: "Every method that asks for a reason", options: methods },
        { kind: "text", name: "governingSource", label: "Source document" },
        PROVENANCE_FIELD,
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={reason ? { id: reason.id, nameEn: reason.nameEn, nameMs: reason.nameMs, sourcingMethodCode: reason.sourcingMethodCode, governingSource: reason.governingSource, provenance: reason.provenance, sortOrder: num(reason.sortOrder) } : undefined}
      action={saveJustificationReason}
      submitLabel={reason ? "Save" : "Add reason"}
      trigger={reason ? { label: `Edit ${reason.nameEn}`, iconOnly: <PencilIcon size={15} /> } : { label: "Add reason", icon: true }}
      size="md"
    />
  );
}

export function BasisDrawer({ basis }: { basis?: { id: string; nameEn: string; nameMs: string | null; standardFormLabel: string | null; governingSource: string; provenance: string; sortOrder: number; notes: string } }) {
  return (
    <RecordEditor
      title={basis ? `Edit ${basis.nameEn}` : "Add a contract basis"}
      description="Bills of quantities, drawings and specification. Always chosen by the officer on an exercise."
      fields={[
        { kind: "hidden", name: "id" },
        ...(basis ? [] : [codeField("Never shown.")]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "hidden", name: "nameMs" },
        { kind: "text", name: "standardFormLabel", label: "Standard contract form" },
        { kind: "text", name: "governingSource", label: "Source document" },
        PROVENANCE_FIELD,
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={basis ? { ...basis, sortOrder: num(basis.sortOrder) } : undefined}
      action={saveContractBasis}
      submitLabel={basis ? "Save" : "Add basis"}
      trigger={basis ? { label: `Edit ${basis.nameEn}`, iconOnly: <PencilIcon size={15} /> } : { label: "Add basis", icon: true }}
      size="md"
    />
  );
}

export function TaxonomyDrawer({ taxonomy }: { taxonomy?: { id: string; nameEn: string; nameMs: string | null; governingSource: string; provenance: string; sortOrder: number } }) {
  return (
    <RecordEditor
      title={taxonomy ? `Edit ${taxonomy.nameEn}` : "Add a classification"}
      description="Another classification derived from the contract type."
      fields={[
        { kind: "hidden", name: "id" },
        ...(taxonomy ? [] : [codeField("Never shown.")]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "hidden", name: "nameMs" },
        { kind: "text", name: "governingSource", label: "Source document" },
        PROVENANCE_FIELD,
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={taxonomy ? { ...taxonomy, sortOrder: num(taxonomy.sortOrder) } : undefined}
      action={saveTaxonomy}
      submitLabel={taxonomy ? "Save" : "Add classification"}
      trigger={taxonomy ? { label: `Edit ${taxonomy.nameEn}`, iconOnly: <PencilIcon size={15} /> } : { label: "Add classification", icon: true }}
      size="md"
    />
  );
}

export function TaxonomyValueDrawer({ taxonomyId, taxonomy, value }: { taxonomyId: string; taxonomy: string; value?: { id: string; nameEn: string; nameMs: string | null; sortOrder: number; retired: boolean } }) {
  return (
    <RecordEditor
      title={value ? `Edit ${value.nameEn}` : `Add a value to ${taxonomy}`}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "taxonomyId" },
        ...(value ? [] : [codeField("Never shown.")]),
        { kind: "text", name: "nameEn", label: "Value", required: true },
        { kind: "hidden", name: "nameMs" },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        ...(value ? [{ kind: "switch", name: "retired", label: "Retired: no longer offered" } as Field] : []),
      ]}
      values={value ? { id: value.id, taxonomyId, nameEn: value.nameEn, nameMs: value.nameMs, sortOrder: num(value.sortOrder), retired: value.retired } : { taxonomyId }}
      action={saveTaxonomyValue}
      submitLabel={value ? "Save" : "Add value"}
      trigger={value ? { label: `Edit ${value.nameEn}`, iconOnly: <PencilIcon size={14} /> } : { label: "Add value", icon: true, className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function MappingDrawer({ types, taxonomies, values, bases }: { types: Option[]; taxonomies: Option[]; values: Option[]; bases: Option[] }) {
  return (
    <RecordEditor
      title="Add a mapping"
      description="A type's value in another classification, optionally per basis."
      fields={[
        { kind: "select", name: "contractTypeCode", label: "Contract type", required: true, placeholder: "Choose", options: types },
        { kind: "select", name: "taxonomyCode", label: "Classification", required: true, placeholder: "Choose", options: taxonomies },
        { kind: "select", name: "valueCode", label: "Value", required: true, placeholder: "Choose", options: values, hint: "A value of that classification." },
        { kind: "select", name: "whenBasisCode", label: "Only when the basis is", placeholder: "Any basis", options: bases },
        { kind: "select", name: "whenTaxonomyCode", label: "Only when this classification", placeholder: "No condition", options: taxonomies },
        { kind: "select", name: "whenValueCode", label: "has this value", placeholder: "No condition", options: values },
        { kind: "text", name: "governingSource", label: "Source document" },
        PROVENANCE_FIELD,
      ]}
      action={saveTaxonomyMapping}
      submitLabel="Add mapping"
      trigger={{ label: "Add mapping", icon: true }}
      size="md"
    />
  );
}

export function RemoveMapping({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={removeTaxonomyMapping}
      submitLabel="Remove"
      destructive={{ reasonLabel: "Why is it coming out?" }}
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function ClassificationPolicyDrawer({ values }: { values: { dominanceSharePct: string | null; provenance: string | null; notes: string } }) {
  return (
    <RecordEditor
      title="Mixed-scope classification"
      description="Share the largest deliverable must exceed. Empty: the officer chooses, with a reason."
      fields={[
        { kind: "text", name: "dominanceSharePct", label: "Mixed-scope threshold (percent)", placeholder: "Not set", hint: "At least 50 and below 100." },
        {
          kind: "select",
          name: "provenance",
          label: "Where this comes from",
          placeholder: "Not set",
          options: [
            { value: "STATED", label: "Stated" },
            { value: "OBSERVED", label: "Observed" },
            { value: "ASSUMED", label: "Assumed" },
          ],
        },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={saveClassificationPolicy}
      submitLabel="Save"
      trigger={{ label: "Edit", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}
