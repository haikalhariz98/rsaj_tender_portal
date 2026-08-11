import { CheckIcon, HelpCircle, PencilIcon, SwapIcon, UserIcon, XIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { Capability } from "@/lib/people/capabilities";
import { statusOf, type Delegation } from "@/lib/people/delegation";
import type { Assignment, Office, Person } from "@/lib/people/types";
import { avatarTone, initials } from "@/lib/format";

import {
  endAssignment,
  saveAssignment,
  saveOffice,
  savePerson,
  setPersonActive,
} from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (n: number) => String(n);

/**
 * The person form, in the order the prototype's drawer has it: two columns, reading
 * left to right.
 *
 * `staffNo` and `isActive` are deliberately absent. The sample does not collect them
 * here, and `savePerson` writes only the keys this form posts, so leaving them out
 * leaves them alone rather than clearing them.
 */
function personFields(offices: Office[], authorityLevels: string[]): Field[] {
  return [
    { kind: "text", name: "name", label: "Name", required: true },
    { kind: "text", name: "email", label: "Email", required: true },
    { kind: "text", name: "jobTitle", label: "Job title (EN)" },
    { kind: "text", name: "jobTitleMs", label: "Job title (BM)" },
    {
      kind: "select",
      name: "portalRoleCode",
      label: "Portal role",
      // The sample pre-selects its first role. A pre-selected role is a policy
      // choice, and saving a person nobody classified would silently make one — so
      // the unchosen option stays.
      placeholder: "Not set",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
    },
    {
      kind: "select",
      name: "authorityLevel",
      label: "Authority level",
      placeholder: "—",
      options: authorityLevels.map((l) => ({ value: l, label: l })),
    },
    { kind: "text", name: "department", label: "Department" },
    { kind: "text", name: "telephone", label: "Telephone" },
  ];
}

/// A labelled band inside the drawer — the sample's `.lbl` row with an optional count.
function DrawerSection({
  label,
  count,
  tip,
  children,
}: {
  label: string;
  count?: number;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <span className="lbl">{label}</span>
        {tip && (
          <span className="tip" title={tip}>
            <HelpCircle size={13} className="icon faint" />
          </span>
        )}
        <div className="spacer" />
        {count != null && <span className="xs dim">{count}</span>}
      </div>
      {children}
    </div>
  );
}

export function AddPerson({
  offices,
  authorityLevels,
}: {
  offices: Office[];
  authorityLevels: string[];
}) {
  return (
    <RecordEditor
      title="Add a person"
      description="Someone on record. Separate from sign-in, which does not exist yet."
      icon={<UserIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={personFields(offices, authorityLevels)}
      columns={2}
      action={savePerson}
      submitLabel="Add person"
      trigger={{ label: "Add person", icon: true }}
      size="lg"
    />
  );
}

export function EditPerson({
  person,
  offices,
  authorityLevels,
  capabilities,
  delegations,
  nameOf,
}: {
  person: Person;
  offices: Office[];
  authorityLevels: string[];
  /// What this person may do, through the offices they hold. Read-only here: it is
  /// granted to the role on the Permissions tab, not to the person.
  capabilities: Capability[];
  delegations: Delegation[];
  nameOf: (id: string) => string;
}) {
  const on = new Date();

  return (
    <RecordEditor
      title={person.name}
      description={person.jobTitle ?? undefined}
      icon={<UserIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={[{ kind: "hidden", name: "id" }, ...personFields(offices, authorityLevels)]}
      columns={2}
      action={savePerson}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
      identity={
        <div className="row" style={{ gap: 12 }}>
          <span className={`avatar avatar--lg ${avatarTone(person.name)}`} title={person.name}>
            {initials(person.name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="sm strong">{person.name}</div>
            <div className="xs dim">{person.email ?? "No email on record"}</div>
          </div>
        </div>
      }
      sections={
        <>
          <div className="divider" />
          <DrawerSection label="Capabilities" count={capabilities.length}>
            {capabilities.length === 0 ? (
              <span className="xs dim">
                None. Capabilities come from the offices they hold, and they hold none yet.
              </span>
            ) : (
              <div className="row wrap" style={{ gap: 6 }}>
                {capabilities.map((c) => (
                  <span key={c.id} className="badge badge--outline">
                    <span className="badge__t">{c.nameEn}</span>
                  </span>
                ))}
              </div>
            )}
          </DrawerSection>

          <div className="divider" />
          <DrawerSection
            label="Out of office"
            tip="Marks them as away. Cover is a delegation, recorded separately."
          >
            <div className="stack">
              <SwitchField name="isAway" label="Currently away" checked={!person.isAvailable} />
            </div>
          </DrawerSection>

          <DrawerSection label="Delegation">
            {delegations.length === 0 ? (
              <span className="xs dim">Nothing delegated to or by them.</span>
            ) : (
              <div className="stack stack--sm">
                {delegations.map((d) => {
                  const status = statusOf(d, on);
                  return (
                    <div key={d.id} className="row hoverrow" style={{ gap: 10, padding: "9px 10px" }}>
                      <SwapIcon size={14} className="icon dim" />
                      <span className="sm grow trunc">
                        {nameOf(d.fromPersonId)} → {nameOf(d.toPersonId)}
                      </span>
                      <span className="xs dim num">
                        {day(d.effectiveFrom)} — {d.effectiveTo ? day(d.effectiveTo) : "open"}
                      </span>
                      <span
                        className={`chip${status === "IN_FORCE" ? " chip--ok" : ""}`}
                        title={status === "IN_FORCE" ? "In force" : status === "SCHEDULED" ? "Scheduled" : "Ended"}
                      >
                        <span className="dot" />
                        <span className="badge__t">
                          {status === "IN_FORCE"
                            ? "In force"
                            : status === "SCHEDULED"
                              ? "Scheduled"
                              : "Ended"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </DrawerSection>
        </>
      }
      values={{
        id: person.id,
        name: person.name,
        email: person.email,
        jobTitle: person.jobTitle,
        jobTitleMs: person.jobTitleMs,
        portalRoleCode: person.portalRoleCode,
        authorityLevel: person.authorityLevel,
        department: person.department,
        telephone: person.telephone,
        isAway: !person.isAvailable,
      }}
    />
  );
}

/// The sample's toggle, rendered outside the field list so it can sit in a section.
function SwitchField({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" name={name} defaultChecked={checked} />
      <span className="switch__track">
        <span className="switch__knob" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="check__txt">{label}</span>
      </span>
    </label>
  );
}

/**
 * Marking someone as having left, and putting them back.
 *
 * Not in the drawer: the sample has no such control there, and it is not an edit —
 * it stops every assignment they hold from resolving. A reason is required because
 * nobody is signed in, so it is the only account of why.
 */
export function LeaverToggle({ person }: { person: Person }) {
  const leaving = person.isActive;
  return (
    <RecordEditor
      title={leaving ? `Mark ${person.name} as left` : `Reinstate ${person.name}`}
      description={
        leaving
          ? "They stay on record. Decisions they signed keep resolving to their name, but no new office can be assigned to them."
          : "They can hold an office again. Nothing that happened while they were marked as left is altered."
      }
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "isActive" },
      ]}
      values={{ id: person.id, isActive: leaving ? "" : "yes" }}
      action={setPersonActive}
      submitLabel={leaving ? "Mark as left" : "Reinstate"}
      destructive={{ reasonLabel: leaving ? "Why are they leaving?" : "Why are they coming back?" }}
      trigger={{
        label: leaving ? "Mark as left" : "Reinstate",
        iconOnly: leaving ? <XIcon size={14} /> : <CheckIcon size={14} />,
      }}
      size="sm"
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
