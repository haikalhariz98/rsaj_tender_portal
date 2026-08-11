import { RecordEditor, type Field } from "@/components/record-editor";
import type { Assignment, Office, Person } from "@/lib/people/types";

import { endAssignment, saveAssignment, saveOffice, savePerson } from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (n: number) => String(n);

const personFields: Field[] = [
  { kind: "text", name: "name", label: "Name", required: true },
  { kind: "text", name: "staffNo", label: "Staff number", mono: true },
  { kind: "text", name: "jobTitle", label: "Job title" },
  { kind: "text", name: "email", label: "Email" },
  {
    kind: "switch",
    name: "isActive",
    label: "Still with the organisation",
    hint: "A leaver is never deleted — decisions they voted on must keep resolving to a name.",
  },
];

export function AddPerson() {
  return (
    <RecordEditor
      title="Add an officer"
      description="A person on record. Separate from sign-in, which does not exist yet."
      fields={personFields}
      action={savePerson}
      submitLabel="Add officer"
      trigger={{ label: "Add officer", icon: true }}
      size="sm"
    />
  );
}

export function EditPerson({ person }: { person: Person }) {
  return (
    <RecordEditor
      title={`Edit ${person.name}`}
      fields={[{ kind: "hidden", name: "id" }, ...personFields]}
      action={savePerson}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size="sm"
      values={{
        id: person.id,
        name: person.name,
        staffNo: person.staffNo,
        jobTitle: person.jobTitle,
        email: person.email,
        isActive: person.isActive,
      }}
    />
  );
}

function officeFields(editing: boolean, offices: Office[]): Field[] {
  const others = offices.map((o) => ({ value: o.code, label: o.nameEn }));
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
    { kind: "text", name: "nameMs", label: "Name (Malay)", required: true },
    {
      kind: "switch",
      name: "isCommittee",
      label: "This office is a committee rather than a person",
    },
    {
      kind: "select",
      name: "escalatesToCode",
      label: "When the holder is absent, authority passes to",
      placeholder: "Nowhere — it waits",
      hint: "Authority reverts upward. It never passes down.",
      options: others,
    },
    {
      kind: "select",
      name: "selfApprovalEscalatesToCode",
      label: "When the holder is the requester, approval passes to",
      placeholder: "Not set",
      hint: "Nobody approves their own matter.",
      options: others,
    },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
  ];
}

export function AddOffice({ offices }: { offices: Office[] }) {
  return (
    <RecordEditor
      title="Add an office"
      description="An office or committee that can hold authority."
      fields={officeFields(false, offices)}
      action={saveOffice}
      submitLabel="Add office"
      trigger={{ label: "Add office", icon: true }}
    />
  );
}

export function EditOffice({ office, offices }: { office: Office; offices: Office[] }) {
  return (
    <RecordEditor
      title={`Edit ${office.nameEn}`}
      fields={[
        { kind: "hidden", name: "id" },
        ...officeFields(true, offices.filter((o) => o.code !== office.code)),
      ]}
      action={saveOffice}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      values={{
        id: office.id,
        code: office.code,
        nameEn: office.nameEn,
        nameMs: office.nameMs,
        isCommittee: office.isCommittee,
        escalatesToCode: office.escalatesToCode,
        selfApprovalEscalatesToCode: office.selfApprovalEscalatesToCode,
        sortOrder: num(office.sortOrder),
      }}
    />
  );
}

function assignmentFields(people: Person[], offices: Office[]): Field[] {
  return [
    {
      kind: "select",
      name: "personId",
      label: "Officer",
      required: true,
      placeholder: "Choose",
      options: people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
    },
    {
      kind: "select",
      name: "roleCode",
      label: "Office",
      required: true,
      placeholder: "Choose",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
    },
    {
      kind: "text",
      name: "scope",
      label: "Scope",
      hint: "Set where the office is held per department rather than organisation-wide.",
    },
    { kind: "date", name: "effectiveFrom", label: "Held from", required: true },
    {
      kind: "date",
      name: "effectiveTo",
      label: "Held to",
      hint: "Leave empty while they still hold it.",
    },
  ];
}

export function AddAssignment({ people, offices }: { people: Person[]; offices: Office[] }) {
  return (
    <RecordEditor
      title="Assign an office"
      description="A rule routes to an office. Only an assignment turns it into a signatory."
      fields={assignmentFields(people, offices)}
      action={saveAssignment}
      submitLabel="Assign"
      trigger={{ label: "Assign office", icon: true }}
      size="sm"
    />
  );
}

export function EditAssignment({
  assignment,
  people,
  offices,
}: {
  assignment: Assignment;
  people: Person[];
  offices: Office[];
}) {
  return (
    <RecordEditor
      title="Edit assignment"
      fields={[{ kind: "hidden", name: "id" }, ...assignmentFields(people, offices)]}
      action={saveAssignment}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size="sm"
      values={{
        id: assignment.id,
        personId: assignment.personId,
        roleCode: assignment.roleCode,
        scope: assignment.scope,
        effectiveFrom: day(assignment.effectiveFrom),
        effectiveTo: day(assignment.effectiveTo),
      }}
    />
  );
}

export function EndAssignment({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`End ${label}`}
      description="The period closes today. Decisions already signed under it keep resolving to the signatory."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={endAssignment}
      submitLabel="End it"
      destructive={{ reasonLabel: "Why is it ending?" }}
      trigger={{ label: "End", className: "btn btn--sm btn--ghost" }}
      size="sm"
    />
  );
}
