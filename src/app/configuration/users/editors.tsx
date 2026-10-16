"use client";

import { useCallback } from "react";

import { EMPTY_FORM_STATE } from "@/components/record-editor";
import { stage, STORED_NOT_FILED, useStagedRef } from "@/components/attachments/upload-actions";
import { STAGED_FOR_DELEGATION } from "@/lib/documents/staged-for";
import type { UploadView } from "@/lib/documents/views";
import { END_DAY_LABEL, periodText } from "@/lib/effective-text";
import { RECOMMENDATION_HINT, recommendationNote } from "@/lib/people/labels";
import { MARK_AWAY_NEEDS_PERMISSION, markAwayDisabled } from "@/lib/people/mark-away";
import {
  CheckIcon,
  HelpCircle,
  PencilIcon,
  ShieldIcon,
  SwapIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip, Dot, type Tone } from "@/components/ui/badge";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/field";
import { RecordEditor, type Field, type SaveAction } from "@/components/record-editor";
import { actorField } from "@/lib/auth/actor-field";
import type { Capability } from "@/lib/people/capabilities";
import { holderOf, statusOf, type Delegation } from "@/lib/people/delegation";
import type { Assignment, Office, Person } from "@/lib/people/types";

import { NO_SUPERIOR_CHOICE } from "@/lib/people/reporting-lines";

import {
  endAssignment,
  saveAssignment,
  saveDelegation,
  saveOffice,
  savePerson,
  saveReportingLine,
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
function personFields(offices: Office[], authorityLevels: string[], units: UnitOption[]): Field[] {
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
    {
      kind: "select",
      name: "orgUnitCode",
      label: "Unit",
      // Checked against the structure when saved. Not recorded is allowed: only an opening
      // panel under an independence rule needs it, and says so.
      placeholder: "Not recorded",
      orphanLabel: "A unit no longer in the structure",
      options: units.map((u) => ({ value: u.code, label: u.nameEn })),
      hint: "Where a committee excludes a unit from its opening panel, this is what is checked.",
    },
  ];
}

