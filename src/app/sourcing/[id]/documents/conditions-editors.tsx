import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { addRequirement, recordAssurance, recordClauseOverride, removeAssurance, removeClauseOverride, removeRequirement, savePermit, saveRestriction } from "./conditions-actions";

/**
 * The drawers of the Tender documents tab's increment-2 cards. Fields are data; every rule
 * sits in the action and the pure checks behind it. A control the checks already refuse is
 * disabled with the reason beside it. No field carries a default answer.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const THREE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unset", label: "Not answered" },
];

export function AddRequirementDrawer({ exerciseId, allowed, bodies, nextGroup, typeTest }: { exerciseId: string; allowed: Allowed; bodies: Option[]; nextGroup: number; typeTest: string }) {
  if (!allowed.allowed) return <Blocked label="Add a registration" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Add a registration bidders must hold"
      description={`Requirements in the same group are alternatives: any one is enough. Every group is required. The contract type's registration test: ${typeTest}.`}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "bodyCode", label: "Registration body", required: true, placeholder: "Choose", options: bodies },
        { kind: "text", name: "qualifiers", label: "What is required with it", hint: "As the notice should print it: the grade, category and specialisation, or the field codes. Empty for a body that takes nothing." },
        { kind: "number", name: "alternativeGroup", label: "Group", required: true, min: 1, hint: `Use an existing group's number for an alternative, or ${nextGroup} for a new requirement.` },
      ]}
      values={{ exerciseId }}
      action={addRequirement}
      submitLabel="Add the registration"
      trigger={{ label: "Add a registration", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveRequirementDrawer({ exerciseId, id, label, allowed }: { exerciseId: string; id: string; label: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Bidders will no longer be asked for this registration. It stays in the exercise's History."
      fields={[hidden("exerciseId"), hidden("id")]}
      values={{ exerciseId, id }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep it"
      action={removeRequirement}
      submitLabel="Remove the registration"
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm"), ariaLabel: `Remove ${label}` }}
      size="sm"
    />
  );
}

export function RestrictionDrawer({ exerciseId, question, raw, allowed }: { exerciseId: string; question: string; raw: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Answer" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Is the tender restricted?"
      description={`${question}. Where it is, every document the portal generates carries the stamp configured for it. Not answered holds submission back.`}
      fields={[hidden("exerciseId"), { kind: "select", name: "restrictedTender", label: question, required: true, placeholder: "Choose", options: THREE }]}
      values={{ exerciseId, restrictedTender: raw === "unset" ? "" : raw }}
      action={saveRestriction}
      submitLabel="Save"
      trigger={{ label: raw === "unset" ? "Answer" : "Change", className: ghost, ariaLabel: "Answer whether the tender is restricted" }}
      size="md"
    />
  );
}

export function PermitDrawer({ exerciseId, raw, rawPermit, options, list, allowed }: { exerciseId: string; raw: string; rawPermit: string; options: Option[]; list: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Answer" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Do the works need the regulator's permit?"
      description="Where they do, the instructions to tenderers state that the successful bidder must obtain the permit, naming its type. Which type a value needs is the regulator's rule and is not worked out here: choose it."
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "regulatedActivity", label: "Needs the regulator's permit", required: true, placeholder: "Choose", options: THREE },
        options.length
          ? { kind: "select", name: "regulatorPermitCode", label: "Permit type", placeholder: "Not chosen", options, hint: `From the configured list: ${list}.` }
          : { kind: "note", text: "No list of permit types is configured. Choose one under Configuration, Tender documents." },
      ]}
      values={{ exerciseId, regulatedActivity: raw === "unset" ? "" : raw, regulatorPermitCode: rawPermit }}
      showWhen={{ regulatorPermitCode: { name: "regulatedActivity", in: ["yes"] } }}
      action={savePermit}
      submitLabel="Save"
      trigger={{ label: raw === "unset" ? "Answer" : "Change", className: ghost, ariaLabel: "Answer whether the works need the regulator's permit" }}
      size="md"
    />
  );
}

export function ConfirmAssuranceDrawer({ exerciseId, kind, label, people, allowed, today }: { exerciseId: string; kind: string; label: string; people: Option[]; allowed: Allowed; today: string | null }) {
  if (!allowed.allowed) return <Blocked label="Record" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Confirmed: ${label.toLowerCase()}`}
      description="Name who confirmed it and the day: recorded on their behalf, not signed. It belongs to this version; an amended version is confirmed again."
      fields={[
        hidden("exerciseId"),
        hidden("kind"),
        { kind: "select", name: "personId", label: "Confirmed by", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "confirmedOn", label: "Confirmed on", required: true, hint: today ? "Not after today, nor before this version was started." : undefined },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ exerciseId, kind }}
      action={recordAssurance}
      submitLabel="Record the confirmation"
      trigger={{ label: "Record", className: secondary, ariaLabel: `Record who confirmed: ${label.toLowerCase()}` }}
      size="md"
    />
  );
}

export function RemoveAssuranceDrawer({ exerciseId, id, label, allowed }: { exerciseId: string; id: string; label: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Remove the confirmation: ${label.toLowerCase()}`}
      description="For a confirmation recorded in error, or one the documents have since outgrown. It stays in the exercise's History."
      fields={[hidden("exerciseId"), hidden("id")]}
      values={{ exerciseId, id }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep it"
      action={removeAssurance}
      submitLabel="Remove the confirmation"
      trigger={{ label: "Remove", className: buttonClass("destructive", "sm"), ariaLabel: `Remove the confirmation: ${label.toLowerCase()}` }}
      size="sm"
    />
  );
}

export function OverrideClauseDrawer({ exerciseId, clauseCode, title, people, allowed }: { exerciseId: string; clauseCode: string; title: string; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Record an endorsement" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Go without the ${title.toLowerCase()}`}
      description="Only a legal endorsement lets an agreement go without a clause every agreement must carry. Name who gave it and why: recorded on their behalf, not signed. It holds for this version only."
      fields={[
        hidden("exerciseId"),
        hidden("clauseCode"),
        { kind: "select", name: "personId", label: "Endorsed by", required: true, placeholder: "Choose", options: people },
        { kind: "textarea", name: "reason", label: "Why", required: true },
      ]}
      values={{ exerciseId, clauseCode }}
      action={recordClauseOverride}
      submitLabel="Record the endorsement"
      trigger={{ label: "Record an endorsement", className: ghost, ariaLabel: `Record a legal endorsement to go without the ${title.toLowerCase()}` }}
      size="md"
    />
  );
}

export function RemoveOverrideDrawer({ exerciseId, id, title, allowed }: { exerciseId: string; id: string; title: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Withdraw the endorsement: ${title.toLowerCase()}`}
      description="The agreement must carry the clause again. The endorsement stays in the exercise's History."
      fields={[hidden("exerciseId"), hidden("id")]}
      values={{ exerciseId, id }}
      destructive={{ reasonLabel: "Why it is withdrawn" }}
      cancelLabel="Keep it"
      action={removeClauseOverride}
      submitLabel="Withdraw the endorsement"
      trigger={{ label: "Withdraw", className: buttonClass("destructive", "sm"), ariaLabel: `Withdraw the endorsement on the ${title.toLowerCase()}` }}
      size="sm"
    />
  );
}
