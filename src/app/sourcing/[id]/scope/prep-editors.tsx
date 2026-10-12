import { RecordEditor, type Field } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";

import { nameOpeningOfficer, removeOpeningOfficer, saveKeyDates, substituteOpeningOfficer } from "./prep-actions";

/**
 * The drawers of Key dates & person in charge and Opening officers (SR-05, ruling 8; SR-07, ruling 11). Fields are data; every rule sits in
 * the action and the pure checks behind it. Where a rule already says an act cannot proceed, the control is disabled with the reason beside
 * it, judged by the rule the action runs.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");

/// Propose the tendering window's dates. The usual closing time, where the organisation has set one, is offered as the placeholder, never filled in for the officer.
export function KeyDatesDrawer({ exerciseId, allowed, values, usualClosingTime }: { exerciseId: string; allowed: Allowed; values: { startOn: string; closingDay: string; closingTime: string }; usualClosingTime: string | null }) {
  if (!allowed.allowed) return <Blocked label="Propose the dates" reason={allowed.reason} />;
  const entered = !!(values.startOn || values.closingDay || values.closingTime);
  return (
    <RecordEditor
      title={entered ? "Change the proposed dates" : "Propose the dates"}
      description="When tendering starts and closes. The notice states them, and they read Proposed until the approving step records them. They can be changed until the documents are submitted."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "date", name: "startOn", label: "Tendering starts on", required: true, hint: "Today or later." },
        { kind: "date", name: "closingDay", label: "Closing day", required: true, hint: "After the start day." },
        { kind: "text", name: "closingTime", label: "Closing time", required: true, placeholder: usualClosingTime ?? "14:30", hint: `Hours and minutes, 24-hour, the organisation's clock.${usualClosingTime ? ` Its usual closing time is ${usualClosingTime}.` : ""}` },
      ]}
      values={{ exerciseId, ...values }}
      action={saveKeyDates}
      submitLabel="Save the dates"
      trigger={{ label: entered ? "Change" : "Propose the dates", className: entered ? ghost : secondary, ariaLabel: entered ? "Change the proposed dates" : undefined }}
      size="md"
    />
  );
}

export function NameOfficerDrawer({ exerciseId, allowed, candidates, needed }: { exerciseId: string; allowed: Allowed; candidates: Option[]; needed: string }) {
  if (!allowed.allowed) return <Blocked label="Name an officer" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Name an opening officer"
      description={`${needed} Each holds a seat on the opening committee, and the same person cannot be named twice. Being named lets them see this exercise and open its bids.`}
      fields={[hidden("exerciseId"), { kind: "select", name: "personId", label: "Officer", required: true, placeholder: candidates.length ? "Choose" : "Nobody holds a seat on the committee", options: candidates, hint: "Only people who hold a seat on the opening committee today are listed." }]}
      values={{ exerciseId }}
      action={nameOpeningOfficer}
      submitLabel="Name the officer"
      trigger={{ label: "Name an officer", className: secondary }}
      size="md"
    />
  );
}

export function RemoveOfficerDrawer({ exerciseId, officerId, name }: { exerciseId: string; officerId: string; name: string }) {
  return (
    <RecordEditor
      title={`Take ${name} off`}
      description="They are no longer named to open the bids. The change is on the record, and the exercise cannot be submitted until the number is made up again."
      fields={[hidden("exerciseId"), hidden("officerId")]}
      values={{ exerciseId, officerId }}
      action={removeOpeningOfficer}
      destructive={{ reasonLabel: "Why they are taken off" }}
      submitLabel="Take them off"
      trigger={{ label: "Take off", className: ghost, ariaLabel: `Take ${name} off` }}
      size="sm"
    />
  );
}

/// Replace an officer. Before submission it needs a reason; from submission to the closing it is a controlled change that also names its authority.
export function SubstituteOfficerDrawer({ exerciseId, officerId, name, candidates, controlled }: { exerciseId: string; officerId: string; name: string; candidates: Option[]; controlled: boolean }) {
  return (
    <RecordEditor
      title={`Replace ${name}`}
      description={controlled ? "The documents are submitted, so this is a controlled change: say what authority it is made under and why. The replacement faces the same checks. It cannot be done after the closing." : "The replacement faces the same checks as any officer named. The change is on the record."}
      fields={[
        hidden("exerciseId"),
        hidden("officerId"),
        { kind: "select", name: "personId", label: "Replacement", required: true, placeholder: candidates.length ? "Choose" : "Nobody else holds a seat on the committee", options: candidates },
        ...(controlled ? ([{ kind: "text", name: "authority", label: "Authority for the change", required: true, hint: "For example the minute or instruction it is made under." }] as Field[]) : []),
        { kind: "textarea", name: "reason", label: "Why they are replaced", required: true },
      ]}
      values={{ exerciseId, officerId }}
      action={substituteOpeningOfficer}
      submitLabel="Replace the officer"
      trigger={{ label: "Replace", className: ghost, ariaLabel: `Replace ${name}` }}
      size="md"
    />
  );
}
