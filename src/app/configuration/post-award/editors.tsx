"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { saveClockRule, saveContractorPortalSigning, saveKindSetting, savePaymentPolicy, savePostAwardPolicy, saveVariationPolicy } from "./actions";

/**
 * The Post-award controls drawer. No field carries a default: an unset field is not set, and the screen says
 * what that stops.
 */

type Option = { value: string; label: string };
const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];
const provenance = (name: string, label: string): Field => ({ kind: "select", name, label, placeholder: "Not recorded", options: PROVENANCE_OPTIONS });
const form = (name: string, label: string, forms: Option[]): Field => ({ kind: "select", name, label, placeholder: forms.length ? "Not set" : "No forms configured under Templates", options: forms });

export function EditPostAwardPolicy({ values, forms }: { values: Record<string, string | boolean | null>; forms: Option[] }) {
  return (
    <RecordEditor
      title="Post-award controls"
      description="Every setting starts unset. Screens say what an unset one stops."
      size="lg"
      columns={2}
      fields={[
        { kind: "text", name: "inDelayProgressPct", label: "In Delay below this share of planned progress (%)", hint: "Unset: In Delay ignores progress." },
        provenance("inDelayProvenance", "Basis (In Delay)"),
        { kind: "select", name: "soReResolve", label: "The S.O. changes when an adjustment moves the contract sum across a band", placeholder: "Not decided", options: [{ value: "yes", label: "Yes: resolved again at the new sum" }, { value: "no", label: "No: the S.O. stays as resolved" }] },
        provenance("soReResolveProvenance", "Basis (S.O.)"),
        form("delegationLetterConventionalId", "Letter of delegation, conventional contracts", forms),
        form("delegationNoticeConventionalId", "Notification of delegation, conventional contracts", forms),
        form("delegationLetterDesignBuildId", "Letter of delegation, design and build and turnkey", forms),
        form("delegationNoticeDesignBuildId", "Notification of delegation, design and build and turnkey", forms),
        provenance("delegationFormsProvenance", "Basis (delegation forms)"),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={savePostAwardPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm"), ariaLabel: "Edit supervision and delegation letters" }}
    />
  );
}

const pctField = (name: string, label: string, hint: string): Field => ({ kind: "text", name, label, hint });

/// The interim payment controls (6.13 Part A step 3). Each ships unset; the screen says what an unset one stops.
export function EditPaymentPolicy({ values, figures, remainders }: { values: Record<string, string | null>; figures: Option[]; remainders: Option[] }) {
  return (
    <RecordEditor
      title="Interim payment controls"
      description="A contract's own baseline figure wins. Each setting starts unset."
      size="lg"
      columns={2}
      fields={[
        pctField("unfixedMaterialsDefaultPct", "Allowance on unfixed materials (%)", "Where the contract states none. Unset: a materials line is refused, naming this setting."),
        provenance("unfixedMaterialsProvenance", "Basis (allowance)"),
        pctField("firstReleasePct", "First release of retention (%)", "The share released at practical completion. Unset: the first release is refused, naming this setting."),
        provenance("firstReleaseProvenance", "Basis (release)"),
        { kind: "select", name: "paymentRouteFigure", label: "The figure an interim certificate is routed on", placeholder: "Not set", options: figures, hint: "Unset: no interim certificate can be sent." },
        provenance("paymentRouteProvenance", "Basis (routing figure)"),
        { kind: "select", name: "waterfallRemainder", label: "Odd sen when a payment is shared", placeholder: "Not set", options: remainders, hint: "Unset: underpaying certificates are refused." },
        provenance("waterfallProvenance", "Basis (odd sen)"),
        { kind: "number", name: "preExecutionInterimLimit", label: "Interim certificates that may issue before the contract is signed", min: 0, hint: "Unset: none issues before the contract is executed." },
        provenance("preExecutionProvenance", "Basis (limit before signing)"),
      ]}
      values={values}
      action={savePaymentPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm"), ariaLabel: "Edit interim payment controls" }}
    />
  );
}

/// The form a certificate kind prints on and the routing sheet it goes on.
export function EditKindSetting({ kind, label, values, forms, sheets, noSheet = false }: { kind: string; label: string; values: Record<string, string | null>; forms: Option[]; sheets: Option[]; noSheet?: boolean }) {
  return (
    <RecordEditor
      title={label}
      description={noSheet ? "The form it prints on. Without one it cannot be raised." : "The form and routing sheet it uses. Without a form it cannot be raised."}
      fields={[
        { kind: "hidden", name: "certificateKind" },
        form("templateId", "Form", forms),
        ...(noSheet ? [] : [{ kind: "select", name: "routingTypeId", label: "Routing sheet", placeholder: sheets.length ? "None: no routing sheet" : "No routing sheets configured", options: sheets } as Field]),
        { kind: "select", name: "provenance", label: "Basis", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{ ...values, certificateKind: kind }}
      action={saveKindSetting}
      reason={{ label: "Why it is changed" }}
      submitLabel="Save"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm") }}
    />
  );
}

/// A contract clock: its length, unit and where it came from. Saved empty, it is removed (with the reason).
export function EditClockRule({ clock, label, values }: { clock: string; label: string; values: Record<string, string | null> }) {
  return (
    <RecordEditor
      title={label}
      description="Empty removes it: screens then say it is not set."
      columns={2}
      fields={[
        { kind: "hidden", name: "clock" },
        { kind: "number", name: "length", label: "Length", min: 1 },
        { kind: "select", name: "unit", label: "Unit", placeholder: "Choose", options: [{ value: "DAYS", label: "Calendar days" }, { value: "WEEKS", label: "Weeks" }, { value: "MONTHS", label: "Months" }] },
        provenance("provenance", "Basis"),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{ ...values, clock }}
      action={saveClockRule}
      reason={{ label: "Why it is changed" }}
      submitLabel="Save"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm") }}
    />
  );
}

/// Phase 4e review fix: whether a contractor's own portal account signs for it. Ships unset.
export function EditContractorPortalSigning({ values }: { values: Record<string, string | null> }) {
  return (
    <RecordEditor
      title="A contractor signs from its portal account"
      description="Whether its portal account may sign these blocks and accept an award. Undecided: refused."
      columns={2}
      fields={[
        { kind: "select", name: "contractorPortalSigning", label: "A contractor's portal account signs and accepts an award", placeholder: "Not decided", options: [{ value: "yes", label: "Yes: its account signs, with its password" }, { value: "no", label: "No: on paper only" }] },
        provenance("contractorPortalSigningProvenance", "Basis"),
      ]}
      values={values}
      action={saveContractorPortalSigning}
      reason={{ label: "Why it is changed" }}
      submitLabel="Save"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm") }}
    />
  );
}

/// The variation controls (6.13 Part A step 4: OD-A2, OD-A5, FR-VAR-009). Each ships unset.
export function EditVariationPolicy({ values, bases, sums, forms, committees }: { values: Record<string, string | null>; bases: Option[]; sums: Option[]; forms: Option[]; committees: Option[] }) {
  return (
    <RecordEditor
      title="Variation controls"
      description="Each setting starts unset. Screens say what an unset one stops."
      size="lg"
      columns={2}
      fields={[
        { kind: "select", name: "variationPctBasis", label: "A variation's percentage is of", placeholder: "Not set", options: bases, hint: "Unset: variations cannot be submitted." },
        { kind: "select", name: "variationBase", label: "Taken over", placeholder: "Not set", options: sums, hint: "Also the contract value its band reads." },
        provenance("variationProvenance", "Basis (percentage)"),
        { kind: "select", name: "scheduleFormAgreedRate", label: "The schedule form where an agreed rate exists", placeholder: "Not set", options: forms },
        { kind: "select", name: "scheduleFormNoAgreedRate", label: "The schedule form where none does", placeholder: "Not set", options: forms, hint: "Unset: the instruction is refused, naming this setting." },
        provenance("scheduleFormProvenance", "Basis (schedule forms)"),
        { kind: "select", name: "funderConsentCommitteeId", label: "The committee that decides a funder's consent", placeholder: committees.length ? "Not set" : "No committees configured", options: committees, hint: "Unset: consent cannot be tabled." },
        provenance("funderConsentProvenance", "Basis (funder consent)"),
      ]}
      values={values}
      action={saveVariationPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit", className: buttonClass("ghost", "sm"), ariaLabel: "Edit variation controls" }}
    />
  );
}
