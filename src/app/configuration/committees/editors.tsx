import { PencilIcon } from "@/components/icons";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import {
  retireNotApprovedOutcome,
  saveCommittee,
  saveMember,
  saveNotApprovedOutcome,
  vacateSeat,
} from "./actions";

export type OfficeOption = { code: string; nameEn: string };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];

function committeeFields(editing: boolean, offices: OfficeOption[]): Field[] {
  return [
    ...(editing
      ? []
      : ([
          {
            kind: "text",
            name: "code",
            label: "Code",
            required: true,
            mono: true,
            hint: "What an approval rule routes to. Never shown on a screen.",
          },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "textarea",
      name: "aliases",
      label: "Also known as",
      hint: "Other names the body goes by in the source documents, one per line.",
    },
    { kind: "textarea", name: "mandate", label: "Mandate", hint: "What this body decides." },
    {
      kind: "text",
      name: "governingSource",
      label: "Established by",
      required: true,
      hint: "The clause or form that constitutes the body.",
    },
    {
      kind: "select",
      name: "action",
      label: "Acts by",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "APPROVES", label: "Approval" },
        { value: "RECOMMENDS", label: "Recommendation" },
        { value: "CONSENTS", label: "Consent — a precondition, not an authority" },
        { value: "DECIDES", label: "Decision" },
      ],
    },
    {
      kind: "switch",
      name: "isExternal",
      label: "Outside the organisation",
      hint: "An external body's decision is a precondition rather than an internal authority.",
    },
    {
      kind: "number",
      name: "quorum",
      label: "Quorum",
      min: 1,
      hint: "Leave empty where none is set. Empty is not zero — a sitting cannot be certified quorate under an unset quorum.",
    },
    {
      kind: "select",
      name: "quorumProvenance",
      label: "Where the quorum came from",
      placeholder: "Not set",
      options: PROVENANCE_OPTIONS,
    },
    {
      kind: "select",
      name: "votingRule",
      label: "Voting rule",
      placeholder: "Not set",
      hint: "How individual votes combine. Leave unset where none is written down: no matter can then be carried or voted down, and no majority is assumed.",
      options: [
        { value: "SIMPLE_MAJORITY", label: "Simple majority of votes cast (a tie is not carried)" },
        { value: "UNANIMOUS", label: "Unanimous" },
      ],
    },
    {
      kind: "select",
      name: "votingRuleProvenance",
      label: "Where the voting rule came from",
      placeholder: "Not set",
      options: PROVENANCE_OPTIONS,
    },
    {
      kind: "select",
      name: "alternateMayVoteForRecused",
      label: "May an alternate vote for a recused member?",
      placeholder: "Not set",
      hint: "Unset, a matter where a member with an alternate recuses cannot be decided. \"Yes\" is not available yet: it needs a per-matter stand-in while the member is present, which is not built.",
      options: [
        { value: "no", label: "No — the recused member's seat does not vote on that matter" },
        { value: "yes", label: "Yes — not available yet" },
      ],
    },
    {
      kind: "select",
      name: "alternateMayVoteForRecusedProvenance",
      label: "Where that came from",
      placeholder: "Not set",
      options: PROVENANCE_OPTIONS,
    },
    {
      kind: "text",
      name: "carriedLabelEn",
      label: "Name for a carried decision",
      placeholder: "Not set — reads “Carried”",
      hint: "What this body calls a decision it carries, as its minutes write it. A not-carried decision is named by its not-approved outcome.",
    },
    { kind: "text", name: "carriedLabelMs", label: "Name for a carried decision (Malay)", placeholder: "Not set" },
    {
      kind: "select",
      name: "secretariatRoleCode",
      label: "Secretariat office",
      placeholder: "Not set",
      hint: "Whoever holds this office on the day tables matters before the body. Unset, nobody may table.",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
      orphanLabel: "An office no longer configured",
    },
    {
      kind: "select",
      name: "compositionProvenance",
      label: "Where the membership came from",
      placeholder: "Not set",
      options: PROVENANCE_OPTIONS,
    },
    { kind: "money", name: "valueScopeMin", label: "Value scope from" },
    { kind: "money", name: "valueScopeMax", label: "Value scope to" },
    { kind: "textarea", name: "notes", label: "Notes" },
    {
      kind: "date",
      name: "retiredOn",
      label: "Retired on",
      hint: "A retired body schedules nothing from this date and keeps its history.",
    },
  ];
}

export function AddCommittee({ offices }: { offices: OfficeOption[] }) {
  return (
    <RecordEditor
      title="Add a committee"
      description="A body that must sit before a procurement decision can be made."
      fields={committeeFields(false, offices)}
      action={saveCommittee}
      submitLabel="Add committee"
      trigger={{ label: "Add committee", icon: true }}
      size="lg"
    />
  );
}