/// A labelled band inside the drawer — the sample's label row with an optional count.
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
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-bold tracking-[0.04em] text-ink-3 uppercase">{label}</h3>
        {tip && (
          <span className="inline-flex cursor-help text-ink-4" title={tip}>
            <HelpCircle size={13} />
          </span>
        )}
        {count != null && (
          <span className="ml-auto text-[12px] font-semibold text-ink-3 tabular-nums">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

export type UnitOption = { code: string; nameEn: string };

export function AddPerson({
  offices,
  authorityLevels,
  units,
}: {
  offices: Office[];
  authorityLevels: string[];
  units: UnitOption[];
}) {
  return (
    <RecordEditor
      title="Add a person"
      description="Someone on record. Separate from sign-in, which does not exist yet."
      icon={<UserIcon size={18} />}
      fields={personFields(offices, authorityLevels, units)}
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
  units,
  mayMarkAway,
}: {
  person: Person;
  offices: Office[];
  authorityLevels: string[];
  units: UnitOption[];
  /// What this person may do, through the roles they hold. Read-only here: it is
  /// granted to the role on the Permissions tab, not to the person.
  capabilities: Capability[];
  delegations: Delegation[];
  nameOf: (id: string) => string;
  /// The viewer holds the permission that marking a person away needs (ruling on log line 1770). The server refuses otherwise; this only says so before.
  mayMarkAway: boolean;
}) {
  const on = new Date();
  const awayWithheld = markAwayDisabled(person.isAvailable, mayMarkAway);

  return (
    <RecordEditor
      title={person.name}
      description={person.jobTitle ?? undefined}
      icon={<UserIcon size={18} />}
      fields={[{ kind: "hidden", name: "id" }, ...personFields(offices, authorityLevels, units)]}
      columns={2}
      action={savePerson}
      trigger={{ label: `Edit ${person.name}`, iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      identity={
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink" title={person.name}>
              {person.name}
            </div>
            <div className="truncate text-[12.5px] text-ink-3">
              {person.email ?? "No email on record"}
            </div>
          </div>
        </div>
      }
      sections={
        <>
          <hr className="border-line" />
          <DrawerSection label="Capabilities" count={capabilities.length}>
            {capabilities.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">
                None. Capabilities come from the roles they hold, and they hold none yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((c) => (
                  <Badge key={c.id} outline title={c.nameEn}>
                    {c.nameEn}
                  </Badge>
                ))}
              </div>
            )}
          </DrawerSection>

          <hr className="border-line" />
          <DrawerSection
            label="Out of office"
            tip="Marks them as away. Their pending steps move up to the office authority reverts to, where their reporting line is recorded. Marking them available again moves nothing back. Cover is a delegation, recorded separately."
          >
            <Switch name="isAway" label="Currently away" defaultChecked={!person.isAvailable} disabled={awayWithheld} aria-describedby={awayWithheld ? `away-needs-${person.id}` : undefined} />
            {awayWithheld && (
              <p id={`away-needs-${person.id}`} className="text-[12.5px] text-ink-3">
                {MARK_AWAY_NEEDS_PERMISSION}
              </p>
            )}
          </DrawerSection>

          <DrawerSection label="Delegation">
            {delegations.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">Nothing delegated to or by them.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {delegations.map((d) => {
                  const status = statusOf(d, on);
                  const { label, tone } = DELEGATION_STATUS[status];
                  const parties = `${nameOf(holderOf(d))} → ${nameOf(d.toPersonId)}`;
                  return (
                    <li
                      key={d.id}
                      className="flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-ink/[0.04]"
                    >
                      <SwapIcon size={14} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink" title={parties}>
                        {parties}
                      </span>
                      <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">
                        {periodText(d)}
                      </span>
                      <Chip tone={tone} icon={<Dot tone={tone} />} title={label}>
                        {label}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
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
        orgUnitCode: person.orgUnitCode ?? null,
      }}
    />
  );
}

/// How a delegation's status reads in the person drawer. Derived from the period.
const DELEGATION_STATUS: Record<ReturnType<typeof statusOf>, { label: string; tone: Tone }> = {
  IN_FORCE: { label: "In force", tone: "ok" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  ENDED: { label: "Ended", tone: "neutral" },
};

/**
 * Marking someone as having left, and putting them back.
 *
 * Not in the drawer: the sample has no such control there, and it is not an edit —
 * it stops every assignment they hold from resolving. A reason is required because
 * nobody is signed in, so it is the only account of why.
 */
export function LeaverToggle({ person, exposure = [] }: { person: Person; exposure?: string[] }) {
  const leaving = person.isActive;
  return (
    <RecordEditor
      title={leaving ? `Mark ${person.name} as left` : `Reinstate ${person.name}`}
      description={
        leaving
          ? `They stay on record, and decisions they signed keep resolving to their name. No new role can be assigned to them; roles they still hold are flagged on the Roles tab until each assignment is ended.${exposure.length ? ` They are a named opening officer of ${exposure.length === 1 ? "an online exercise" : `${exposure.length} online exercises`}, and leaving affects ${exposure.length === 1 ? "it" : "them"}: ${exposure.join(" ")}` : ""}`
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
        iconOnly: leaving ? <XIcon size={15} /> : <CheckIcon size={15} />,
        // Marking somebody as left is the destructive one, and reads so.
        className: leaving
          ? iconButtonClass("sm", false, "text-rose-700 hover:bg-rose-50 hover:text-rose-800")
          : undefined,
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
      icon={<ShieldIcon size={18} />}
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
      icon={<ShieldIcon size={18} />}
      fields={[
        { kind: "hidden", name: "id" },
        ...officeFields(true, offices.filter((o) => o.code !== office.code)),
      ]}
      columns={2}
      action={saveOffice}
      trigger={{ label: `Edit ${office.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
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
      label: END_DAY_LABEL,
      hint: "The first day they no longer hold it. Leave empty while they still hold it.",
    },
  ];
}

export function AddAssignment({ people, offices }: { people: Person[]; offices: Office[] }) {
  return (
    <RecordEditor
      title="Assign a role"
      description="A rule routes to a role. Only an assignment turns it into a signatory."
      icon={<UserIcon size={18} />}
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
      icon={<UserIcon size={18} />}
      fields={[{ kind: "hidden", name: "id" }, ...assignmentFields(people, offices)]}
      columns={2}
      action={saveAssignment}
      trigger={{ label: "Edit assignment", iconOnly: <PencilIcon size={15} /> }}
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
  upload: UploadView,
  status?: string,
  attachedNote?: string | null,
  /// An existing delegation recorded before the superior rule: it has no jobholder and may keep none (the grantor is taken as the holder), so the field is not required.
  beforeSuperiorRule = false,
): Field[] {
  const persons = people
    .filter((p) => p.isActive)
    .map((p) => ({ value: p.id, label: p.name }));

  return [
    // The grantor is the signed-in person, or another whose delegation is recorded from their letter (the paper's reference or the reason is then asked).
    actorField("Delegation.fromPerson", { name: "fromPersonId", people: persons, named: {} }),
    // FR-APR-011 (ruling of 2026-10-08, log line 1773): whose authority is delegated, apart from who grants it.
    {
      kind: "select",
      name: "jobholderPersonId",
      label: "Jobholder (whose authority this is)",
      required: !beforeSuperiorRule,
      placeholder: beforeSuperiorRule ? "Not recorded: before the superior rule" : "Choose",
      hint: "The person who holds the role. Not the grantor: nobody delegates their own authority, so the grantor is the jobholder's immediate superior and the delegate reports directly to the jobholder. Those two are checked against the reporting lines once they are recorded.",
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
      label: END_DAY_LABEL,
      hint: "The first day it no longer applies. Required unless named capabilities are chosen below: a delegation is limited in time or in task. Set an earlier date to end one early.",
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
      hint: "Leave it empty to hand over the whole role, which is a larger act. Naming capabilities limits the delegation to those tasks: it hands over those capabilities and does not carry an approval step.",
      options: capabilities.map((c) => ({ value: c.code, label: c.nameEn })),
    },
    { kind: "text", name: "reason", label: "Reason (EN)" },
    { kind: "text", name: "reasonMs", label: "Reason (BM)" },
    {
      kind: "textarea",
      name: "holderRecommendation",
      label: "The absent holder's recommendation",
      hint: RECOMMENDATION_HINT,
    },
    { kind: "date", name: "holderRecommendedOn", label: "Recommended on" },
    ...recommendationUploadFields(upload, attachedNote),
    {
      kind: "readonly",
      name: "status",
      label: "Status",
      text: status ?? "Set by the dates above",
      hint: "Read from the period, never set by hand.",
    },
  ];
}

/// The signed recommendation itself: a scan, stored and attached to the delegation in the
/// same save (OD-6). Its class and who is recording it are asked for because the portal
/// invents neither.
function recommendationUploadFields(upload: UploadView, attachedNote?: string | null): Field[] {
  return [
    ...(attachedNote ? ([{ kind: "note", text: attachedNote }] as Field[]) : []),
    ...(upload.refusals.length ? ([{ kind: "note", text: `Uploads are refused until this is set. ${upload.refusals.join(" ")}` }] as Field[]) : []),
    {
      kind: "file",
      name: "file",
      label: "Signed recommendation (scan)",
      accept: upload.accept || undefined,
      hint: [upload.allowedTypes.length ? `Allowed: ${upload.allowedTypes.join(", ")}.` : null, upload.capText ? `${upload.capText}.` : null, "Needed where the person delegating is away."].filter(Boolean).join(" "),
    },
    { kind: "select", name: "documentClassId", label: "Class of the scan", placeholder: "Choose a class", options: upload.classes, hint: "Needed when a file is chosen." },
    // The scan is recorded by the signed-in officer (Phase 2b): the upload takes the person from the session.
  ];
}

/**
 * The delegation form's save: the scan, if one is chosen, goes to the upload route
 * (a Server Action cannot take it), and only its version id goes to `saveDelegation`.
 * A save refused after the file was stored keeps the stored version, so pressing Save
 * again retries only the save.
 */
function useDelegationSave(people: Person[]): SaveAction {
  const stagedRef = useStagedRef();
  return useCallback<SaveAction>(
    async (_prev, data) => {
      const next = new FormData();
      for (const [k, v] of data.entries()) if (k !== "file" && k !== "documentClassId") next.append(k, v);
      let staged = false;
      const file = data.get("file");
      if (file instanceof File && file.name) {
        // The absent holder is the jobholder where the delegation records one, the grantor on a delegation recorded before the rule.
        const holder = people.find((p) => p.id === String(data.get("jobholderPersonId") || data.get("fromPersonId") || ""));
        const up = new FormData();
        for (const k of ["file", "documentClassId"]) up.set(k, data.get(k) ?? "");
        up.set("title", `Signed recommendation of ${holder?.name ?? "the absent holder"}`);
        const s = await stage(up, stagedRef, { stagedFor: STAGED_FOR_DELEGATION });
        if (!s.ok) return s.state;
        next.set("recommendationVersionId", s.versionId);
        staged = true;
      }
      const r = await saveDelegation(EMPTY_FORM_STATE, next);
      if (r.ok) stagedRef.current = null;
      else if (staged) return { ...r, message: [r.message, STORED_NOT_FILED.replace("attaching", "saving")].filter(Boolean).join(" ") };
      return r;
    },
    [people, stagedRef],
  );
}

const DELEGATION_NOTE = (
  <Callout tone="info">
    A delegation lapses on its end date without anyone having to withdraw it.
  </Callout>
);

export function AddDelegation({
  people,
  offices,
  capabilities,
  upload,
}: {
  people: Person[];
  offices: Office[];
  capabilities: Capability[];
  upload: UploadView;
}) {
  const save = useDelegationSave(people);
  return (
    <RecordEditor
      title="New delegation"
      description="Delegation"
      icon={<SwapIcon size={18} />}
      fields={delegationFields(people, offices, capabilities, upload)}
      columns={2}
      sections={DELEGATION_NOTE}
      action={save}
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
  upload,
}: {
  delegation: Delegation;
  people: Person[];
  offices: Office[];
  capabilities: Capability[];
  status: string;
  upload: UploadView;
}) {
  const save = useDelegationSave(people);
  return (
    <RecordEditor
      title="Delegation"
      description="Delegation"
      icon={<SwapIcon size={18} />}
      fields={[
        { kind: "hidden", name: "id" },
        ...delegationFields(people, offices, capabilities, upload, status, recommendationNote(delegation), delegation.jobholderPersonId == null),
      ]}
      columns={2}
      sections={DELEGATION_NOTE}
      action={save}
      trigger={{ label: "Edit delegation", iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id: delegation.id,
        fromPersonId: delegation.fromPersonId,
        jobholderPersonId: delegation.jobholderPersonId ?? null,
        toPersonId: delegation.toPersonId,
        effectiveFrom: day(delegation.effectiveFrom),
        effectiveTo: day(delegation.effectiveTo),
        roleCode: delegation.roleCode,
        capabilityCodes: delegation.capabilityCodes.join("\n"),
        reason: delegation.reason,
        reasonMs: delegation.reasonMs,
        holderRecommendation: delegation.holderRecommendation ?? null,
        holderRecommendedOn: day(delegation.holderRecommendedOn ?? null),
      }}
    />
  );
}

export function EndAssignment({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`End ${label}`}
      description="Choose the first day they no longer hold it; that day is not included. Decisions already signed under it keep resolving to the signatory."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "date", name: "effectiveTo", label: END_DAY_LABEL, required: true, hint: "Today or later. To correct a period already past, use Edit." },
      ]}
      values={{ id }}
      action={endAssignment}
      submitLabel="End it"
      destructive={{ reasonLabel: "Why is it ending?" }}
      trigger={{
        label: "End",
        className: buttonClass("destructive", "sm"),
      }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ reporting lines

/// One reporting line as the editor holds it.
export interface ReportingLineRow {
  id: string;
  personId: string;
  superiorPersonId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  provenance: "STATED" | "OBSERVED" | "ASSUMED";
  note: string;
}

function reportingLineFields(people: Person[]): Field[] {
  const persons = people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));
  return [
    { kind: "select", name: "personId", label: "Person", required: true, placeholder: "Choose", options: persons },
    {
      kind: "select",
      name: "superiorPersonId",
      label: "Reports to",
      required: true,
      placeholder: "Choose",
      hint: "Their immediate superior. Choose the last option to record that nobody is above them: that is a recorded fact, not the same as no line.",
      options: [...persons, { value: NO_SUPERIOR_CHOICE, label: "Nobody: the head of their line" }],
    },
    { kind: "date", name: "effectiveFrom", label: "From", required: true },
    { kind: "date", name: "effectiveTo", label: END_DAY_LABEL, hint: "The first day it no longer applies. Leave empty while it still does." },
    {
      kind: "select",
      name: "provenance",
      label: "Where this came from",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "STATED", label: "Stated: written in a governing document" },
        { value: "OBSERVED", label: "Observed: seen in practice" },
        { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
      ],
    },
    { kind: "text", name: "note", label: "Note", hint: "Where it is written, or who confirmed it." },
  ];
}

export function AddReportingLine({ people }: { people: Person[] }) {
  return (
    <RecordEditor
      title="Reporting line"
      description="Who a person reports to, and from when"
      icon={<UserIcon size={18} />}
      fields={reportingLineFields(people)}
      columns={2}
      action={saveReportingLine}
      submitLabel="Record"
      trigger={{ label: "Record reporting line", icon: true }}
      size="lg"
    />
  );
}

export function EditReportingLine({ line, people }: { line: ReportingLineRow; people: Person[] }) {
  return (
    <RecordEditor
      title="Reporting line"
      description="Who a person reports to, and from when"
      icon={<UserIcon size={18} />}
      fields={[{ kind: "hidden", name: "id" }, ...reportingLineFields(people)]}
      columns={2}
      action={saveReportingLine}
      trigger={{ label: "Edit reporting line", iconOnly: <PencilIcon size={15} /> }}
      size="lg"
      values={{
        id: line.id,
        personId: line.personId,
        superiorPersonId: line.superiorPersonId ?? NO_SUPERIOR_CHOICE,
        effectiveFrom: day(line.effectiveFrom),
        effectiveTo: day(line.effectiveTo),
        provenance: line.provenance,
        note: line.note,
      }}
    />
  );
}
