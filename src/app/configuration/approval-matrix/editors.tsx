import { PencilIcon, XIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass, iconButtonClass } from "@/components/ui/button";

import {
  issueDraft,
  removeRecommender,
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

const matrixFields: Field[] = [
  {
    kind: "text",
    name: "label",
    label: "Issue",
    required: true,
    hint: "How this issue of the limits is cited — a revision number, a resolution date.",
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
    hint: "Where the quotation band ends and the tender band begins.",
  },
  {
    kind: "money",
    name: "boundaryValue",
    label: "Where the bands meet",
    required: true,
    hint: "The same figure as the tender floor.",
  },
  {
    kind: "switch",
    name: "boundaryInclusive",
    label: "A value exactly on the boundary falls in the lower band",
    hint: "Where governing documents disagree, this is the switch. It affects that one exact figure and nothing else.",
  },
  { kind: "money", name: "requisitionBoundary", label: "Requisition boundary", required: true },
  {
    kind: "number",
    name: "splittingWindowDays",
    label: "Anti-splitting window (days)",
    min: 0,
  },
  { kind: "text", name: "currency", label: "Currency", required: true },
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

export function AddMatrix() {
  return (
    <RecordEditor
      title="Draft the first issue of the limits"
      description="A draft is editable and routes nothing. Add its rules, then issue it."
      fields={matrixFields}
      action={saveMatrix}
      submitLabel="Create draft"
      trigger={{ label: "Draft the first issue", icon: true, className: buttonClass("primary", "sm") }}
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
  splittingWindowDays: number;
  currency: string;
  noRuleClause: string | null;
  selfApprovalClause: string | null;
  absenceClause: string | null;
  funderOverrideClause: string | null;
}

export function EditMatrix({ matrix }: { matrix: MatrixValues }) {
  return (
    <RecordEditor
      title={`Edit ${matrix.label}`}
      description="A draft. Nothing here is in force until it is issued."
      fields={[{ kind: "hidden", name: "id" }, ...matrixFields]}
      action={saveMatrix}
      trigger={{ label: "Edit thresholds", className: buttonClass("secondary", "sm") }}
      size="lg"
      values={{
        id: matrix.id,
        label: matrix.label,
        effectiveFrom: day(matrix.effectiveFrom),
        boundaryValue: String(matrix.boundaryValue),
        boundaryInclusive: matrix.boundaryInclusive,
        quotationFloor: String(matrix.quotationFloor),
        tenderFloor: String(matrix.tenderFloor),
        requisitionBoundary: String(matrix.requisitionBoundary),
        splittingWindowDays: String(matrix.splittingWindowDays),
        currency: matrix.currency,
        noRuleClause: matrix.noRuleClause,
        selfApprovalClause: matrix.selfApprovalClause,
        absenceClause: matrix.absenceClause,
        funderOverrideClause: matrix.funderOverrideClause,
      }}
    />
  );
}

function ruleFields(offices: { code: string; nameEn: string }[]): Field[] {
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
    { kind: "money", name: "minValue", label: "From value" },
    { kind: "money", name: "maxValue", label: "To value" },
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
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "note", label: "Note" },
  ];
}

export function AddRule({
  matrixId,
  offices,
}: {
  matrixId: string;
  offices: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title="Add a rule"
      description="Who proposes, who recommends and who approves, at one band of value."
      fields={ruleFields(offices)}
      values={{ authorityMatrixId: matrixId }}
      action={saveRule}
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
  minValue: number | null;
  maxValue: number | null;
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
}

export function EditRule({
  rule,
  matrixId,
  offices,
}: {
  rule: RuleValues;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title={`Edit ${rule.labelEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...ruleFields(offices)]}
      action={saveRule}
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
        minValue: rule.minValue == null ? null : String(rule.minValue),
        maxValue: rule.maxValue == null ? null : String(rule.maxValue),
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
      trigger={{ label: "Add recommender", icon: true, className: buttonClass("ghost", "sm") }}
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
      title="Start a new revision"
      description={`A draft copy of ${fromLabel} — every threshold, clause and rule. Change it, then issue it; ${fromLabel} stays in force until then and is kept afterwards.`}
      fields={[
        { kind: "hidden", name: "fromId" },
        {
          kind: "text",
          name: "label",
          label: "Label",
          required: true,
          hint: "How the new issue is cited — a revision number, a resolution date.",
        },
        { kind: "date", name: "effectiveFrom", label: "Meant to start", required: true },
      ]}
      values={{ fromId }}
      action={startRevision}
      submitLabel="Create draft"
      trigger={{ label: "New revision", icon: true, className: buttonClass("primary", "sm") }}
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
}: {
  id: string;
  label: string;
  meantFrom: Date;
  replaces: string | null;
}) {
  return (
    <RecordEditor
      title={`Issue ${label}`}
      description={
        replaces
          ? `From the date below it routes every matter, ${replaces} ends, and neither can be changed again. A change after that is a new revision.`
          : "From the date below it routes every matter and can no longer be changed. A change after that is a new revision."
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
      ]}
      values={{ id, effectiveFrom: day(meantFrom) }}
      action={issueDraft}
      submitLabel="Issue it"
      trigger={{ label: "Issue", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
