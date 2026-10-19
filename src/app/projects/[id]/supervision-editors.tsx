"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

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
/// Who is acting: the signed-in officer, shown and not chosen. Where the act may be recorded from paper, `people` are who it may be recorded for.
const by = (slot: string, name: string, people: Option[], opts: { label?: string; dated?: boolean; named?: "required" | "optional" } = {}): Field =>
  actorField(slot, { name, people, label: opts.label, dated: opts.dated, ...(opts.named ? { named: { optional: opts.named === "optional" } } : {}) });
const person = (name: string, label: string, people: Option[], hint?: string): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose", options: people, ...(hint ? { hint } : {}) });
const choose = (name: string, label: string, options: Option[], hint?: string): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose: there is no default", options, ...(hint ? { hint } : {}) });

// ------------------------------------------------------------------ the S.O. and delegation

export function ResolveSoDrawer({ id, blocker, office, from }: { id: string; blocker: string | null; office: string | null; from: string }) {
  return (
    <RecordEditor
      title="Resolve the Superintending Officer"
      description={`For a contract executed before supervision was recorded: the office the approval matrix in force on the Contract Date gives at this contract's sum and method, taking effect from the Contract Date (${from}) so that no day of the contract is without an S.O. A contract executed since resolves it at the employer's signature.`}
      fields={[hidden("id"), { kind: "readonly", name: "office", label: "The matrix gives", text: office ?? "No single office: see why beside the button" }, { kind: "readonly", name: "from", label: "Takes effect from", text: from }]}
      values={{ id }}
      action={resolveSuperintendingOfficer}
      reason={{ label: "Why it is recorded now, from the Contract Date" }}
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
        by("SoDelegation.grantorPerson", "grantorPersonId", people, { named: "required" }),
        person("delegatePersonId", "Representative", people, "On record and active."),
        { kind: "tokens", name: "scope", label: "What it covers", options: acts, hint: "Outside scope: the S.O. records it." },
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
      description="Letters and records under it stay as they were."
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
      fields={[hidden("id"), { kind: "date", name: "possessionOn", label: "Date of possession", required: true }, by("Possession.recordedBy", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
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
      description="One line per point: a day and the cumulative percentage. Read on a straight line between points."
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
      description="Found unreasonable, it goes back for revision."
      fields={[
        hidden("id"),
        hidden("programmeId"),
        by("WorkProgramme.scrutinisedBy", "personId", people),
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
      description="Approving makes it the plan progress is judged against."
      fields={[hidden("id"), hidden("programmeId"), by("WorkProgramme.decidedBy", "personId", people, { dated: true }), { kind: "date", name: "on", label: "Decided on", required: true }, choose("decision", "Decision", decisions), { kind: "textarea", name: "note", label: "Note", hint: "Required when returned." }]}
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
      description="Cumulative percentage. It never falls."
      fields={[hidden("id"), by("ProgressRecord.recordedBy", "personId", people), { kind: "date", name: "day", label: "Day", required: true }, { kind: "text", name: "actualPct", label: "Actual progress (%)", required: true, placeholder: "e.g. 42.5" }, { kind: "textarea", name: "note", label: "Note" }]}
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
      description="A late entry says why."
      size="lg"
      fields={[
        hidden("id"),
        by("SiteDiaryEntry.officer", "personId", people),
        { kind: "date", name: "day", label: "Day", required: true },
        { kind: "text", name: "weather", label: "Weather" },
        { kind: "textarea", name: "entry", label: "Entry", required: true, placeholder: "Work, labour, plant, materials, visitors, instructions" },
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
      description="A superior officer is recorded as named: the reporting line is not checked."
      columns={2}
      fields={[hidden("id"), choose("role", "Endorsed as", roles), by("DiaryEndorsement.person", "personId", people), { kind: "date", name: "visitedOn", label: "Visited on", required: true }, { kind: "date", name: "coversFrom", label: "Covers from", required: true }, { kind: "date", name: "coversTo", label: "Covers to", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
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
      description="Keeps the reading that called it."
      size="lg"
      fields={[hidden("id"), by("SiteMeeting.chair", "personId", people), { kind: "date", name: "heldOn", label: "Held on", required: true }, { kind: "textarea", name: "attendees", label: "Attended by", placeholder: "One name a line" }, { kind: "textarea", name: "minutes", label: "Minutes", required: true }]}
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
      fields={[hidden("id"), choose("area", "About", areas), by("ComplianceObservation.person", "personId", people), { kind: "date", name: "on", label: "Observed on", required: true }, { kind: "textarea", name: "note", label: "Observation", required: true }]}
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
      description="A variation's direction is raised by the variation."
      fields={[hidden("id"), choose("cause", "Called for by", causes), by("ProgrammeDirection.person", "personId", people), { kind: "date", name: "on", label: "Directed on", required: true }, { kind: "textarea", name: "note", label: "Direction", required: true }]}
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
      description="Waits as a deduction on the next interim certificate."
      columns={2}
      fields={[hidden("id"), choose("policyId", "Policy", policies), by("PendingDeduction.person", "personId", people), { kind: "money", name: "amount", label: "Premium paid", required: true }, { kind: "date", name: "paidOn", label: "Paid on", required: true }, { kind: "date", name: "extendedTo", label: "Cover extended to" }, { kind: "textarea", name: "note", label: "Why", required: true }]}
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
      description="Each opens where it is recorded."
      fields={[hidden("id"), { kind: "tokens", name: "branches", label: "Decided to", options: branches }, by("EarlyActionDecision.person", "personId", people), { kind: "date", name: "on", label: "Decided on", required: true }, { kind: "textarea", name: "reason", label: "Why", required: true }]}
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
      description="Totals only."
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
      description="Never deleted."
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
      description="Handed versions are pinned with the record."
      columns={2}
      fields={[hidden("id"), choose("recordsSet", "Records", sets), { kind: "date", name: "on", label: "Handed over on", required: true }, { kind: "text", name: "toLabel", label: "Handed to", required: true, placeholder: "The Implementing Department's office" }, { kind: "text", name: "receivedByName", label: "Received by", required: true }, by("SiteRecordsHandover.person", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, on: today }}
      action={handOverRecords}
      submitBlock={blocker}
      trigger={{ label: "Hand over", className: secondary }}
    />
  );
}