export interface CommitteeValues {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  mandate: string;
  governingSource: string;
  action: string;
  isExternal: boolean;
  quorum: number | null;
  quorumProvenance: string | null;
  compositionProvenance: string | null;
  valueScopeMin: number | null;
  valueScopeMax: number | null;
  notes: string;
  aliases: string[];
  retiredOn: Date | null;
  secretariatRoleCode: string | null;
  votingRule: string | null;
  votingRuleProvenance: string | null;
  alternateMayVoteForRecused: boolean | null;
  alternateMayVoteForRecusedProvenance: string | null;
  carriedLabelEn?: string | null;
  carriedLabelMs?: string | null;
}

export function EditCommittee({ committee, offices }: { committee: CommitteeValues; offices: OfficeOption[] }) {
  return (
    <RecordEditor
      title={`Edit ${committee.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...committeeFields(true, offices)]}
      action={saveCommittee}
      trigger={{ label: `Edit ${committee.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id: committee.id,
        code: committee.code,
        nameEn: committee.nameEn,
        nameMs: committee.nameMs,
        mandate: committee.mandate,
        governingSource: committee.governingSource,
        action: committee.action,
        isExternal: committee.isExternal,
        quorum: committee.quorum == null ? null : String(committee.quorum),
        quorumProvenance: committee.quorumProvenance,
        compositionProvenance: committee.compositionProvenance,
        valueScopeMin: committee.valueScopeMin == null ? null : String(committee.valueScopeMin),
        valueScopeMax: committee.valueScopeMax == null ? null : String(committee.valueScopeMax),
        notes: committee.notes,
        aliases: committee.aliases.join("\n"),
        retiredOn: day(committee.retiredOn),
        secretariatRoleCode: committee.secretariatRoleCode,
        votingRule: committee.votingRule,
        votingRuleProvenance: committee.votingRuleProvenance,
        alternateMayVoteForRecused:
          committee.alternateMayVoteForRecused == null ? null : committee.alternateMayVoteForRecused ? "yes" : "no",
        alternateMayVoteForRecusedProvenance: committee.alternateMayVoteForRecusedProvenance,
        carriedLabelEn: committee.carriedLabelEn ?? null,
        carriedLabelMs: committee.carriedLabelMs ?? null,
      }}
    />
  );
}

export type SeatOption = { id: string; label: string };

function memberFields(
  people: { id: string; name: string }[],
  offices: { code: string; nameEn: string }[],
  seats: SeatOption[],
): Field[] {
  return [
    { kind: "hidden", name: "committeeId" },
    {
      kind: "note",
      text: "A seat is held either ex officio — by whoever holds an office — or by a named appointment. Set one, not both.",
    },
    {
      kind: "select",
      name: "seatRoleCode",
      label: "Held by the office of",
      placeholder: "Not ex officio",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
    },
    {
      kind: "select",
      name: "personId",
      label: "Or held by",
      placeholder: "Not a named appointment",
      options: people.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      kind: "text",
      name: "seatLabel",
      label: "How the seat is described",
      hint: "For an office with no code of its own, because no rule routes to it directly.",
    },
    {
      kind: "select",
      name: "position",
      label: "Position",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "CHAIRMAN", label: "Chairman" },
        { value: "DEPUTY_CHAIRMAN", label: "Deputy chairman" },
        { value: "MEMBER", label: "Member" },
        { value: "SECRETARY", label: "Secretary" },
      ],
    },
    { kind: "switch", name: "isAlternate", label: "An alternate for the seat, not its holder" },
    {
      kind: "select",
      name: "alternateForId",
      label: "Alternate for",
      placeholder: "Any seat of its position",
      hint: "For an alternate only: the seat it covers while the holder is absent. The chair has no alternate.",
      options: seats.map((s) => ({ value: s.id, label: s.label })),
      orphanLabel: "A seat no longer in force",
    },
    { kind: "text", name: "appointmentRef", label: "Appointment reference" },
    { kind: "date", name: "effectiveFrom", label: "Held from", required: true },
    { kind: "date", name: "effectiveTo", label: END_DAY_LABEL, hint: "The first day the seat is no longer held. Leave empty while it is." },
    {
      kind: "select",
      name: "provenance",
      label: "Where this came from",
      required: true,
      placeholder: "Choose",
      options: PROVENANCE_OPTIONS,
    },
  ];
}

export function AddMember({
  committeeId,
  people,
  offices,
  seats,
}: {
  committeeId: string;
  people: { id: string; name: string }[];
  offices: { code: string; nameEn: string }[];
  seats: SeatOption[];
}) {
  return (
    <RecordEditor
      title="Add a seat"
      fields={memberFields(people, offices, seats)}
      values={{ committeeId }}
      action={saveMember}
      submitLabel="Add seat"
      trigger={{ label: "Add seat", icon: true }}
      size="lg"
    />
  );
}

