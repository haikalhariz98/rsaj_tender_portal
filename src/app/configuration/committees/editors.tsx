import { RecordEditor, type Field } from "@/components/record-editor";

import { saveCommittee, saveMember, vacateSeat } from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];

function committeeFields(editing: boolean): Field[] {
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
        { value: "APPROVES", label: "Approves" },
        { value: "RECOMMENDS", label: "Recommends" },
        { value: "CONSENTS", label: "Consents — a precondition, not an authority" },
        { value: "DECIDES", label: "Decides" },
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
      name: "compositionProvenance",
      label: "Where the membership came from",
      placeholder: "Not set",
      options: PROVENANCE_OPTIONS,
    },
    { kind: "money", name: "valueScopeMin", label: "Value scope from" },
    { kind: "money", name: "valueScopeMax", label: "Value scope to" },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddCommittee() {
  return (
    <RecordEditor
      title="Add a committee"
      description="A body that must sit before a procurement decision can be made."
      fields={committeeFields(false)}
      action={saveCommittee}
      submitLabel="Add committee"
      trigger={{ label: "Add committee", icon: true }}
      size=" modal--lg"
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
}

export function EditCommittee({ committee }: { committee: CommitteeValues }) {
  return (
    <RecordEditor
      title={`Edit ${committee.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...committeeFields(true)]}
      action={saveCommittee}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size=" modal--lg"
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
      }}
    />
  );
}

function memberFields(people: { id: string; name: string }[], offices: { code: string; nameEn: string }[]): Field[] {
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
    { kind: "text", name: "appointmentRef", label: "Appointment reference" },
    { kind: "date", name: "effectiveFrom", label: "Held from", required: true },
    { kind: "date", name: "effectiveTo", label: "Held to" },
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
}: {
  committeeId: string;
  people: { id: string; name: string }[];
  offices: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title="Add a seat"
      fields={memberFields(people, offices)}
      values={{ committeeId }}
      action={saveMember}
      submitLabel="Add seat"
      trigger={{ label: "Add seat", icon: true }}
      size=" modal--lg"
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
  appointmentRef: string | null;
  provenance: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function EditMember({
  member,
  people,
  offices,
}: {
  member: MemberValues;
  people: { id: string; name: string }[];
  offices: { code: string; nameEn: string }[];
}) {
  return (
    <RecordEditor
      title="Edit seat"
      fields={[{ kind: "hidden", name: "id" }, ...memberFields(people, offices)]}
      action={saveMember}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size=" modal--lg"
      values={{
        id: member.id,
        committeeId: member.committeeId,
        personId: member.personId,
        seatRoleCode: member.seatRoleCode,
        seatLabel: member.seatLabel,
        position: member.position,
        isAlternate: member.isAlternate,
        appointmentRef: member.appointmentRef,
        provenance: member.provenance,
        effectiveFrom: day(member.effectiveFrom),
        effectiveTo: day(member.effectiveTo),
      }}
    />
  );
}

export function VacateSeat({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Vacate ${label}`}
      description="The seat's period ends today. Votes already cast from it keep resolving to whoever cast them."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={vacateSeat}
      submitLabel="Vacate"
      destructive={{ reasonLabel: "Why is it being vacated?" }}
      trigger={{ label: "Vacate", className: "btn btn--sm btn--ghost" }}
      size=" modal--sm"
    />
  );
}
