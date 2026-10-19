import { RecordEditor } from "@/components/record-editor";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { buttonClass } from "@/components/ui/button";
import { TIER_LABEL } from "@/lib/requisition/labels";
import type { RequisitionPolicy } from "@/lib/requisition/types";

import { ACT_LABEL } from "@/lib/labels";

import { saveBudgetCheckSource, saveErpFormat, saveGateRule, savePolicy } from "./actions";

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working choice awaiting sign-off" },
];

/// Every field starts empty where nothing is set; saving an empty field leaves it unset.
export function EditPolicy({
  policy,
  notes,
  label = "Edit controls",
  quiet = false,
}: {
  policy: RequisitionPolicy;
  notes: string;
  /// The trigger's words: "Set it" where it sits beside an unset control.
  label?: string;
  quiet?: boolean;
}) {
  return (
    <RecordEditor
      title="Edit requisition controls"
      description="Nothing is proposed for you. Empty stays not set."
      fields={[
        { kind: "note", text: "Endorsement" },
        {
          kind: "tokens",
          name: "endorsementTiers",
          label: "Tiers whose heads endorse",
          options: (["SECTION", "DEPARTMENT", "DIVISION"] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
          hint: "Head of each tier's unit. Empty blocks endorsement.",
        },
        { kind: "note", text: "Budget check" },
        { kind: "number", name: "budgetRecheckDays", label: "Re-check on submission when the check is older than (days)", min: 0, hint: "Empty: a check never goes stale." },
        { kind: "select", name: "provenance", label: "Where these controls come from", placeholder: "Not set", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{
        endorsementTiers: policy.endorsementTiers.join("\n"),
        budgetRecheckDays: policy.budgetRecheckDays == null ? null : String(policy.budgetRecheckDays),
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
      description="The portal's ledger, or figures typed from finance. Not set: no check."
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
      description="A pattern the whole number must match. Cleared: not checked."
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
      description="A committee an approved requisition must pass first. Outside the approval matrix."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "fundingRouteCode", label: "Funding route", required: true, placeholder: "Choose", options: routes, orphanLabel: "A route no longer configured" },
        { kind: "select", name: "committeeCode", label: "Committee", required: true, placeholder: "Choose", options: committees, orphanLabel: "A committee no longer configured" },
        { kind: "text", name: "subjectEn", label: "What is put to it", required: true, placeholder: "e.g. Project proposal and technical working paper" },
        { kind: "hidden", name: "subjectMs" },
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
