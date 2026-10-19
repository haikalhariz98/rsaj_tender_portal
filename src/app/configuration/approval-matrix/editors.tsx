import { PencilIcon, PlusIcon, XIcon } from "@/components/icons";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { contractTypeDomainWords } from "@/lib/authority/contract-type-domains";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { CHAIN_CHOICE_LABEL } from "@/lib/authority/core-routing-labels";
import { actorField } from "@/lib/auth/actor-field";

import {
  adoptDraft,
  discardDraft,
  endRejectionDestination,
  issueDraft,
  removeCoreLevel,
  removeCoreStep,
  saveCoreLevel,
  saveCoreStep,
  saveRejectionDestination,
  removeRecommender,
  removeTermsBand,
  saveTermsBand,
  saveMatrix,
  saveRecommender,
  saveRule,
  startRevision,
} from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const ACT_OPTIONS = [
  { value: "P", label: "Proposes" },
  { value: "JP", label: "Jointly proposes" },
  { value: "R", label: "Recommends" },
  { value: "JR", label: "Jointly recommends" },
  { value: "MR", label: "Mandatory recommendation — cannot be skipped" },
  { value: "MJR", label: "Mandatory joint recommendation" },
  { value: "A", label: "Approves" },
  { value: "MA", label: "Mandatory approval" },
];

/// The issue's fields. `routes` are the funding routes whose funder's rules may
/// supersede the limits: choosing one makes this issue that funder's rule set.
function matrixFields(routes: { code: string; nameEn: string }[]): Field[] {
  return [
  {
    kind: "text",
    name: "label",
    label: "Issue",
    required: true,
    hint: "How this issue of the limits is cited — an issue number, a resolution date.",
  },
  {
    kind: "date",
    name: "effectiveFrom",
    label: "Meant to start",
    required: true,
    hint: "Nothing is in force until the draft is issued. You confirm the date then.",
  },
  {
    kind: "note",
    text: "The thresholds below decide every routing decision in the portal. Nothing is proposed for you.",
  },
  { kind: "money", name: "quotationFloor", label: "Quotation floor", required: true },
  {
    kind: "money",
    name: "tenderFloor",
    label: "Tender floor",
    required: true,
    hint: "Where the quotation band ends and the tender band begins: the boundary.",
  },
  {
    kind: "switch",
    name: "boundaryInclusive",
    label: "A value exactly on the tender floor falls in the quotation band",
    hint: "Where governing documents disagree, this is the switch. Amounts: it decides only a value exactly on the tender floor, for the quotation and tender bands and for a rule whose edge sits on the tender floor and that is set to follow the switch; every other amount edge counts in the band it closes. Percentages: it decides every band edge on this matrix. On, a value exactly on an edge it decides falls in the band the edge closes; off, in the band it opens.",
  },
  {
    kind: "select",
    name: "boundaryProvenance",
    label: "Where the boundary ruling comes from",
    required: true,
    placeholder: "Choose",
    options: [
      { value: "STATED", label: "Stated — a written ruling" },
      { value: "OBSERVED", label: "Observed — seen in practice" },
      { value: "ASSUMED", label: "Assumed — the interim position, needs a ruling" },
    ],
    hint: "Every exercise exactly on the boundary records whether the rule it ran under was written down.",
  },
  {
    kind: "text",
    name: "boundarySource",
    label: "Boundary ruling source",
    hint: "The document that states it. Required where the ruling is stated.",
  },
  { kind: "money", name: "requisitionBoundary", label: "Requisition boundary", required: true },
  { kind: "text", name: "currency", label: "Currency", required: true },
  {
    kind: "select",
    name: "fundingRouteCode",
    label: "Funder's rule set for",
    placeholder: "None — the organisation's own limits",
    options: routes.map((r) => ({ value: r.code, label: r.nameEn })),
    orphanLabel: "A funding route no longer configured",
    hint: "Only for a funder whose rules supersede these limits. Such an issue routes matters on that funding route alone, and never replaces the organisation's own issue.",
  },
  {
    kind: "note",
    text: "Where your manual states the portal's standing rules, cite the clause. Left empty, the warning on a matter says the source is not recorded.",
  },
  {
    kind: "text",
    name: "noRuleClause",
    label: "Clause: no rule matches",
    hint: "Escalate to the superior of the officer expected to approve.",
  },
  {
    kind: "text",
    name: "selfApprovalClause",
    label: "Clause: no self-approval",
    hint: "Nobody approves their own expenses or allocations.",
  },
  {
    kind: "text",
    name: "absenceClause",
    label: "Clause: absence reverts upward",
    hint: "An absent holder's authority goes up, never down.",
  },
  {
    kind: "text",
    name: "funderOverrideClause",
    label: "Clause: funder's directives prevail",
    hint: "An external funder's rules override these limits where they conflict.",
  },
  ];
}

