import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

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

type NeedOptions = { grade: Record<string, Option[]>; categories: Record<string, Option[]>; specialisations: Record<string, Option[]>; fieldCodes: Record<string, Option[]>; permits: Record<string, Option[]> };
const WAITING = "Choose the registration body first.";
const NONE_FOR_BODY = "This body offers nothing to choose here: its list is not configured, or it takes nothing stated with it.";

export function AddRequirementDrawer({ exerciseId, allowed, bodies, groups, typeTest, needs }: { exerciseId: string; allowed: Allowed; bodies: Option[]; groups: Option[]; typeTest: string; needs: NeedOptions }) {
  if (!allowed.allowed) return <Blocked label="Add a registration" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Add a registration bidders must hold"
      description={`A new requirement is needed in addition to the others; an alternative is an option for one already listed, and any one of them is enough. The contract type's registration test: ${typeTest}.`}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "bodyCode", label: "Registration body", required: true, placeholder: "Choose", options: bodies },
        { kind: "select", name: "needGrade", label: "Lowest grade accepted", placeholder: "No grade asked for", hint: "Compared by the grade's order in the body's list: a bidder at this grade or above passes.", options: [], optionsBy: { name: "bodyCode", options: needs.grade, waiting: WAITING } },
        { kind: "checks", name: "needCategories", label: "Category (any one is enough)", options: [], optionsBy: { name: "bodyCode", options: needs.categories, waiting: WAITING, none: NONE_FOR_BODY } },
        { kind: "checks", name: "needSpecialisations", label: "Specialisation (any one is enough)", options: [], optionsBy: { name: "bodyCode", options: needs.specialisations, waiting: WAITING, none: NONE_FOR_BODY } },
        { kind: "checks", name: "needFieldCodes", label: "Field codes (every one is needed)", options: [], optionsBy: { name: "bodyCode", options: needs.fieldCodes, waiting: WAITING, none: NONE_FOR_BODY } },
        { kind: "checks", name: "needPermits", label: "Permit types (every one is needed)", options: [], optionsBy: { name: "bodyCode", options: needs.permits, waiting: WAITING, none: NONE_FOR_BODY } },
        { kind: "text", name: "qualifiers", label: "What is required with it, in words", hint: "Leave empty to have it written from the grade and codes chosen above. Words typed here are printed on the notice but are not compared, so eligibility reads \"not assessed\" for them." },
        { kind: "select", name: "alternativeGroup", label: "How it counts", required: true, options: groups },
      ]}
      values={{ exerciseId, alternativeGroup: groups[0]?.value ?? "" }}
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
      description={`Asked here as: ${question}. Where the answer is yes, every document the portal generates carries the stamp configured for it. Not answered holds submission back.`}
      fields={[hidden("exerciseId"), { kind: "select", name: "restrictedTender", label: "Answer", required: true, placeholder: "Choose", options: THREE }]}
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
      description="You confirm it, and the day. It belongs to this version; an amended version is confirmed again."
      fields={[
        hidden("exerciseId"),
        hidden("kind"),
        actorField("PackAssurance.person", { name: "personId", people }),
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
      description="Only a legal endorsement lets an agreement go without a clause every agreement must carry. You give it as yourself, signed in, and say why. Which office may give an endorsement is not checked, because no policy names one. It holds for this version only."
      fields={[
        hidden("exerciseId"),
        hidden("clauseCode"),
        actorField("ClauseOverride.person", { name: "personId", people }),
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
