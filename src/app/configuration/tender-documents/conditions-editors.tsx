import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { restoreClause, restoreRegistrationBody, retireClause, retireRegistrationBody, saveClause, saveRegistrationBody } from "./conditions-actions";

/**
 * Configuration › Tender documents drawers for increment 2: registration bodies and clauses.
 * No field carries a default: an unset value is not set, and the screen says what that
 * holds back. A value set says where it came from.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const PROVENANCE_OPTIONS: Option[] = [
  { value: "STATED", label: "Stated: written in a governing document" },
  { value: "OBSERVED", label: "Observed: seen in practice" },
  { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
];
const THREE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unset", label: "Not set" },
];

export function BodyDrawer({ body }: { body?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={body ? `Edit ${body.name}` : "Add a registration body"}
      description="A body bidders register with. Exercises list the ones they require."
      columns={2}
      fields={[
        hidden("id"),
        ...(body ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Lower case, numbers, underscores. Cannot be changed." } as Field]),
        { kind: "text", name: "labelEn", label: "Name", required: true, hint: "As the notice prints it." },
        { kind: "hidden", name: "labelMs" },
        { kind: "text", name: "qualifierLabelEn", label: "What an exercise states with it", hint: "E.g. grade, category, specialisation. Empty: nothing." },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        { kind: "text", name: "governingSource", label: "Where it is required", hint: "The document that asks for it." },
        { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={body ? { ...body.values, id: body.id } : undefined}
      action={saveRegistrationBody}
      submitLabel={body ? "Save" : "Add the body"}
      trigger={body ? { label: "Edit", className: ghost, ariaLabel: `Edit ${body.name}` } : { label: "Add a registration body", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function ClauseDrawer({ clause }: { clause?: { id: string; title: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={clause ? `Edit ${clause.title}` : "Add a clause"}
      description="A clause a template cites. A change raises its text version. Frozen documents keep theirs."
      columns={2}
      fields={[
        hidden("id"),
        ...(clause ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Lower case, numbers, underscores. Templates cite it." } as Field]),
        { kind: "text", name: "titleEn", label: "Title", required: true },
        { kind: "hidden", name: "titleMs" },
        { kind: "select", name: "mandatoryInAgreements", label: "Every agreement carries it", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Not set holds every submission back." },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        { kind: "textarea", name: "bodyEn", label: "Text (English)", required: true },
        { kind: "textarea", name: "bodyMs", label: "Text (Malay)", hint: "Needed where a Malay template cites it." },
        { kind: "text", name: "governingSource", label: "Where it is required", hint: "The document that asks for it." },
        { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={clause ? { ...clause.values, id: clause.id } : undefined}
      action={saveClause}
      submitLabel={clause ? "Save" : "Add the clause"}
      trigger={clause ? { label: "Edit", className: ghost, ariaLabel: `Edit ${clause.title}` } : { label: "Add a clause", icon: true, className: secondary }}
      size="xl"
    />
  );
}

export function RetireDrawer({ kind, id, label }: { kind: "body" | "clause"; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description={kind === "body" ? "Exercises cannot add it from this day. Can be restored." : "Not judged against from this day. Frozen documents keep it. Can be restored."}
      fields={[hidden("id"), { kind: "date", name: "retiredOn", label: "Retired from", required: true }]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is retired" }}
      cancelLabel="Keep it"
      action={kind === "body" ? retireRegistrationBody : retireClause}
      submitLabel={kind === "body" ? "Retire the body" : "Retire the clause"}
      trigger={{ label: "Retire", className: buttonClass("destructive", "sm"), ariaLabel: `Retire ${label}` }}
      size="sm"
    />
  );
}

export function RestoreDrawer({ kind, id, label }: { kind: "body" | "clause"; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Restore ${label}`}
      description="It is used again from now on."
      fields={[hidden("id")]}
      values={{ id }}
      reason={{ label: "Why it is restored" }}
      action={kind === "body" ? restoreRegistrationBody : restoreClause}
      submitLabel="Restore"
      trigger={{ label: "Restore", className: secondary, ariaLabel: `Restore ${label}` }}
      size="sm"
    />
  );
}