/// Draft an issue from blank: the organisation's first, or a funder's rule set.
export function AddMatrix({
  routes = [],
  label = "Draft the first issue",
  title = "Draft the first issue of the limits",
  primary = true,
}: {
  routes?: { code: string; nameEn: string }[];
  label?: string;
  title?: string;
  primary?: boolean;
}) {
  return (
    <RecordEditor
      title={title}
      description="A draft is editable and routes nothing. Add its rules, then issue it."
      fields={matrixFields(routes)}
      action={saveMatrix}
      submitLabel="Create draft"
      trigger={{ label, icon: true, className: buttonClass(primary ? "primary" : "secondary", "sm") }}
      size="lg"
    />
  );
}

export interface MatrixValues {
  id: string;
  label: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  boundaryValue: number;
  boundaryInclusive: boolean;
  quotationFloor: number;
  tenderFloor: number;
  requisitionBoundary: number;
  currency: string;
  fundingRouteCode: string | null;
  boundaryProvenance: string;
  boundarySource: string;
  noRuleClause: string | null;
  selfApprovalClause: string | null;
  absenceClause: string | null;
  funderOverrideClause: string | null;
}

export function EditMatrix({ matrix, routes }: { matrix: MatrixValues; routes: { code: string; nameEn: string }[] }) {
  return (
    <RecordEditor
      title={`Edit ${matrix.label}`}
      description="A draft. Nothing here is in force until it is issued."
      fields={[{ kind: "hidden", name: "id" }, ...matrixFields(routes)]}
      action={saveMatrix}
      trigger={{ label: "Edit thresholds", className: buttonClass("secondary", "sm") }}
      size="lg"
      values={{
        id: matrix.id,
        label: matrix.label,
        effectiveFrom: day(matrix.effectiveFrom),
        boundaryInclusive: matrix.boundaryInclusive,
        quotationFloor: String(matrix.quotationFloor),
        tenderFloor: String(matrix.tenderFloor),
        requisitionBoundary: String(matrix.requisitionBoundary),
        currency: matrix.currency,
        fundingRouteCode: matrix.fundingRouteCode,
        boundaryProvenance: matrix.boundaryProvenance,
        boundarySource: matrix.boundarySource,
        noRuleClause: matrix.noRuleClause,
        selfApprovalClause: matrix.selfApprovalClause,
        absenceClause: matrix.absenceClause,
        funderOverrideClause: matrix.funderOverrideClause,
      }}
    />
  );
}

