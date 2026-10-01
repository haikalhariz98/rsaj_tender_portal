import { RecordEditor, type Field } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { ACT_LABEL, matterLabel } from "@/lib/labels";
import matters from "@/lib/labels.json";
import { MATTER_KIND_LABEL, MINUTES_EDITOR_DESCRIPTION, SITTING_TABLED_MATTER_KINDS, sittingTablesDomain, NOT_APPROVED_KIND_LABEL } from "@/lib/committee/labels";

import {
  changeStatus,
  declareRecusal,
  editSitting,
  recordAttendance,
  recordOutcome,
  saveMinutes,
  scheduleSitting,
  tableMatter,
  withdrawMatter,
} from "./actions";

/**
 * The drawers of a sitting. Fields are data; every rule sits in the action and the
 * pure checks behind it. No field is pre-filled with a policy value.
 */

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function ScheduleSitting({
  committees,
  numbered,
}: {
  committees: { id: string; nameEn: string }[];
  /// True where a numbering series for sittings is configured.
  numbered: boolean;
}) {
  return (
    <RecordEditor
      title="Schedule a sitting"
      description="A sitting of one committee, on one date. Matters are tabled onto it afterwards."
      fields={[
        {
          kind: "select",
          name: "committeeId",
          label: "Committee",
          required: true,
          placeholder: "Choose",
          options: committees.map((c) => ({ value: c.id, label: c.nameEn })),
        },
        { kind: "date", name: "meetingDate", label: "Date", required: true },
        {
          kind: "text",
          name: "reference",
          label: "Reference",
          required: !numbered,
          hint: numbered
            ? "Leave empty to draw the next number from the sittings series."
            : "No numbering series for sittings is configured, so type the reference.",
        },
        { kind: "textarea", name: "agenda", label: "Agenda" },
      ]}
      action={scheduleSitting}
      submitLabel="Schedule"
      trigger={{ label: "Schedule sitting", icon: true, className: buttonClass("primary", "md") }}
      size="md"
    />
  );
}

export function EditSitting({ meeting }: { meeting: { id: string; meetingDate: Date; agenda: string } }) {
  return (
    <RecordEditor
      title="Edit sitting"
      description="The date can change only before the sitting starts."
      fields={[
        { kind: "hidden", name: "meetingId" },
        { kind: "date", name: "meetingDate", label: "Date", required: true },
        { kind: "textarea", name: "agenda", label: "Agenda" },
      ]}
      values={{ meetingId: meeting.id, meetingDate: day(meeting.meetingDate), agenda: meeting.agenda }}
      action={editSitting}
      trigger={{ label: "Edit" }}
    />
  );
}

export function StartSitting({ meetingId }: { meetingId: string }) {
  return (
    <RecordEditor
      title="Start the sitting"
      description="Once started, the register is taken and votes can be recorded against tabled matters."
      fields={[{ kind: "hidden", name: "meetingId" }, { kind: "hidden", name: "to" }]}
      values={{ meetingId, to: "IN_PROGRESS" }}
      action={changeStatus}
      submitLabel="Start sitting"
      trigger={{ label: "Start", className: buttonClass("primary", "sm") }}
      size="sm"
    />
  );
}

/**
 * Mark the sitting as minuted. Offered only once it can be: minutes written and no
 * matter pending. Until then the control is shown disabled with the reason, rather
 * than opening a drawer that can only refuse.
 */
