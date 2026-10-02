import { RecordEditor } from "@/components/record-editor";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { buttonClass } from "@/components/ui/button";
import { SPLIT_KEY_LABEL, TIER_LABEL } from "@/lib/requisition/labels";
import { SPLIT_KEYS, type RequisitionPolicy } from "@/lib/requisition/types";

import { ACT_LABEL } from "@/lib/labels";

import { saveBudgetCheckSource, saveErpFormat, saveGateRule, savePolicy } from "./actions";

const TRI = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const tri = (v: boolean | null) => (v == null ? null : v ? "yes" : "no");
const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working choice awaiting sign-off" },
];

/// Every field starts empty where nothing is set; saving an empty field leaves it unset.
export function EditPolicy({
  policy,
  notes,
  offices,
  label = "Edit controls",
  quiet = false,
}: {
  policy: RequisitionPolicy;
  notes: string;
  offices: { code: string; nameEn: string }[];
  /// The trigger's words: "Set it" where it sits beside an unset control.
  label?: string;
  quiet?: boolean;
}) {
  return (
    <RecordEditor
      title="Edit requisition controls"
      description="Nothing is proposed for you. A field left empty stays not set, and the screen says what that stops."
      fields={[
        { kind: "note", text: "Endorsement" },
        {
          kind: "tokens",
          name: "endorsementTiers",
          label: "Tiers whose heads endorse",
          options: (["SECTION", "DEPARTMENT", "DIVISION"] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
          hint: "The head of each tier's unit on the requesting unit's path. Empty: nothing can be endorsed or submitted.",
        },
        { kind: "note", text: "Registration" },
        {
          kind: "select",
          name: "erpReferenceRequired",
          label: "Registration needs the finance system's numbers",
          placeholder: "Not set — registration is refused",
          options: TRI,
        },
        { kind: "note", text: "Budget check" },
        { kind: "number", name: "budgetRecheckDays", label: "Re-check on submission when the check is older than (days)", min: 0, hint: "Empty: a check never goes stale." },
        { kind: "note", text: "Anti-splitting. No governing document sets these; they are the customer's decision." },
        { kind: "number", name: "splittingWindowDays", label: "Window (days)", min: 1 },
        {
          kind: "tokens",
          name: "splittingMatchOn",
          label: "Requisitions are related when they share",
          options: SPLIT_KEYS.map((k) => ({ value: k, label: SPLIT_KEY_LABEL[k] })),
        },
        {
          kind: "select",
          name: "splittingAggregateAcrossYear",
          label: "Also relate everything in the same financial year",
          placeholder: "Not set — not assessed",
          options: TRI,
        },
        {
          kind: "select",
          name: "splitJustifyingRoleCode",
          label: "The office that may justify a possible split",
          placeholder: "Not set — no flag can be justified",
          options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
          orphanLabel: "An office no longer configured",
          hint: "Its holder for the requesting department. Never the requester, nor anyone who endorsed it.",
        },
        { kind: "select", name: "provenance", label: "Where these controls come from", placeholder: "Not set", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{
        endorsementTiers: policy.endorsementTiers.join("\n"),
        erpReferenceRequired: tri(policy.erpReferenceRequired),
        budgetRecheckDays: policy.budgetRecheckDays == null ? null : String(policy.budgetRecheckDays),
        splittingWindowDays: policy.splittingWindowDays == null ? null : String(policy.splittingWindowDays),
        splittingMatchOn: policy.splittingMatchOn.join("\n"),
        splittingAggregateAcrossYear: tri(policy.splittingAggregateAcrossYear),
        splitJustifyingRoleCode: policy.splitJustifyingRoleCode,
        provenance: policy.provenance,
        notes,
      }}
      action={savePolicy}
      reason={{ label: "Why are the controls changing?" }}
      trigger={{ label, className: buttonClass(quiet ? "secondary" : "primary", "sm") }}
      size="lg"
    />
  );
}

export function EditCheckSource({ source }: { source: string | null }) {
  return (
    <RecordEditor
      title="Where the budget check comes from"
      description="The portal's own budget ledger, or figures typed in by hand from the finance system. Not set, no check can run."
      fields={[
        {
          kind: "select",
          name: "budgetCheckSource",
          label: "Budget check source",
          placeholder: "Not set",
          options: [
            { value: "PORTAL_LEDGER", label: "The portal's budget ledger" },
            { value: "MANUAL_ERP_ENTRY", label: "Entered by hand from the finance system" },
          ],
        },
      ]}
      values={{ budgetCheckSource: source }}
      action={saveBudgetCheckSource}
      reason={{ label: "Why is the source changing?" }}
      trigger={{ label: "Set source", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function EditErpFormat({
  formatKey,
  label,
  current,
}: {
  formatKey: "erp_requisition_no" | "erp_note_no" | "erp_indent_no";
  label: string;
  current: { pattern: string; example: string; description: string; provenance: string } | null;
}) {
  return (
    <RecordEditor
      title={`${label}: format`}
      description="A regular expression the whole number must match, with an example for the officer. Cleared, the number is not checked."
      fields={[
        { kind: "hidden", name: "key" },
        { kind: "text", name: "pattern", label: "Pattern", mono: true },
        { kind: "text", name: "example", label: "Example", mono: true },
        { kind: "text", name: "description", label: "Description" },
        { kind: "select", name: "provenance", label: "Where the shape comes from", placeholder: "Not set", options: PROVENANCE_OPTIONS },
      ]}
      values={{ key: formatKey, pattern: current?.pattern ?? null, example: current?.example ?? null, description: current?.description ?? null, provenance: current?.provenance ?? null }}
      action={saveErpFormat}
      reason={{ label: "Why is the format changing?" }}
      trigger={{ label: "Set format", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

/// A committee gate rule (FR-REQ-012). Added, or edited with a reason: ending one is
/// setting "In force to".
export function GateRuleEditor({
  rule,
  routes,
  committees,
}: {
  rule?: { id: string; fundingRouteCode: string; committeeCode: string; subjectEn: string; subjectMs: string | null; act: string; aboveValue: string | null; governingSource: string; provenance: string; effectiveFrom: string; effectiveTo: string | null; sortOrder: number };
  routes: { value: string; label: string }[];
  committees: { value: string; label: string }[];
}) {
  return (
    <RecordEditor
      title={rule ? "Edit committee gate" : "Add committee gate"}
      description="A committee an approved requisition on this funding route must pass before its first sourcing exercise. Outside the approval matrix. A requisition already approved keeps the gates it was given."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "fundingRouteCode", label: "Funding route", required: true, placeholder: "Choose", options: routes, orphanLabel: "A route no longer configured" },
        { kind: "select", name: "committeeCode", label: "Committee", required: true, placeholder: "Choose", options: committees, orphanLabel: "A committee no longer configured" },
        { kind: "text", name: "subjectEn", label: "What is put to it", required: true, placeholder: "e.g. Project proposal and technical working paper" },
        { kind: "text", name: "subjectMs", label: "What is put to it (Malay)" },
        { kind: "select", name: "act", label: "The committee's act", required: true, placeholder: "Choose", options: Object.entries(ACT_LABEL).map(([value, label]) => ({ value, label: `${label} (${value})` })) },
        { kind: "money", name: "aboveValue", label: "Applies to requisitions approved above", hint: "Strictly above. Empty: at any value." },
        { kind: "text", name: "governingSource", label: "Source document" },
        { kind: "select", name: "provenance", label: "Where this comes from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
        { kind: "date", name: "effectiveTo", label: END_DAY_LABEL, hint: "Set to end the rule." },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={
        rule
          ? { ...rule, sortOrder: String(rule.sortOrder) }
          : {}
      }
      action={saveGateRule}
      reason={rule ? { label: "Why is the gate changing?" } : undefined}
      trigger={rule ? { label: "Edit", className: buttonClass("ghost", "sm") } : { label: "Add committee gate", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}
