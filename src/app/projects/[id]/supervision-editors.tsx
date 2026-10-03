"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";

import {
  attestDiary,
  decideProgramme,
  disputeDiary,
  endorseDiary,
  handOverRecords,
  recordDelegation,
  recordDiaryEntry,
  recordDirection,
  recordEarlyAction,
  recordObservation,
  recordParty,
  recordPossession,
  recordProgress,
  recordSelfHelp,
  recordSiteMeeting,
  resolveSuperintendingOfficer,
  retireParty,
  revokeDelegation,
  scrutiniseProgramme,
  submitProgramme,
} from "./supervision-actions";

/**
 * The contract's supervision drawers (6.13 Part A, 4b). No field carries a default but the day an act is recorded
 * on. Every person named is recorded on their behalf, not signed; the server judges whether they may be recorded
 * for the act on the day (the S.O., or a representative whose delegation covers it). A drawer that cannot proceed
 * says why beside its button.
 */

export type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const ghost = buttonClass("ghost", "sm");
const person = (name: string, label: string, people: Option[], hint = ON_BEHALF_HINT): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose", options: people, hint });
const choose = (name: string, label: string, options: Option[], hint?: string): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose: there is no default", options, ...(hint ? { hint } : {}) });

// ------------------------------------------------------------------ the S.O. and delegation

export function ResolveSoDrawer({ id, blocker, office }: { id: string; blocker: string | null; office: string | null }) {
  return (
    <RecordEditor
      title="Resolve the Superintending Officer"
      description="For a contract executed before supervision was recorded: the office the approval matrix in force today gives at this contract's sum and method, effective from today. A contract executed since resolves it at the employer's signature."
      fields={[hidden("id"), { kind: "readonly", name: "office", label: "The matrix gives", text: office ?? "No single office: see why beside the button" }]}
      values={{ id }}
      action={resolveSuperintendingOfficer}
      submitLabel="Resolve"
      submitBlock={blocker}
      trigger={{ label: "Resolve the S.O.", className: primary }}
    />
  );
}

export function DelegationDrawer({ id, people, kinds, acts, letters, blocker }: { id: string; people: Option[]; kinds: Option[]; acts: Option[]; letters: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Delegate to a representative"
      description={`The S.O. names a representative, the kind, and what the delegation covers, once satisfied of their competency. It is made by the letter pair for this contract type (${letters}), opened here as two certificates to be signed and issued: the delegation holds from the letter's date. A representative never delegates further.`}
      size="lg"
      columns={2}
      fields={[
        hidden("id"),
        choose("kind", "Type of representative", kinds),
        person("grantorPersonId", "Delegated by (the S.O.)", people),
        person("delegatePersonId", "Representative", people, "On record and active."),
        { kind: "tokens", name: "scope", label: "What it covers", options: acts, hint: "Outside the scope, the representative is refused: the S.O. records it." },
        { kind: "switch", name: "competencyConfirmed", label: "The S.O. is satisfied of their competency", hint: "Required: the delegation is not made without it." },
        { kind: "textarea", name: "competencyNote", label: "On what that rests", placeholder: "Their qualification, experience and the works they will oversee" },
      ]}
      values={{ id }}
      action={recordDelegation}
      submitLabel="Delegate and open the letters"
      submitBlock={blocker}
      trigger={{ label: "Delegate", className: primary }}
    />
  );
}