function ruleFields(offices: { code: string; nameEn: string }[], contractTypes: { code: string; nameEn: string }[] = []): Field[] {
  const officeOptions = offices.map((o) => ({ value: o.code, label: o.nameEn }));
  return [
    { kind: "hidden", name: "authorityMatrixId" },
    {
      kind: "text",
      name: "ruleKey",
      label: "Rule key",
      required: true,
      mono: true,
      hint: "Cited in every resolution, so a route can be traced back to this row.",
    },
    { kind: "text", name: "labelEn", label: "Label", required: true },
    { kind: "text", name: "labelMs", label: "Label (Malay)" },
    {
      kind: "text",
      name: "domain",
      label: "Matter",
      required: true,
      mono: true,
      hint: "What is being authorised — payment, variation, appointment.",
    },
    {
      kind: "text",
      name: "method",
      label: "Sourcing method key",
      mono: true,
      hint: "Leave empty to apply whatever the method.",
    },
    {
      // FR-APR-002 (6.13 Part A step 1): a row may be confined to a contract type.
      kind: "select",
      name: "contractTypeCode",
      label: "Contract type",
      placeholder: "Any contract type",
      options: contractTypes.map((t) => ({ value: t.code, label: t.nameEn })),
      orphanLabel: "A contract type no longer configured",
      hint: `Only for matters routed with a contract type (${contractTypeDomainWords()}); on any other the save refuses it. Empty: the rule applies whatever the contract type. A rule for one type is preferred to one for any type.`,
    },
    { kind: "money", name: "minValue", label: "From value" },
    { kind: "money", name: "maxValue", label: "To value" },
    {
      kind: "select",
      name: "followsBoundarySwitch",
      label: "At the boundary value",
      placeholder: "Not decided",
      options: [
        { value: "yes", label: "Follows the boundary switch" },
        { value: "no", label: "Does not follow it — the band stays above its lower edge" },
      ],
      hint: "Required where an edge of this band is the value where the bands meet. A rule that does not follow the switch routes a value exactly on the boundary the same way under either setting.",
    },
    {
      kind: "select",
      name: "proposerCode",
      label: "Proposed by",
      placeholder: "Nobody",
      options: officeOptions,
    },
    {
      kind: "select",
      name: "approverCode",
      label: "Approved by",
      placeholder: "Nobody",
      options: officeOptions,
    },
    {
      kind: "select",
      name: "committeeCode",
      label: "Committee",
      placeholder: "None",
      options: officeOptions,
    },
    {
      kind: "select",
      name: "committeeAct",
      label: "The committee acts as",
      placeholder: "Not set",
      options: ACT_OPTIONS,
    },
    {
      kind: "switch",
      name: "nonDelegable",
      label: "Cannot be delegated",
    },
    {
      kind: "switch",
      name: "approverMandatory",
      label: "The approval is mandatory",
    },
    {
      kind: "switch",
      name: "isGap",
      label: "This is a known gap in the source",
      hint: "A matter matching it resolves, but warns that the route is an assumption.",
    },
    { kind: "text", name: "gapNote", label: "What the gap is" },
    {
      kind: "text",
      name: "clause",
      label: "Clause",
      required: true,
      hint: "The clause this row came from. Every routing decision cites it.",
    },
    {
      kind: "select",
      name: "generateCoreChain",
      label: "Chain beneath the approver",
      placeholder: CHAIN_CHOICE_LABEL.NOT_SET.en,
      options: [
        { value: "yes", label: CHAIN_CHOICE_LABEL.GENERATED.en },
        { value: "no", label: CHAIN_CHOICE_LABEL.AS_ENTERED.en },
      ],
      hint: "Generated: the issue's core routing for the approving office comes first, and this rule may only strengthen its steps or add its own. As entered: the proposer and recommenders below are the whole chain. Not set: the route warns that its chain was not checked.",
    },
    {
      kind: "text",
      name: "coreChainReason",
      label: "Why the chain is as entered",
      required: true,
      hint: "Required for “As entered on this rule”: a decision not to check, kept with every route — the clause that states this chain, for example.",
    },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "note", label: "Note" },
  ];
}

/// The reason is asked only while the chain is "as entered".
const RULE_SHOW_WHEN = { coreChainReason: { name: "generateCoreChain", in: ["no"] } };