export function MinuteSitting({
  meetingId,
  blocker,
  blockerId,
}: {
  meetingId: string;
  blocker: string | null;
  /// Id of the element that states the blocker (PageHeader's `actionsNoteId`). The
  /// reason is shown there, under the action row, not beside this button.
  blockerId?: string;
}) {
  if (blocker) {
    return (
      <Button size="sm" disabled aria-describedby={blockerId} title={blocker}>
        Mark as minuted
      </Button>
    );
  }
  return (
    <RecordEditor
      title="Mark as minuted"
      description="Minuting freezes the sitting: its register, votes and outcomes can no longer change."
      fields={[
        { kind: "hidden", name: "meetingId" },
        { kind: "hidden", name: "to" },
      ]}
      values={{ meetingId, to: "MINUTED" }}
      action={changeStatus}
      submitLabel="Mark as minuted"
      trigger={{ label: "Mark as minuted", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function CancelSitting({ meetingId }: { meetingId: string }) {
  return (
    <RecordEditor
      title="Cancel the sitting"
      description="A sitting that has decided a matter cannot be cancelled."
      fields={[{ kind: "hidden", name: "meetingId" }, { kind: "hidden", name: "to" }]}
      values={{ meetingId, to: "CANCELLED" }}
      action={changeStatus}
      submitLabel="Cancel sitting"
      destructive={{ reasonLabel: "Why is the sitting cancelled?" }}
      trigger={{
        label: "Cancel sitting",
        className: buttonClass("destructive", "sm"),
      }}
      size="sm"
    />
  );
}

export function EditMinutes({ meetingId, minutes }: { meetingId: string; minutes: string }) {
  return (
    <RecordEditor
      title="Minutes"
      description={MINUTES_EDITOR_DESCRIPTION}
      fields={[
        { kind: "hidden", name: "meetingId" },
        { kind: "textarea", name: "minutes", label: "Minutes" },
      ]}
      values={{ meetingId, minutes }}
      action={saveMinutes}
      submitLabel="Save minutes"
      trigger={{ label: minutes ? "Edit minutes" : "Write minutes" }}
      size="lg"
    />
  );
}

export function RecordAttendanceEditor({
  meetingId,
  personId,
  name,
  current,
  seats,
}: {
  meetingId: string;
  personId: string;
  name: string;
  current: { attended: boolean; standingInForSeatId: string | null } | null;
  /// Seats this person may be recorded as covering. Empty for a holder.
  seats: { seatId: string; label: string }[];
}) {
  return (
    <RecordEditor
      title={`Attendance: ${name}`}
      fields={[
        { kind: "hidden", name: "meetingId" },
        { kind: "hidden", name: "personId" },
        {
          kind: "select",
          name: "attended",
          label: "At this sitting",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "yes", label: "Present" },
            { value: "no", label: "Absent" },
          ],
        },
        ...(seats.length > 0
          ? ([
              {
                kind: "select",
                name: "standingInForSeatId",
                label: "Standing in for",
                placeholder: "Not standing in",
                hint: "An alternate covers a seat only while its holder is absent. Nobody stands in for the chairman.",
                options: seats.map((s) => ({ value: s.seatId, label: s.label })),
              },
            ] as Field[])
          : []),
      ]}
      values={{
        meetingId,
        personId,
        attended: current == null ? null : current.attended ? "yes" : "no",
        standingInForSeatId: current?.standingInForSeatId ?? null,
      }}
      action={recordAttendance}
      trigger={{ label: current ? "Change" : "Record", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

const DOMAIN_OPTIONS = Object.keys(matters).filter(sittingTablesDomain).map((code) => ({ value: code, label: matterLabel(code) }));

export function TableMatter({
  meetingId,
  holders,
  otherMatters,
  prefill,
}: {
  meetingId: string;
  /// Values carried from the record that asks for the matter; the drawer opens with them.
  prefill?: Record<string, string>;
  /// Active holders of the Secretariat office today.
  holders: { id: string; name: string }[];
  otherMatters: { id: string; subject: string }[];
}) {
  return (
    <RecordEditor
      title="Table a matter"
      description="Tabled by a holder of the committee's Secretariat office. Until sign-in exists this is attested by whoever records it, not proved."
      fields={[
        { kind: "hidden", name: "meetingId" },
        { kind: "text", name: "subject", label: "Subject", required: true },
        { kind: "select", name: "domain", label: "Matter", required: true, placeholder: "Choose", options: DOMAIN_OPTIONS },
        {
          kind: "select",
          name: "act",
          label: "The committee's act",
          required: true,
          placeholder: "Choose",
          options: Object.entries(ACT_LABEL).map(([value, label]) => ({ value, label })),
        },
        {
          kind: "select",
          name: "matterKind",
          label: "Concerns a record of kind",
          placeholder: "Not linked to a record",
          options: SITTING_TABLED_MATTER_KINDS.map((k) => ({ value: k, label: MATTER_KIND_LABEL[k] })),
        },
        { kind: "text", name: "matterRef", label: "Record reference", mono: true },
        { kind: "money", name: "amount", label: "Amount" },
        {
          kind: "select",
          name: "dependsOnDecisionId",
          label: "Cannot be decided before",
          placeholder: "Depends on no other matter",
          options: otherMatters.map((m) => ({ value: m.id, label: m.subject })),
        },
        {
          kind: "select",
          name: "tabledByPersonId",
          label: "Tabled by",
          required: true,
          placeholder: holders.length === 0 ? "Nobody holds the Secretariat office" : "Choose",
          options: holders.map((h) => ({ value: h.id, label: h.name })),
        },
      ]}
      values={{ ...prefill, meetingId }}
      defaultOpen={!!prefill}
      action={tableMatter}
      submitLabel="Table matter"
      trigger={{ label: "Table a matter", icon: true }}
      size="lg"
    />
  );
}

export function DeclareRecusal({
  decisionId,
  members,
}: {
  decisionId: string;
  members: { id: string; name: string }[];
}) {
  return (
    <RecordEditor
      title="Declare a recusal"
      description="The member stands aside from this matter only: its vote and its quorum. The rest of the sitting is unaffected."
      fields={[
        { kind: "hidden", name: "decisionId" },
        {
          kind: "select",
          name: "personId",
          label: "Member",
          required: true,
          placeholder: "Choose",
          options: members.map((m) => ({ value: m.id, label: m.name })),
        },
        { kind: "textarea", name: "reason", label: "Interest declared" },
      ]}
      values={{ decisionId }}
      action={declareRecusal}
      submitLabel="Declare recusal"
      trigger={{ label: "Declare recusal", className: buttonClass("ghost", "sm") }}
    />
  );
}

/**
 * Record a matter's outcome.
 *
 * Offered only when the matter can be decided. Otherwise the control is disabled with
 * the reason beside it, and the one outcome still open — deferring, which is not a
 * decision — is offered on its own. The computed result of the votes is never shown
 * while the matter cannot be decided: it would read as a result the body has not
 * reached.
 */
export function RecordOutcome({
  decisionId,
  offered,
  suggested,
  blocker,
}: {
  decisionId: string;
  offered: { id: string; nameEn: string; kind: "LOOP" | "TERMINAL" }[];
  /// What the votes come to, shown rather than pre-selected. Only when decidable.
  suggested: string | null;
  /// Why it cannot be decided, or null when it can.
  blocker: string | null;
}) {
  if (blocker) {
    return (
      <>
        <span className="text-[12.5px] text-ink-3">{blocker}</span>
        <RecordEditor
          title="Defer the matter"
          description="Deferring is not a decision: the matter is carried to a later sitting. Say why."
          fields={[
            { kind: "hidden", name: "decisionId" },
            { kind: "hidden", name: "outcome" },
            { kind: "textarea", name: "outcomeNote", label: "Why it is deferred" },
          ]}
          values={{ decisionId, outcome: "DEFERRED" }}
          action={recordOutcome}
          submitLabel="Defer matter"
          trigger={{ label: "Defer", className: buttonClass("ghost", "sm") }}
          size="sm"
        />
        <Button variant="primary" size="sm" disabled title={blocker}>
          Record outcome
        </Button>
      </>
    );
  }
  return (
    <RecordEditor
      title="Record the outcome"
      description={
        suggested
          ? `The votes come to: ${suggested}. Carried and Not carried must follow from them; Deferred needs only a note.`
          : "Deferred needs only a note. Carried and Not carried must follow from the recorded votes."
      }
      fields={[
        { kind: "hidden", name: "decisionId" },
        {
          kind: "select",
          name: "outcome",
          label: "Outcome",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "CARRIED", label: "Carried" },
            { value: "NOT_CARRIED", label: "Not carried" },
            { value: "DEFERRED", label: "Deferred" },
          ],
        },
        {
          kind: "select",
          name: "notApprovedOutcomeId",
          label: "If not carried, what happens next",
          placeholder: offered.length === 0 ? "None configured" : "Choose",
          hint: "Required for Not carried.",
          options: offered.map((o) => ({ value: o.id, label: `${o.nameEn} (${NOT_APPROVED_KIND_LABEL[o.kind].toLowerCase()})` })),
        },
        { kind: "textarea", name: "outcomeNote", label: "Note", hint: "Required for Not carried and Deferred." },
      ]}
      values={{ decisionId }}
      action={recordOutcome}
      submitLabel="Record outcome"
      trigger={{ label: "Record outcome", className: buttonClass("primary", "sm") }}
    />
  );
}

/// Withdraw a matter from the agenda before the sitting opens (6.10 follow-up), with a reason.
export function WithdrawMatter({ decisionId, subject }: { decisionId: string; subject: string }) {
  return (
    <RecordEditor
      title="Withdraw from the agenda"
      description={`“${subject}” leaves the agenda before the sitting opens. It stays on record as withdrawn, with the reason, and nothing is voted or decided on it. Once the sitting opens, a matter is deferred instead.`}
      fields={[{ kind: "hidden", name: "decisionId" }]}
      values={{ decisionId }}
      action={withdrawMatter}
      destructive={{ reasonLabel: "Why is it withdrawn?" }}
      submitLabel="Withdraw from the agenda"
      trigger={{ label: "Withdraw from agenda", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}