export function RevokeDelegationDrawer({ id, delegationId, name, today }: { id: string; delegationId: string; name: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Revoke the delegation to ${name}`}
      description="From the day given, the representative is no longer recorded for anything under it. Its letters and everything recorded under it stay as they were."
      fields={[hidden("id"), hidden("delegationId"), { kind: "date", name: "on", label: "Revoked from", required: true }]}
      values={{ id, delegationId, on: today }}
      action={revokeDelegation}
      destructive={{ reasonLabel: "Why it is revoked" }}
      submitLabel="Revoke"
      cancelLabel="Keep it"
      trigger={{ label: "Revoke", className: ghost, ariaLabel: `Revoke the delegation to ${name}` }}
    />
  );
}

// ------------------------------------------------------------------ possession, programme, progress

export function PossessionDrawer({ id, people, today, blocker, startRule }: { id: string; people: Option[]; today: string | null; blocker: string | null; startRule: string }) {
  return (
    <RecordEditor
      title="Record possession of site"
      description={`Once, on a fully executed contract. The Date of Possession starts the contract period: a new baseline version carries it and the date for completion from it, and the contract becomes active. Start of work: ${startRule}.`}
      fields={[hidden("id"), { kind: "date", name: "possessionOn", label: "Date of possession", required: true }, person("personId", "Recorded for (the S.O. or the Principal Representative)", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, possessionOn: today }}
      action={recordPossession}
      submitLabel="Record possession"
      submitBlock={blocker}
      trigger={{ label: "Record possession", className: primary }}
    />
  );
}

export function SubmitProgrammeDrawer({ id, kinds, directions, today, blocker }: { id: string; kinds: Option[]; directions: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a programme submitted"
      description="The contractor's programme (or a service schedule) as submitted, with its planned progress: one line per point, oldest first, as a day and the cumulative percentage planned by it. Between two points the plan is read on a straight line."
      size="lg"
      fields={[
        hidden("id"),
        choose("kind", "What it is", kinds),
        { kind: "date", name: "submittedOn", label: "Submitted on", required: true },
        { kind: "textarea", name: "points", label: "Planned progress", placeholder: "2026-11-01 | 5\n2026-12-01 | 20" },
        ...(directions.length ? [{ kind: "select" as const, name: "directionId", label: "In answer to a direction", placeholder: "None", options: directions }] : []),
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, submittedOn: today }}
      action={submitProgramme}
      submitBlock={blocker}
      trigger={{ label: "Record a submission", className: secondary }}
    />
  );
}

export function ScrutinyDrawer({ id, programmeId, revision, people, today }: { id: string; programmeId: string; revision: number; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Scrutinise revision ${revision}`}
      description="Whether the programme reflects a reasonable and realistic sequence for the works. Found unreasonable, it cannot be approved: it goes back for revision."
      fields={[
        hidden("id"),
        hidden("programmeId"),
        person("personId", "Scrutinised by", people),
        { kind: "date", name: "on", label: "Scrutinised on", required: true },
        choose("reasonable", "Reasonable and realistic", [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]),
        { kind: "textarea", name: "note", label: "Note", hint: "Required where it is not." },
      ]}
      values={{ id, programmeId, on: today }}
      action={scrutiniseProgramme}
      trigger={{ label: "Scrutinise", className: secondary, ariaLabel: `Scrutinise programme revision ${revision}` }}
    />
  );
}

export function DecideProgrammeDrawer({ id, programmeId, revision, people, today, decisions }: { id: string; programmeId: string; revision: number; people: Option[]; today: string | null; decisions: Option[] }) {
  return (
    <RecordEditor
      title={`Decide revision ${revision}`}
      description="The Principal Representative (or the S.O.) approves it, making it the plan progress is judged against from that day, or returns it for revision with the reason."
      fields={[hidden("id"), hidden("programmeId"), person("personId", "Decided by", people), { kind: "date", name: "on", label: "Decided on", required: true }, choose("decision", "Decision", decisions), { kind: "textarea", name: "note", label: "Note", hint: "Required when returned." }]}
      values={{ id, programmeId, on: today }}
      action={decideProgramme}
      trigger={{ label: "Decide", className: primary, ariaLabel: `Decide programme revision ${revision}` }}
    />
  );
}

export function ProgressDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record progress"
      description="The actual physical progress of the works on a day, as a cumulative percentage. Recorded progress never falls."
      fields={[hidden("id"), person("personId", "Recorded for", people), { kind: "date", name: "day", label: "Day", required: true }, { kind: "text", name: "actualPct", label: "Actual progress (%)", required: true, placeholder: "e.g. 42.5" }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, day: today }}
      action={recordProgress}
      submitBlock={blocker}
      trigger={{ label: "Record progress", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ the site diary

export function DiaryEntryDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Write the day's diary"
      description="One entry a day, by the responsible officer. An entry written after its day says why it was not written on the day."
      size="lg"
      fields={[
        hidden("id"),
        person("personId", "Responsible officer", people),
        { kind: "date", name: "day", label: "Day", required: true },
        { kind: "text", name: "weather", label: "Weather" },
        { kind: "textarea", name: "entry", label: "Entry", required: true, placeholder: "Work done, labour and plant on site, materials delivered, visitors, instructions given" },
        { kind: "textarea", name: "backdatedReason", label: "Why it was not written on the day", hint: "Only for a day before today." },
      ]}
      values={{ id, day: today }}
      action={recordDiaryEntry}
      submitBlock={blocker}
      trigger={{ label: "Write an entry", className: primary }}
    />
  );
}

