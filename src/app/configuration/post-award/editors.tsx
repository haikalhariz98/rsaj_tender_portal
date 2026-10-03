"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { savePostAwardPolicy } from "./actions";

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
      description="How this organisation supervises a contract after it is executed. Every setting starts unset, and the screens say what an unset one stops."
      size="lg"
      columns={2}
      fields={[
        { kind: "text", name: "inDelayProgressPct", label: "In Delay below this share of planned progress (%)", placeholder: "e.g. 70", hint: "Unset: In Delay is not judged on progress (a lapsed completion date still is)." },
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
