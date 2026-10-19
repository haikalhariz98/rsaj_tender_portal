"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { SERVICE_UNIT_ASSUMED, SERVICE_UNIT_ASSUMED_NOTE } from "@/lib/portal/projects/labels";
import { saveClockRule, saveContractorPortalSigning, saveKindSetting, savePaymentPolicy, savePostAwardPolicy, saveSubmissionServiceLevel, saveVariationPolicy } from "./actions";

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
        { kind: "text", name: "inDelayProgressPct", label: "In Delay below this share of planned progress (%)", hint: "Unset: In Delay is not judged on progress (a lapsed completion date still is)." },
        provenance("inDelayProvenance", "Where the percentage came from"),
        { kind: "select", name: "soReResolve", label: "The S.O. changes when an adjustment moves the contract sum across a band", placeholder: "Not decided", options: [{ value: "yes", label: "Yes: resolved again at the new sum" }, { value: "no", label: "No: the S.O. stays as resolved" }] },
        provenance("soReResolveProvenance", "Where that came from"),
        form("delegationLetterConventionalId", "Letter of delegation, conventional contracts", forms),
        form("delegationNoticeConventionalId", "Notification of delegation, conventional contracts", forms),
        form("delegationLetterDesignBuildId", "Letter of delegation, design and build and turnkey", forms),
        form("delegationNoticeDesignBuildId", "Notification of delegation, design and build and turnkey", forms),
        provenance("delegationFormsProvenance", "Where the forms came from"),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={savePostAwardPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit controls", className: buttonClass("primary", "sm") }}
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
        provenance("unfixedMaterialsProvenance", "Where the allowance came from"),
        pctField("firstReleasePct", "First release of retention (%)", "The share released at practical completion. Unset: the first release is refused, naming this setting."),
        provenance("firstReleaseProvenance", "Where the release came from"),
        { kind: "select", name: "paymentRouteFigure", label: "The figure an interim certificate is routed on", placeholder: "Not set", options: figures, hint: "Unset: an interim certificate cannot be sent for approval." },
        provenance("paymentRouteProvenance", "Where that came from"),
        { kind: "select", name: "waterfallRemainder", label: "Where the sen of a pro-rata split go", placeholder: "Not set", options: remainders, hint: "Unset: a certificate that cannot pay every party in full is refused." },
        provenance("waterfallProvenance", "Where that came from"),
        { kind: "number", name: "preExecutionInterimLimit", label: "Interim certificates that may issue before the contract is signed", min: 0, hint: "Unset: none issues before the contract is executed." },
        provenance("preExecutionProvenance", "Where the number came from"),
      ]}
      values={values}
      action={savePaymentPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit", className: buttonClass("secondary", "sm") }}
    />
  );
}

/// The form a certificate kind prints on and the routing sheet it goes on.
export function EditKindSetting({ kind, label, values, forms, sheets, noSheet = false }: { kind: string; label: string; values: Record<string, string | null>; forms: Option[]; sheets: Option[]; noSheet?: boolean }) {
  return (
    <RecordEditor
      title={label}
      description={noSheet ? "The form this certificate prints on. It is approved on its variation's own routes, so it takes no routing sheet. Without a form it cannot be raised." : "The form this certificate prints on, and the routing sheet it goes on before it is signed. Without a form it cannot be raised."}
      fields={[
        { kind: "hidden", name: "certificateKind" },
        form("templateId", "Form", forms),
        ...(noSheet ? [] : [{ kind: "select", name: "routingTypeId", label: "Routing sheet", placeholder: sheets.length ? "None: no routing sheet" : "No routing sheets configured", options: sheets } as Field]),
        { kind: "select", name: "provenance", label: "Where these came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
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
        provenance("provenance", "Where it came from"),
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

/// Phase 4e: the service level a contractor's submission of a kind is answered against (calendar days, assumed). Ships unset.
export function EditSubmissionServiceLevel({ kind, label, values }: { kind: string; label: string; values: Record<string, string | null> }) {
  return (
    <RecordEditor
      title={label}
      description={`Days to answer, from sending. ${SERVICE_UNIT_ASSUMED_NOTE.en} Empty: not set.`}
      columns={2}
      fields={[
        { kind: "hidden", name: "kind" },
        { kind: "number", name: "serviceLevelDays", label: SERVICE_UNIT_ASSUMED.en, min: 1 },
        provenance("provenance", "Where it came from"),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{ ...values, kind }}
      action={saveSubmissionServiceLevel}
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
      description="Whether a contractor's portal account may sign these blocks. Undecided: the portal refuses."
      columns={2}
      fields={[
        { kind: "select", name: "contractorPortalSigning", label: "A contractor's portal account signs for it", placeholder: "Not decided", options: [{ value: "yes", label: "Yes: its account signs, with its password" }, { value: "no", label: "No: on paper only" }] },
        provenance("contractorPortalSigningProvenance", "Where that came from"),
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
        { kind: "select", name: "variationPctBasis", label: "A variation's percentage is of", placeholder: "Not set", options: bases, hint: "Unset: a variation cannot be submitted or sent for approval." },
        { kind: "select", name: "variationBase", label: "Taken over", placeholder: "Not set", options: sums, hint: "Also the contract value its band is read at." },
        provenance("variationProvenance", "Where that came from"),
        { kind: "select", name: "scheduleFormAgreedRate", label: "The schedule form where an agreed rate exists", placeholder: "Not set", options: forms },
        { kind: "select", name: "scheduleFormNoAgreedRate", label: "The schedule form where none does", placeholder: "Not set", options: forms, hint: "Unset: the instruction is refused, naming this setting." },
        provenance("scheduleFormProvenance", "Where those came from"),
        { kind: "select", name: "funderConsentCommitteeId", label: "The committee that decides a funder's consent", placeholder: committees.length ? "Not set" : "No committees configured", options: committees, hint: "Unset: a variation affecting a funder's assets cannot be tabled for consent." },
        provenance("funderConsentProvenance", "Where that came from"),
      ]}
      values={values}
      action={saveVariationPolicy}
      reason={{ label: "Why the controls are changed" }}
      submitLabel="Save controls"
      trigger={{ label: "Edit", className: buttonClass("secondary", "sm") }}
    />
  );
}