export function AttestDrawer({ id, entryId, label, who, today }: { id: string; entryId: string; label: string; who: "OFFICER" | "AGENT"; today: string | null }) {
  return (
    <RecordEditor
      title={who === "OFFICER" ? "The responsible officer attests" : "The contractor's agent attests"}
      description={`${label}: attested at the end of the day.`}
      fields={[hidden("id"), hidden("entryId"), hidden("who"), { kind: "date", name: "on", label: "Attested on", required: true }, ...(who === "AGENT" ? [{ kind: "text" as const, name: "agentName", label: "The contractor's agent", required: true }] : [])]}
      values={{ id, entryId, who, on: today }}
      action={attestDiary}
      trigger={{ label: who === "OFFICER" ? "Officer attests" : "Agent attests", className: ghost, ariaLabel: `${who === "OFFICER" ? "Officer" : "Agent"} attests ${label}` }}
    />
  );
}

export function DisputeDrawer({ id, entryId, label }: { id: string; entryId: string; label: string }) {
  return (
    <RecordEditor
      title="Record a disagreement"
      description={`${label}: where the officer and the contractor's agent do not agree on the entry, what they disagree on is recorded and the entry goes to the S.O.`}
      fields={[hidden("id"), hidden("entryId"), { kind: "textarea", name: "disagreement", label: "What they disagree on", required: true }]}
      values={{ id, entryId }}
      action={disputeDiary}
      trigger={{ label: "Disagreement", className: ghost, ariaLabel: `Record a disagreement on ${label}` }}
    />
  );
}

