import {
  CheckIcon,
  HelpCircle,
  InfoIcon,
  PencilIcon,
  ShieldIcon,
  SwapIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { buttonClass } from "@/components/ui/button";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { Capability } from "@/lib/people/capabilities";
import { statusOf, type Delegation } from "@/lib/people/delegation";
import type { Assignment, Office, Person } from "@/lib/people/types";
import { avatarTone, initials } from "@/lib/format";

import {
  endAssignment,
  saveAssignment,
  saveDelegation,
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
      orphanLabel: "A role that is no longer configured",
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
  /// What this person may do, through the roles they hold. Read-only here: it is
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
                None. Capabilities come from the roles they hold, and they hold none yet.
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
          ? "They stay on record, and decisions they signed keep resolving to their name. No new role can be assigned to them; roles they still hold are flagged on the Roles tab until each assignment is ended."
          : "They can hold a role again. Nothing that happened while they were marked as left is altered."
      }
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "isActive" },
      ]}
      values={{ id: person.id, isActive: leaving ? "" : "yes" }}
      action={setPersonActive}
      submitLabel={leaving ? "Mark as left" : "Reinstate"}
      // Marking somebody as left leaves every role they hold without a signatory, so
      // it asks why in red. Putting them back is not destructive, but it still asks —
      // nobody is signed in, and the reason is the only account of either.
      destructive={leaving ? { reasonLabel: "Why are they leaving?" } : undefined}
      reason={leaving ? undefined : { label: "Why are they coming back?" }}
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
            hint: "What an approval rule routes to.",
          },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)", required: true },
    {
      kind: "switch",
      name: "isCommittee",
      label: "This role is a committee rather than a person",
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
      title="Add a role"
      description="A role or committee that can hold authority."
      icon={<ShieldIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={officeFields(false, offices)}
      columns={2}
      action={saveOffice}
      submitLabel="Add role"
      trigger={{ label: "Add role", icon: true }}
      size="lg"
    />
  );
}

export function EditOffice({ office, offices }: { office: Office; offices: Office[] }) {
  return (
    <RecordEditor
      title={office.nameEn}
      description={office.authorityLevel || undefined}
      icon={<ShieldIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={[
        { kind: "hidden", name: "id" },
        ...officeFields(true, offices.filter((o) => o.code !== office.code)),
      ]}
      columns={2}
      action={saveOffice}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
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
      label: "Person",
      required: true,
      placeholder: "Choose",
      options: people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
    },
    {
      kind: "select",
      name: "roleCode",
      label: "Role",
      required: true,
      placeholder: "Choose",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
    },
    {
      kind: "text",
      name: "scope",
      label: "Scope",
      hint: "Set where the role is held per department rather than organisation-wide.",
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
      title="Assign a role"
      description="A rule routes to a role. Only an assignment turns it into a signatory."
      icon={<UserIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={assignmentFields(people, offices)}
      columns={2}
      action={saveAssignment}
      submitLabel="Assign"
      trigger={{ label: "Assign role", icon: true }}
      size="lg"
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
      title="Assignment"
      description="Who holds a role, and when"
      icon={<UserIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={[{ kind: "hidden", name: "id" }, ...assignmentFields(people, offices)]}
      columns={2}
      action={saveAssignment}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
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

/**
 * A delegation, in the sample's shape: who to whom, over what period, over which
 * capabilities, and why — in both languages.
 *
 * Two deliberate departures from the sample, both because it is a click-through with
 * no records behind it.
 *
 * The role is ours. Authority is held in a role, and a delegation hands over part of
 * what that role may do; without it there is nothing to check the chosen capabilities
 * against.
 *
 * The status is read, not chosen. The sample offers a select of Scheduled / In force
 * / Ended, which can be set to disagree with the dates beside it. A delegation that
 * says it is in force on a period that ended last week is the kind of record an audit
 * cannot survive, so it is derived from the dates instead.
 */
function delegationFields(
  people: Person[],
  offices: Office[],
  capabilities: Capability[],
  status?: string,
): Field[] {
  const persons = people
    .filter((p) => p.isActive)
    .map((p) => ({ value: p.id, label: p.name }));

  return [
    {
      kind: "select",
      name: "fromPersonId",
      label: "From",
      required: true,
      placeholder: "Choose",
      options: persons,
    },
    {
      kind: "select",
      name: "toPersonId",
      label: "To",
      required: true,
      placeholder: "Choose",
      options: persons,
    },
    { kind: "date", name: "effectiveFrom", label: "From", required: true },
    {
      kind: "date",
      name: "effectiveTo",
      label: "To",
      hint: "Required unless named capabilities are chosen below: a delegation is limited in time or in task. Set an earlier date to end one early.",
    },
    {
      kind: "select",
      name: "roleCode",
      label: "Delegating from",
      required: true,
      placeholder: "Choose",
      hint: "The role whose authority is being handed over.",
      orphanLabel: "A role that is no longer configured",
      options: offices.map((o) => ({ value: o.code, label: o.nameEn })),
    },
    {
      kind: "tokens",
      name: "capabilityCodes",
      label: "What is delegated",
      placeholder: "Select…",
      hint: "Leave it empty to hand over the whole role, which is a larger act.",
      options: capabilities.map((c) => ({ value: c.code, label: c.nameEn })),
    },
    { kind: "text", name: "reason", label: "Reason (EN)" },
    { kind: "text", name: "reasonMs", label: "Reason (BM)" },
    {
      kind: "readonly",
      name: "status",
      label: "Status",
      text: status ?? "Set by the dates above",
      hint: "Read from the period, never set by hand.",
    },
  ];
}

const DELEGATION_NOTE = (
  <div className="callout callout--info">
    <span className="callout__ico">
      <InfoIcon size={16} />
    </span>
    <div className="grow" style={{ minWidth: 0 }}>
      <span className="sm">
        A delegation lapses on its end date without anyone having to withdraw it.
      </span>
    </div>
  </div>
);

export function AddDelegation({
  people,
  offices,
  capabilities,
}: {
  people: Person[];
  offices: Office[];
  capabilities: Capability[];
}) {
  return (
    <RecordEditor
      title="New delegation"
      description="Delegation"
      icon={<SwapIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={delegationFields(people, offices, capabilities)}
      columns={2}
      sections={DELEGATION_NOTE}
      action={saveDelegation}
      submitLabel="Save"
      trigger={{ label: "New delegation", icon: true }}
      size="lg"
    />
  );
}

export function EditDelegation({
  delegation,
  people,
  offices,
  capabilities,
  status,
}: {
  delegation: Delegation;
  people: Person[];
  offices: Office[];
  capabilities: Capability[];
  status: string;
}) {
  return (
    <RecordEditor
      title="Delegation"
      description="Delegation"
      icon={<SwapIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      fields={[
        { kind: "hidden", name: "id" },
        ...delegationFields(people, offices, capabilities, status),
      ]}
      columns={2}
      sections={DELEGATION_NOTE}
      action={saveDelegation}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
      values={{
        id: delegation.id,
        fromPersonId: delegation.fromPersonId,
        toPersonId: delegation.toPersonId,
        effectiveFrom: day(delegation.effectiveFrom),
        effectiveTo: day(delegation.effectiveTo),
        roleCode: delegation.roleCode,
        capabilityCodes: delegation.capabilityCodes.join("\n"),
        reason: delegation.reason,
        reasonMs: delegation.reasonMs,
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
      trigger={{ label: "End", className: buttonClass("ghost", "sm", "text-rose-700 hover:bg-rose-50 hover:text-rose-800") }}
      size="sm"
    />
  );
}
