import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import type { AppendixGroup } from "@/lib/tender-docs/appendix";
import { PCT_COLUMN, pctHint } from "@/lib/tender-docs/percent";

import { removeAppendixSection, removeVariationLimit, saveAppendix, saveAppendixSection, saveVariationLimit } from "../documents/actions";

/**
 * The Appendix's drawers (FR-DOC-004). `saveAppendix` saves every field at once, so a drawer
 * for one card carries the other cards' values unchanged as hidden fields: editing one never
 * clears another. No field carries a default; each unset field reads "Not set".
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const LAD_KINDS: Option[] = [
  { value: "AMOUNT_PER_DAY", label: "An amount a day" },
  { value: "PERCENT_OF_SUM_PER_DAY", label: "A percentage of the contract sum a day" },
];
const OFFICER_FIELDS = ["ladOfficerRoleCode", "eotOfficerRoleCode", "terminationOfficerRoleCode", "warRiskOfficerRoleCode", "arbitrationOfficerRoleCode"] as const;

export type Group = AppendixGroup;

/// The fields of each card, in order. Every one is also carried hidden when its card is not the one being edited.
function fieldsOf(offices: Option[], officerLabels: Record<string, string>): Record<Exclude<Group, "all">, Field[]> {
  return {
    officers: OFFICER_FIELDS.map((k) => ({ kind: "select", name: k, label: officerLabels[k], placeholder: "Not set", options: offices }) as Field),
    pc: [
      { kind: "select", name: "pcSumWorksApply", label: "Prime cost sum work", placeholder: "Not set", options: [{ value: "yes", label: "Yes, the contractor may tender for some" }, { value: "no", label: "None" }] },
      { kind: "textarea", name: "pcSumWorksText", label: "Which work", hint: "Which work may be tendered." },
    ],
    insurance: [
      { kind: "money", name: "tplMinimum", label: "Minimum third-party liability insurance" },
      { kind: "money", name: "wcMinimum", label: "Minimum workmen's compensation insurance" },
      { kind: "select", name: "worksInsuranceUpliftKind", label: "Works insurance uplift is stated as", placeholder: "Not set", options: [{ value: "AMOUNT", label: "An amount" }, { value: "PERCENT", label: "A percentage of the contract sum" }] },
      { kind: "money", name: "worksInsuranceUpliftAmount", label: "Uplift amount" },
      { kind: "text", name: "worksInsuranceUpliftPct", label: "Uplift percentage", hint: pctHint(PCT_COLUMN.worksInsuranceUpliftPct) },
      { kind: "money", name: "insuranceExcess", label: "Permitted insurance excess" },
    ],
    lad: [
      { kind: "select", name: "ladKind", label: "Liquidated damages are stated as", placeholder: "Not set", options: LAD_KINDS },
      { kind: "money", name: "ladAmount", label: "Amount a day" },
      { kind: "text", name: "ladPct", label: "Percentage of the contract sum a day", hint: `${pctHint(PCT_COLUMN.ladPct)} Applied at award.` },
    ],
    sectional: [{ kind: "select", name: "sectionalCompletion", label: "Sectional completion", placeholder: "Not set", options: [{ value: "yes", label: "Applies" }, { value: "no", label: "Does not apply" }] }],
    dlp: [
      { kind: "select", name: "dlpApplies", label: "Defects liability period", placeholder: "Not set", options: [{ value: "yes", label: "Applies" }, { value: "no", label: "Does not apply" }] },
      { kind: "number", name: "dlpMonths", label: "Months", min: 1 },
    ],
    interim: [
      { kind: "money", name: "firstInterimMinimum", label: "Minimum for the first interim certificate", hint: "As the tender states it." },
      { kind: "money", name: "subsequentInterimMinimum", label: "Minimum for later interim certificates" },
      { kind: "number", name: "honourCertificateDays", label: "Days to honour a certificate", min: 1 },
    ],
  };
}

const SHOW_WHEN = {
  pcSumWorksText: { name: "pcSumWorksApply", in: ["yes"] },
  worksInsuranceUpliftAmount: { name: "worksInsuranceUpliftKind", in: ["AMOUNT"] },
  worksInsuranceUpliftPct: { name: "worksInsuranceUpliftKind", in: ["PERCENT"] },
  ladAmount: { name: "ladKind", in: ["AMOUNT_PER_DAY"] },
  ladPct: { name: "ladKind", in: ["PERCENT_OF_SUM_PER_DAY"] },
  dlpMonths: { name: "dlpApplies", in: ["yes"] },
};

export function AppendixDrawer({
  exerciseId,
  group,
  allowed,
  values,
  offices,
  officerLabels,
  title,
  primary = false,
}: {
  exerciseId: string;
  group: Group;
  allowed: Allowed;
  /// Every field's stored value, as the form holds it.
  values: Record<string, string>;
  offices: Option[];
  officerLabels: Record<string, string>;
  title: string;
  primary?: boolean;
}) {
  if (!allowed.allowed) return primary ? <Blocked label="Edit the Appendix" reason={allowed.reason} primary noteId="appendix-actions-note" /> : null;
  const all = fieldsOf(offices, officerLabels);
  const shown = group === "all" ? Object.values(all).flat() : all[group];
  const shownNames = new Set(shown.map((f) => ("name" in f ? f.name : "")));
  const carried = Object.values(all).flat().filter((f) => "name" in f && !shownNames.has(f.name)).map((f) => hidden((f as { name: string }).name));
  return (
    <RecordEditor
      title={title}
      description="Every field is required."
      columns={group === "all" ? 2 : 1}
      fields={[hidden("exerciseId"), hidden("group"), ...shown, ...carried]}
      values={{ ...values, exerciseId, group }}
      showWhen={Object.fromEntries(Object.entries(SHOW_WHEN).filter(([k]) => shownNames.has(k)))}
      action={saveAppendix}
      submitLabel="Save"
      trigger={primary ? { label: "Edit the Appendix", className: buttonClass("primary", "sm") } : { label: "Edit", className: ghost, ariaLabel: title }}
      size={group === "all" ? "xl" : "md"}
    />
  );
}

export function LimitDrawer({ exerciseId, holders, limit, allowed }: { exerciseId: string; holders: Option[]; limit?: { id: string; holder: string; raw: { holderCode: string; limit: string } }; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={limit ? `Variation limit of ${limit.holder}` : "Add a variation limit"}
      description="Empty limit stays Not set."
      fields={[hidden("exerciseId"), hidden("id"), { kind: "select", name: "holderCode", label: "Office or committee", required: true, placeholder: "Choose", options: holders }, { kind: "money", name: "limit", label: "Limit" }]}
      values={{ exerciseId, id: limit?.id ?? "", ...(limit?.raw ?? {}) }}
      action={saveVariationLimit}
      submitLabel={limit ? "Save" : "Add the limit"}
      trigger={limit ? { label: "Edit", className: ghost, ariaLabel: `Edit the limit of ${limit.holder}` } : { label: "Add a limit", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RemoveLimitDrawer({ exerciseId, id, holder, allowed }: { exerciseId: string; id: string; holder: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Remove the limit of ${holder}`}
      description="Kept in the history."
      fields={[hidden("exerciseId"), hidden("id")]}
      values={{ exerciseId, id }}
      danger
      cancelLabel="Keep the limit"
      action={removeVariationLimit}
      submitLabel="Remove the limit"
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm"), ariaLabel: `Remove the limit of ${holder}` }}
      size="sm"
    />
  );
}

export function SectionDrawer({ exerciseId, section, allowed }: { exerciseId: string; section?: { id: string; description: string; raw: Record<string, string> }; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={section ? `Edit the section ${section.description}` : "Add a section"}

      fields={[
        hidden("exerciseId"),
        hidden("id"),
        { kind: "text", name: "description", label: "Section", required: true },
        { kind: "select", name: "ladKind", label: "Its liquidated damages are stated as", placeholder: "Not set", options: LAD_KINDS },
        { kind: "money", name: "ladAmount", label: "Amount a day" },
        { kind: "text", name: "ladPct", label: "Percentage of the section's sum a day", hint: pctHint(PCT_COLUMN.sectionLadPct) },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ exerciseId, id: section?.id ?? "", ...(section?.raw ?? {}) }}
      showWhen={{ ladAmount: { name: "ladKind", in: ["AMOUNT_PER_DAY"] }, ladPct: { name: "ladKind", in: ["PERCENT_OF_SUM_PER_DAY"] } }}
      action={saveAppendixSection}
      submitLabel={section ? "Save" : "Add the section"}
      trigger={section ? { label: "Edit", className: ghost, ariaLabel: `Edit the section ${section.description}` } : { label: "Add a section", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RemoveSectionDrawer({ exerciseId, id, description, allowed }: { exerciseId: string; id: string; description: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Remove the section ${description}`}
      description="Kept in the history."
      fields={[hidden("exerciseId"), hidden("id")]}
      values={{ exerciseId, id }}
      danger
      cancelLabel="Keep the section"
      action={removeAppendixSection}
      submitLabel="Remove the section"
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm"), ariaLabel: `Remove the section ${description}` }}
      size="sm"
    />
  );
}