export function EndorseDrawer({ id, people, roles, today, blocker }: { id: string; people: Option[]; roles: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Endorse the diary at a site visit"
      description="The superior officer or the S.O. endorses the diary over the days the visit covers."
      columns={2}
      fields={[hidden("id"), choose("role", "Endorsed as", roles), person("personId", "Endorsed by", people), { kind: "date", name: "visitedOn", label: "Visited on", required: true }, { kind: "date", name: "coversFrom", label: "Covers from", required: true }, { kind: "date", name: "coversTo", label: "Covers to", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, visitedOn: today, coversTo: today }}
      action={endorseDiary}
      submitBlock={blocker}
      trigger={{ label: "Endorse", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ oversight

export function MeetingDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a special site meeting"
      description="Chaired by the S.O. once the contract is In Delay, with who attended and its minutes. The reading that called it is kept with it."
      size="lg"
      fields={[hidden("id"), person("personId", "Chaired by (the S.O.)", people), { kind: "date", name: "heldOn", label: "Held on", required: true }, { kind: "textarea", name: "attendees", label: "Attended by", placeholder: "One name a line" }, { kind: "textarea", name: "minutes", label: "Minutes", required: true }]}
      values={{ id, heldOn: today }}
      action={recordSiteMeeting}
      submitBlock={blocker}
      trigger={{ label: "Record a meeting", className: secondary }}
    />
  );
}

export function ObservationDrawer({ id, people, areas, today, blocker }: { id: string; people: Option[]; areas: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a compliance observation"
      description="What was seen on site, and what it concerns."
      fields={[hidden("id"), choose("area", "About", areas), person("personId", "Observed by", people), { kind: "date", name: "on", label: "Observed on", required: true }, { kind: "textarea", name: "note", label: "Observation", required: true }]}
      values={{ id, on: today }}
      action={recordObservation}
      submitBlock={blocker}
      trigger={{ label: "Record an observation", className: secondary }}
    />
  );
}

export function DirectionDrawer({ id, people, causes, today, blocker }: { id: string; people: Option[]; causes: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Direct a review of the programme"
      description="A direction to review the completion date and submit a revised programme. A variation's direction is raised by the variation itself."
      fields={[hidden("id"), choose("cause", "Called for by", causes), person("personId", "Directed by", people), { kind: "date", name: "on", label: "Directed on", required: true }, { kind: "textarea", name: "note", label: "Direction", required: true }]}
      values={{ id, on: today }}
      action={recordDirection}
      submitBlock={blocker}
      trigger={{ label: "Record a direction", className: secondary }}
    />
  );
}

export function SelfHelpDrawer({ id, people, policies, today, blocker }: { id: string; people: Option[]; policies: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a premium paid by the employer"
      description="Where the contractor lets a required policy lapse, the S.O. may have the employer pay its premium. The amount waits as a deduction for the next interim certificate."
      columns={2}
      fields={[hidden("id"), choose("policyId", "Policy", policies), person("personId", "Decided by (the S.O.)", people), { kind: "money", name: "amount", label: "Premium paid", required: true }, { kind: "date", name: "paidOn", label: "Paid on", required: true }, { kind: "date", name: "extendedTo", label: "Cover extended to" }, { kind: "textarea", name: "note", label: "Why", required: true }]}
      values={{ id, paidOn: today }}
      action={recordSelfHelp}
      submitBlock={blocker}
      trigger={{ label: "Record a premium paid", className: secondary }}
    />
  );
}

export function EarlyActionDrawer({ id, people, branches, today, blocker }: { id: string; people: Option[]; branches: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record the S.O.'s early-action decision"
      description="One or more of the courses open to the S.O. once the contract is going wrong, with why. Each opens where it is recorded."
      fields={[hidden("id"), { kind: "tokens", name: "branches", label: "Decided to", options: branches }, person("personId", "Decided by (the S.O.)", people), { kind: "date", name: "on", label: "Decided on", required: true }, { kind: "textarea", name: "reason", label: "Why", required: true }]}
      values={{ id, on: today }}
      action={recordEarlyAction}
      submitBlock={blocker}
      trigger={{ label: "Record a decision", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ parties and records

export function PartyDrawer({ id, kinds, blocker }: { id: string; kinds: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a nominated party or assignee"
      description="A nominated sub-contractor, a nominated supplier or an approved assignee paid through this contract's certificates. Totals only: the payment annexes that break each certificate down by party are not available yet."
      columns={2}
      fields={[
        hidden("id"),
        choose("kind", "Party", kinds),
        { kind: "text", name: "name", label: "Name", required: true },
        { kind: "money", name: "sum", label: "Sub-contract or assigned sum" },
        { kind: "select", name: "directPayment", label: "Paid direct", placeholder: "Not stated", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
        { kind: "select", name: "provenance", label: "Where it came from", placeholder: "Not stated", options: [{ value: "STATED", label: "Stated — written in a governing document" }, { value: "OBSERVED", label: "Observed — seen in practice" }, { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" }] },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id }}
      action={recordParty}
      submitBlock={blocker}
      trigger={{ label: "Record a party", className: secondary }}
    />
  );
}

export function RetirePartyDrawer({ id, partyId, name }: { id: string; partyId: string; name: string }) {
  return (
    <RecordEditor
      title={`Retire ${name}`}
      description="It is never deleted: a certificate that carried it still reads it."
      fields={[hidden("id"), hidden("partyId")]}
      values={{ id, partyId }}
      action={retireParty}
      destructive={{ reasonLabel: "Why it is retired" }}
      submitLabel="Retire"
      cancelLabel="Keep it"
      trigger={{ label: "Retire", className: ghost, ariaLabel: `Retire ${name}` }}
    />
  );
}

export function HandoverDrawer({ id, people, sets, today, blocker }: { id: string; people: Option[]; sets: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Hand site records over"
      description="The records as they stand today are handed to the Implementing Department; the versions handed over are pinned with the record."
      columns={2}
      fields={[hidden("id"), choose("recordsSet", "Records", sets), { kind: "date", name: "on", label: "Handed over on", required: true }, { kind: "text", name: "toLabel", label: "Handed to", required: true, placeholder: "The Implementing Department's office" }, { kind: "text", name: "receivedByName", label: "Received by", required: true }, person("personId", "Handed over by", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, on: today }}
      action={handOverRecords}
      submitBlock={blocker}
      trigger={{ label: "Hand over", className: secondary }}
    />
  );
}