export function AddRule({
  matrixId,
  offices,
  contractTypes = [],
}: {
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  contractTypes?: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title="Add a rule"
      description="Who proposes, who recommends and who approves, at one band of value."
      fields={ruleFields(offices, contractTypes)}
      values={{ authorityMatrixId: matrixId }}
      action={saveRule}
      showWhen={RULE_SHOW_WHEN}
      submitLabel="Add rule"
      trigger={{ label: "Add rule", icon: true, className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

export interface RuleValues {
  id: string;
  ruleKey: string;
  domain: string;
  method: string | null;
  contractTypeCode?: string | null;
  minValue: number | null;
  maxValue: number | null;
  followsBoundarySwitch: boolean | null;
  labelEn: string;
  labelMs: string | null;
  proposerCode: string | null;
  approverCode: string | null;
  committeeCode: string | null;
  committeeAct: string | null;
  nonDelegable: boolean;
  approverMandatory: boolean;
  isGap: boolean;
  gapNote: string | null;
  note: string;
  clause: string;
  sortOrder: number;
  generateCoreChain: boolean | null;
  coreChainReason: string | null;
}

export function EditRule({
  rule,
  matrixId,
  offices,
  contractTypes = [],
}: {
  rule: RuleValues;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  contractTypes?: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title={`Edit ${rule.labelEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...ruleFields(offices, contractTypes)]}
      action={saveRule}
      showWhen={RULE_SHOW_WHEN}
      trigger={{ label: "Edit rule", iconOnly: <PencilIcon size={15} />, className: iconButtonClass("sm") }}
      size="lg"
      values={{
        id: rule.id,
        authorityMatrixId: matrixId,
        ruleKey: rule.ruleKey,
        labelEn: rule.labelEn,
        labelMs: rule.labelMs,
        domain: rule.domain,
        method: rule.method,
        contractTypeCode: rule.contractTypeCode ?? null,
        minValue: rule.minValue == null ? null : String(rule.minValue),
        maxValue: rule.maxValue == null ? null : String(rule.maxValue),
        followsBoundarySwitch: rule.followsBoundarySwitch == null ? null : rule.followsBoundarySwitch ? "yes" : "no",
        proposerCode: rule.proposerCode,
        approverCode: rule.approverCode,
        committeeCode: rule.committeeCode,
        committeeAct: rule.committeeAct,
        nonDelegable: rule.nonDelegable,
        approverMandatory: rule.approverMandatory,
        isGap: rule.isGap,
        gapNote: rule.gapNote,
        clause: rule.clause,
        sortOrder: String(rule.sortOrder),
        note: rule.note,
        generateCoreChain: rule.generateCoreChain == null ? null : rule.generateCoreChain ? "yes" : "no",
        coreChainReason: rule.coreChainReason,
      }}
    />
  );
}

export function AddRecommender({
  ruleId,
  offices,
}: {
  ruleId: string;
  offices: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title="Add a recommender"
      description="An office that must act before the approver does."
      fields={[
        { kind: "hidden", name: "authorityRuleId" },
        {
          kind: "select",
          name: "roleCode",
          label: "Office",
          required: true,
          placeholder: "Choose",
          options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
        },
        {
          kind: "select",
          name: "act",
          label: "Acts as",
          required: true,
          placeholder: "Choose",
          options: ACT_OPTIONS.filter((o) => o.value !== "A" && o.value !== "MA"),
        },
        { kind: "number", name: "sequence", label: "Order in the chain", min: 0 },
      ]}
      values={{ authorityRuleId: ruleId }}
      action={saveRecommender}
      submitLabel="Add recommender"
      trigger={{ label: "Add recommender", iconOnly: <PlusIcon size={15} />, className: iconButtonClass("sm") }}
      size="sm"
    />
  );
}

export function RemoveRecommender({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Takes this step out of the draft's chain."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={removeRecommender}
      submitLabel="Remove"
      destructive={{ reasonLabel: "Why is it coming out?" }}
      trigger={{ label: `Remove ${label}`, iconOnly: <XIcon size={13} />, className: iconButtonClass("sm", false, "size-6") }}
      size="sm"
    />
  );
}

/// Copy an issued issue into a draft, to be changed and issued in its place.
export function StartRevision({ fromId, fromLabel }: { fromId: string; fromLabel: string }) {
  return (
    <RecordEditor
      title="Start a new issue"
      description={`A draft copy of ${fromLabel}. It stays in force until the draft is issued.`}
      fields={[
        { kind: "hidden", name: "fromId" },
        {
          kind: "text",
          name: "label",
          label: "Label",
          required: true,
          hint: "How the new issue is cited — an issue number, a resolution date.",
        },
        { kind: "date", name: "effectiveFrom", label: "Meant to start", required: true },
      ]}
      values={{ fromId }}
      action={startRevision}
      submitLabel="Create draft"
      trigger={{ label: "New issue", icon: true, className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

/// Put a draft into force. It ends the issue it replaces and freezes itself.
export function IssueDraft({
  id,
  label,
  meantFrom,
  replaces,
  blocked,
}: {
  id: string;
  label: string;
  meantFrom: Date;
  replaces: string | null;
  /// Why it cannot be issued by whoever is looking (they made it, or nobody is on record as having), in words; null where they may.
  blocked: string | null;
}) {
  return (
    <RecordEditor
      title={`Issue ${label}`}
      description={
        replaces
          ? `From the date below it routes every matter, ${replaces} ends, and neither can be changed again. A change after that is a new issue.`
          : "From the date below it routes every matter and can no longer be changed. A change after that is a new issue."
      }
      fields={[
        { kind: "hidden", name: "id" },
        {
          kind: "date",
          name: "effectiveFrom",
          label: "In force from",
          required: true,
          hint: "Today or later. An issue is never back-dated.",
        },
        {
          kind: "textarea",
          name: "reason",
          label: "Why it is being issued",
          hint: "The resolution or decision behind it. Kept with the issue.",
        },
        // Issuing is signed: the password is asked again, every time. The issuer is never one of the people who made the draft.
        actorField("AuthorityMatrix.issuedByPerson", { name: "personId" }),
      ]}
      values={{ id, effectiveFrom: day(meantFrom) }}
      action={issueDraft}
      submitLabel="Issue it"
      submitBlock={blocked}
      trigger={{ label: "Issue", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

/// Take over a draft nobody is on record as having made, so that a different person can issue it.
export function AdoptDraft({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Adopt ${label}`}
      description="Nobody made this draft. Adopting makes you its maker. You cannot then issue it."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={adoptDraft}
      submitLabel="Adopt draft"
      reason={{ label: "Why are you adopting it?" }}
      trigger={{ label: "Adopt draft", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

const TRI = (yes: string, no: string) => [
  { value: "yes", label: yes },
  { value: "no", label: no },
];

function termsFields(): Field[] {
  return [
    { kind: "hidden", name: "authorityMatrixId" },
    { kind: "text", name: "labelEn", label: "Terms set", required: true, hint: "Which set of terms applies — never the retention or defects figures, which belong to the contract." },
    { kind: "text", name: "labelMs", label: "Terms set (Malay)" },
    {
      kind: "select",
      name: "regime",
      label: "Applies in",
      placeholder: "Every band",
      options: [
        { value: "below", label: "Below the quotation floor" },
        { value: "quotation", label: "Quotation band" },
        { value: "tender", label: "Tender band" },
      ],
    },
    { kind: "money", name: "minValue", label: "Above", hint: "The band starts above this value. Empty for no floor." },
    { kind: "money", name: "maxValue", label: "Up to and including", hint: "Empty for no ceiling." },
    { kind: "select", name: "followsBoundarySwitch", label: "At the boundary value", placeholder: "Not decided", options: TRI("Follows the boundary switch", "Ignores the boundary switch"), hint: "Required where an edge is the value where the regimes meet." },
    { kind: "select", name: "retentionApplies", label: "Retention", placeholder: "Not set", options: TRI("Applies", "Does not apply"), hint: "Whether retention applies; the percentage is set on the contract." },
    { kind: "select", name: "defectsLiabilityApplies", label: "Defects liability period", placeholder: "Not set", options: TRI("Applies", "Does not apply") },
    { kind: "text", name: "insuranceNote", label: "Insurance" },
    { kind: "text", name: "clause", label: "Clause" },
    {
      kind: "select",
      name: "provenance",
      label: "Where this comes from",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "STATED", label: "Stated" },
        { value: "OBSERVED", label: "Observed" },
        { value: "ASSUMED", label: "Assumed" },
      ],
    },
  ];
}

export interface TermsBandValues {
  id: string;
  bandKey: string;
  labelEn: string;
  regime: string | null;
  minValue: number | null;
  maxValue: number | null;
  followsBoundarySwitch: boolean | null;
  retentionApplies: boolean | null;
  defectsLiabilityApplies: boolean | null;
  insuranceNote: string;
  clause: string;
  provenance: string;
  sortOrder: number;
}

const yn = (b: boolean | null) => (b == null ? null : b ? "yes" : "no");

export function AddTermsBand({ matrixId }: { matrixId: string }) {
  return (
    <RecordEditor
      title="Add a contract terms band"
      description="Which terms set applies at a value. The band edges are (from, to]."
      fields={termsFields()}
      values={{ authorityMatrixId: matrixId }}
      action={saveTermsBand}
      submitLabel="Add band"
      trigger={{ label: "Add terms band", icon: true, className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

export function EditTermsBand({ matrixId, band }: { matrixId: string; band: TermsBandValues }) {
  return (
    <RecordEditor
      title={`Edit ${band.labelEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...termsFields(), { kind: "hidden", name: "bandKey" }]}
      values={{
        id: band.id,
        authorityMatrixId: matrixId,
        bandKey: band.bandKey,
        labelEn: band.labelEn,
        regime: band.regime,
        minValue: band.minValue == null ? null : String(band.minValue),
        maxValue: band.maxValue == null ? null : String(band.maxValue),
        followsBoundarySwitch: yn(band.followsBoundarySwitch),
        retentionApplies: yn(band.retentionApplies),
        defectsLiabilityApplies: yn(band.defectsLiabilityApplies),
        insuranceNote: band.insuranceNote,
        clause: band.clause,
        provenance: band.provenance,
      }}
      action={saveTermsBand}
      trigger={{ label: `Edit ${band.labelEn}`, iconOnly: <PencilIcon size={14} />, className: iconButtonClass("sm") }}
      size="lg"
    />
  );
}

export function RemoveTermsBand({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Takes this band off the draft."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={removeTermsBand}
      submitLabel="Remove"
      destructive={{ reasonLabel: "Why is it coming out?" }}
      trigger={{ label: `Remove ${label}`, iconOnly: <XIcon size={14} />, className: iconButtonClass("sm") }}
      size="sm"
    />
  );
}

export function DiscardDraft({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Discard ${label}`}
      description="Removes the draft, its rules and terms bands. It never routed anything."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={discardDraft}
      submitLabel="Discard draft"
      destructive={{ reasonLabel: "Why is it being discarded?" }}
      trigger={{ label: "Discard draft", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

const DESTINATION_OPTIONS = [
  { value: "RETURN_TO_ORIGINATOR", label: "Return to whoever raised it" },
  { value: "RETURN_TO_STEP", label: "Return to an earlier step" },
  { value: "TERMINATE", label: "End the matter" },
];

/// Where a rejected matter of one type goes (FR-APR-016). A new destination from a day;
/// routes already open keep the one they opened with.
export function SetRejectionDestination({ domain, label, offices, current }: { domain: string; label: string; offices: { code: string; nameEn: string }[]; current: { kind: string; returnToRoleCode: string | null } | null }) {
  return (
    <RecordEditor
      title={`When a ${label.toLowerCase()} is rejected`}
      description="Where a rejected matter goes. Open routes keep theirs. Committees follow their own outcome."
      fields={[
        { kind: "hidden", name: "domain" },
        { kind: "select", name: "kind", label: "Where it goes", required: true, placeholder: "Choose", options: DESTINATION_OPTIONS },
        {
          kind: "select",
          name: "returnToRoleCode",
          label: "The office whose step it returns to",
          required: true,
          placeholder: "Choose",
          options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
          hint: "The earliest step of this office before the rejecting one. Where the route has none, the officer chooses.",
        },
        { kind: "text", name: "governingSource", label: "Source document" },
        {
          kind: "select",
          name: "provenance",
          label: "Where this comes from",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "STATED", label: "Stated — written in a governing document" },
            { value: "OBSERVED", label: "Observed — seen in practice" },
            { value: "ASSUMED", label: "Assumed — a working choice awaiting sign-off" },
          ],
        },
        { kind: "date", name: "effectiveFrom", label: "Takes effect", required: true },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      showWhen={{ returnToRoleCode: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      values={{ domain, kind: current?.kind ?? null, returnToRoleCode: current?.returnToRoleCode ?? null }}
      action={saveRejectionDestination}
      reason={{ label: "Why is it changing?" }}
      trigger={{ label: current ? "Change" : "Set", className: buttonClass(current ? "ghost" : "secondary", "sm") }}
      size="md"
    />
  );
}

export function EndRejectionDestination({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Clear: when a ${label.toLowerCase()} is rejected`}
      description="No destination is set. The officer chooses. Open routes keep theirs."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "date", name: "effectiveTo", label: END_DAY_LABEL, required: true },
      ]}
      values={{ id }}
      action={endRejectionDestination}
      destructive={{ reasonLabel: "Why is it cleared?" }}
      submitLabel="Clear destination"
      trigger={{ label: "Clear", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ core routing

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working choice awaiting sign-off" },
];

/// The four acts the core routing holds beneath an approver (6.9 note D-4).
const CORE_ACT_OPTIONS = ACT_OPTIONS.filter((o) => ["P", "JP", "R", "JR"].includes(o.value));

function coreLevelFields(offices: { code: string; nameEn: string }[]): Field[] {
  return [
    { kind: "hidden", name: "authorityMatrixId" },
    {
      kind: "select",
      name: "approverCode",
      label: "Approved by",
      required: true,
      placeholder: "Choose",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
      orphanLabel: "An office no longer configured",
      hint: "The office whose approvals carry this chain beneath them. The offices beneath it are added on the row.",
    },
    { kind: "text", name: "clause", label: "Clause", hint: "Where your manual states this chain." },
    { kind: "select", name: "provenance", label: "Where this comes from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
    { kind: "textarea", name: "note", label: "Note" },
  ];
}

export function AddCoreLevel({ matrixId, offices }: { matrixId: string; offices: { code: string; nameEn: string }[] }) {
  return (
    <RecordEditor
      title="Add a core routing row"
      description="The chain beneath every approval by one office. None: the office approves alone."
      fields={coreLevelFields(offices)}
      values={{ authorityMatrixId: matrixId }}
      action={saveCoreLevel}
      submitLabel="Add row"
      trigger={{ label: "Add core routing", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function EditCoreLevel({
  matrixId,
  offices,
  level,
  officeName,
}: {
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  level: { id: string; approverCode: string; clause: string; provenance: string; note: string };
  officeName: string;
}) {
  return (
    <RecordEditor
      title={`Edit the core routing for ${officeName}`}
      fields={[{ kind: "hidden", name: "id" }, ...coreLevelFields(offices)]}
      values={{ id: level.id, authorityMatrixId: matrixId, approverCode: level.approverCode, clause: level.clause, provenance: level.provenance, note: level.note }}
      action={saveCoreLevel}
      trigger={{ label: `Edit the core routing for ${officeName}`, iconOnly: <PencilIcon size={14} />, className: iconButtonClass("sm") }}
      size="md"
    />
  );
}

export function RemoveCoreLevel({ id, officeName }: { id: string; officeName: string }) {
  return (
    <RecordEditor
      title={`Remove the core routing for ${officeName}`}
      description="Removes this row and all beneath it. Core-chain rules will not issue."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={removeCoreLevel}
      submitLabel="Remove row"
      destructive={{ reasonLabel: "Why is it coming out?" }}
      trigger={{ label: `Remove the core routing for ${officeName}`, iconOnly: <XIcon size={14} />, className: iconButtonClass("sm") }}
      size="sm"
    />
  );
}

export function AddCoreStep({ levelId, officeName, offices }: { levelId: string; officeName: string; offices: { code: string; nameEn: string }[] }) {
  return (
    <RecordEditor
      title={`Add an office beneath ${officeName}`}
      description="An office that acts before the approver on every approval it gives, in order."
      fields={[
        { kind: "hidden", name: "coreRoutingLevelId" },
        { kind: "select", name: "roleCode", label: "Office", required: true, placeholder: "Choose", options: offices.map((o) => ({ value: o.code, label: o.nameEn })) },
        { kind: "select", name: "act", label: "Acts as", required: true, placeholder: "Choose", options: CORE_ACT_OPTIONS, hint: "The core routing holds proposing and recommending. A mandatory recommendation belongs on the rule that needs it." },
        { kind: "number", name: "sequence", label: "Place in the chain", min: 1, hint: "1 is first. Leave empty to add it at the end." },
        { kind: "select", name: "provenance", label: "Where this comes from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "text", name: "note", label: "Note" },
      ]}
      values={{ coreRoutingLevelId: levelId }}
      action={saveCoreStep}
      submitLabel="Add office"
      trigger={{ label: `Add an office beneath ${officeName}`, iconOnly: <PlusIcon size={15} />, className: iconButtonClass("sm") }}
      size="sm"
    />
  );
}

export function RemoveCoreStep({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Takes this office out of the core routing row on the draft."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={removeCoreStep}
      submitLabel="Remove"
      destructive={{ reasonLabel: "Why is it coming out?" }}
      trigger={{ label: `Remove ${label}`, iconOnly: <XIcon size={13} />, className: iconButtonClass("sm", false, "size-6") }}
      size="sm"
    />
  );
}