export interface MemberValues {
  id: string;
  committeeId: string;
  personId: string | null;
  seatRoleCode: string | null;
  seatLabel: string | null;
  position: string;
  isAlternate: boolean;
  alternateForId: string | null;
  appointmentRef: string | null;
  provenance: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function EditMember({
  member,
  label,
  people,
  offices,
  seats,
}: {
  member: MemberValues;
  /// Who or what the seat is, so the icon-only trigger has a name.
  label: string;
  people: { id: string; name: string }[];
  offices: { code: string; nameEn: string }[];
  seats: SeatOption[];
}) {
  return (
    <RecordEditor
      title="Edit seat"
      fields={[{ kind: "hidden", name: "id" }, ...memberFields(people, offices, seats.filter((s) => s.id !== member.id))]}
      action={saveMember}
      trigger={{ label: `Edit ${label}`, iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id: member.id,
        committeeId: member.committeeId,
        personId: member.personId,
        seatRoleCode: member.seatRoleCode,
        seatLabel: member.seatLabel,
        position: member.position,
        isAlternate: member.isAlternate,
        alternateForId: member.alternateForId,
        appointmentRef: member.appointmentRef,
        provenance: member.provenance,
        effectiveFrom: day(member.effectiveFrom),
        effectiveTo: day(member.effectiveTo),
      }}
    />
  );
}

/**
 * End a seat. A named seat is vacated; an ex-officio seat is the office's place on
 * the body, so ending it removes the office from the committee (ruling 5.2). Either
 * way the period ends today and the history stays.
 */
export function VacateSeat({ id, label, exOfficio = false }: { id: string; label: string; exOfficio?: boolean }) {
  const verb = exOfficio ? "Remove office from committee" : "Vacate";
  return (
    <RecordEditor
      title={exOfficio ? `Remove ${label} from the committee` : `Vacate ${label}`}
      description={
        exOfficio
          ? "The office's seat ends today. Past sittings keep resolving to whoever held the office on the day."
          : "The seat's period ends today. Votes already cast from it keep resolving to whoever cast them."
      }
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={vacateSeat}
      submitLabel={exOfficio ? "Remove office" : "Vacate"}
      destructive={{ reasonLabel: exOfficio ? "Why is the office leaving the committee?" : "Why is it being vacated?" }}
      trigger={{
        label: verb,
        className: buttonClass("destructive", "sm"),
      }}
      size="sm"
    />
  );
}

// ------------------------------------------------------ not-approved outcomes

export interface OutcomeValues {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  kind: string;
  returnsToStage: string | null;
  committeeId: string | null;
  governingSource: string;
  provenance: string;
  sortOrder: number;
}

function outcomeFields(editing: boolean, committees: { id: string; nameEn: string }[]): Field[] {
  return [
    ...(editing
      ? []
      : ([
          { kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A configuration key. Never shown on a screen." },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "select",
      name: "kind",
      label: "What it does",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "LOOP", label: "Returns the matter to an earlier stage" },
        { value: "TERMINAL", label: "Ends the matter" },
      ],
    },
    {
      kind: "text",
      name: "returnsToStage",
      label: "Returns to stage",
      hint: "For a return only. The stage the matter goes back to, once the sourcing modules exist.",
    },
    {
      kind: "select",
      name: "committeeId",
      label: "Offered to",
      placeholder: "Every committee",
      options: committees.map((c) => ({ value: c.id, label: c.nameEn })),
    },
    { kind: "text", name: "governingSource", label: "Source", hint: "The clause or form that provides for it." },
    {
      kind: "select",
      name: "provenance",
      label: "Where this came from",
      required: true,
      placeholder: "Choose",
      options: PROVENANCE_OPTIONS,
    },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
  ];
}

export function AddNotApprovedOutcome({ committees }: { committees: { id: string; nameEn: string }[] }) {
  return (
    <RecordEditor
      title="Add a not-approved outcome"
      description="What a matter voted down does next. None is shipped: these are your organisation's own options."
      fields={outcomeFields(false, committees)}
      action={saveNotApprovedOutcome}
      submitLabel="Add outcome"
      trigger={{ label: "Add outcome", icon: true }}
      size="lg"
    />
  );
}

export function EditNotApprovedOutcome({
  outcome,
  committees,
}: {
  outcome: OutcomeValues;
  committees: { id: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title={`Edit ${outcome.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...outcomeFields(true, committees)]}
      action={saveNotApprovedOutcome}
      trigger={{ label: `Edit ${outcome.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id: outcome.id,
        nameEn: outcome.nameEn,
        nameMs: outcome.nameMs,
        kind: outcome.kind,
        returnsToStage: outcome.returnsToStage,
        committeeId: outcome.committeeId,
        governingSource: outcome.governingSource,
        provenance: outcome.provenance,
        sortOrder: String(outcome.sortOrder),
      }}
    />
  );
}

export function RetireNotApprovedOutcome({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="It is no longer offered from today. Decisions already recorded against it keep citing it."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={retireNotApprovedOutcome}
      submitLabel="Retire"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{
        label: "Retire",
        className: buttonClass("destructive", "sm"),
      }}
      size="sm"
    />
  );
}
