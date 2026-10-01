import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import {
  amendEstimate,
  finaliseBq,
  lodgeEstimate,
  markPanelVerified,
  prepareEstimate,
  recordPanelVerification,
  recordRetainedCopy,
  removeBqItem,
  removeBqSection,
  saveBqHeader,
  saveBqItem,
  saveBqSection,
  savePanel,
  startBq,
  startBqRevision,
  tableScope,
  voidEstimate,
} from "./actions";

/**
 * The drawers of the Scope and estimate tab. Fields are data; every rule sits in the
 * action and the pure checks behind it. Where those checks already say an act cannot
 * proceed, the button is disabled and the reason is beside it (read.ts judges with the
 * same rule the action runs under its lock).
 *
 * The company estimate's drawers never carry a figure in from the server: the value field
 * is empty on every open, lives only in the browser while it is typed, and is shown back
 * once for checking. Nothing here is given a value or a reason to render.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const YES_NO: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// ------------------------------------------------------------------ specification panel

export function EditPanelDrawer({
  exerciseId,
  isNew,
  raw,
  kinds,
  statuses,
  bills,
  clearsVerifications,
}: {
  exerciseId: string;
  isNew: boolean;
  raw: Record<string, string>;
  kinds: Option[];
  statuses: Option[];
  bills: Option[];
  /// Whether saving would clear verifications already recorded.
  clearsVerifications: boolean;
}) {
  return (
    <RecordEditor
      title={isNew ? "Set up the specification panel" : "Edit the specification panel"}
      description={clearsVerifications ? "The panel is verified. Changing any fact clears its verifications, which are kept on record, and it goes back to a draft." : "The facts the signed form certifies."}
      columns={2}
      fields={[
        hidden("exerciseId"),
        ...(kinds.length > 0
          ? [{ kind: "select", name: "contractKindCode", label: "Contract kind", placeholder: "Specify it in words instead", options: kinds } as Field]
          : [{ kind: "note", text: "The list of contract kinds is not set, so the kind is specified in words. It is set under Configuration, Scope and estimate." } as Field]),
        { kind: "text", name: "contractKindOther", label: "Contract kind, in words", hint: "Used where it is not on the list." },
        ...(statuses.length > 0
          ? [{ kind: "select", name: "projectStatusCode", label: "Project status", placeholder: "Specify it in words instead", options: statuses } as Field]
          : [{ kind: "note", text: "The list of project statuses is not set, so the status is specified in words." } as Field]),
        { kind: "text", name: "projectStatusOther", label: "Project status, in words", hint: "Used where it is not on the list." },
        { kind: "text", name: "currentRevisionNo", label: "Current revision number" },
        { kind: "date", name: "currentRevisionOn", label: "Current revision date" },
        { kind: "text", name: "revisedRevisionNo", label: "Revised revision number" },
        { kind: "date", name: "revisedRevisionOn", label: "Revised revision date" },
        { kind: "text", name: "completionPeriodText", label: "Completion period" },
        { kind: "select", name: "bqVersionId", label: "Bill of quantities it certifies", placeholder: "None named", options: bills, hint: "Required where the contract basis is let on a bill." },
      ]}
      values={{ exerciseId, ...raw }}
      action={savePanel}
      submitLabel={clearsVerifications ? "Save and clear verifications" : "Save the panel"}
      trigger={{ label: isNew ? "Set up the panel" : "Edit", className: secondary }}
      size="lg"
    />
  );
}

export function VerifyColumnDrawer({ exerciseId, column, columnLabel, people }: { exerciseId: string; column: string; columnLabel: string; people: Option[] }) {
  return (
    <RecordEditor
      title={`Record who verified: ${columnLabel}`}
      description="Recorded on behalf of the person named, not signed: nobody signs in yet. The signed form itself is attached below."
      fields={[
        hidden("exerciseId"),
        hidden("columnCode"),
        { kind: "select", name: "personId", label: "Verified by", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "verifiedOn", label: "Verified on", required: true, hint: "Not after today." },
        { kind: "text", name: "note", label: "Note" },
      ]}
      values={{ exerciseId, columnCode: column }}
      action={recordPanelVerification}
      submitLabel="Record verification"
      trigger={{ label: "Record", className: secondary, ariaLabel: `Record who verified ${columnLabel}` }}
      size="md"
    />
  );
}

export function MarkVerifiedDrawer({ exerciseId, verify, scans, reverify = false }: { exerciseId: string; verify: Allowed; scans: number; reverify?: boolean }) {
  if (!verify.allowed) return <Blocked label="Mark verified" reason={verify.reason} />;
  return (
    <RecordEditor
      title={reverify ? "Verify the panel again" : "Mark the panel verified"}
      description={`${reverify ? "The scan the panel was verified on is no longer live. Verifying again records the scans attached now in its place, and the trail keeps the earlier ones. " : ""}Every column is verified by a named person, and ${scans === 1 ? "the signed form is" : "the signed forms are"} attached and filed as SULIT. The panel is frozen as it stands; editing it later clears its verifications.`}
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      action={markPanelVerified}
      submitLabel="Mark verified"
      trigger={{ label: "Mark verified", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ bill of quantities

export function StartBqDrawer({ exerciseId, templates, allowed }: { exerciseId: string; templates: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Start the bill" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Start the bill of quantities"
      description="A draft is started: its sections and lines are entered by hand, and its amounts are worked out from the quantities and rates, never typed."
      fields={[
        hidden("exerciseId"),
        ...(templates.length > 0
          ? [{ kind: "select", name: "templateCode", label: "Start from a template", placeholder: "No template: add the sections myself", options: templates, hint: "A template brings its section headings, no lines." } as Field]
          : [{ kind: "note", text: "No bill templates are configured, so the sections are added by hand. Templates are set under Configuration, Scope and estimate." } as Field]),
      ]}
      values={{ exerciseId }}
      action={startBq}
      submitLabel="Start the bill"
      trigger={{ label: "Start the bill", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function EditBqHeaderDrawer({ exerciseId, versionId, raw, scopedBy, people, allowed }: { exerciseId: string; versionId: string; raw: Record<string, string>; scopedBy: Option[]; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Edit the header" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Edit the bill's header"
      description="Who scoped the work, the scope statement and how the bill was measured."
      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        { kind: "select", name: "scopedBy", label: "Scoped by", placeholder: "Not set", options: scopedBy },
        { kind: "textarea", name: "scopeStatement", label: "Scope statement" },
        { kind: "select", name: "followsStandard", label: "Follows the measurement standard", placeholder: "Not answered yet", options: YES_NO },
        { kind: "textarea", name: "departuresText", label: "Departures from the standard", hint: "Required when the bill does not follow it." },
        { kind: "select", name: "preparerPersonId", label: "Prepared by", placeholder: "Not named", options: people, hint: "Recorded on behalf of, not signed. Checked against their qualification when the bill is finalised." },
        {
          kind: "select",
          name: "provisionalExcludedFromFirm",
          label: "Provisional quantities and the firm value",
          placeholder: "Not stated",
          options: [
            { value: "yes", label: "Left out of the firm value" },
            { value: "no", label: "Counted in the firm value" },
          ],
          hint: "Not stated leaves the firm value unstated, and does not stop the bill being finalised.",
        },
      ]}
      values={{ exerciseId, versionId, ...raw }}
      action={saveBqHeader}
      submitLabel="Save the header"
      trigger={{ label: "Edit the header", className: secondary }}
      size="lg"
    />
  );
}

export function SectionDrawer({ exerciseId, versionId, section }: { exerciseId: string; versionId: string; section?: { id: string; number: string; title: string; sortOrder: string } }) {
  return (
    <RecordEditor
      title={section ? `Edit section ${section.number}` : "Add a section"}
      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        hidden("sectionId"),
        { kind: "text", name: "number", label: "Section number", required: true },
        { kind: "text", name: "title", label: "Section title", required: true },
        { kind: "number", name: "sortOrder", label: "Order", min: 0, hint: "Sections are listed by this, lowest first." },
      ]}
      values={{ exerciseId, versionId, sectionId: section?.id ?? "", number: section?.number ?? "", title: section?.title ?? "", sortOrder: section?.sortOrder ?? "" }}
      action={saveBqSection}
      submitLabel={section ? "Save the section" : "Add the section"}
      trigger={section ? { label: "Edit", className: buttonClass("ghost", "sm"), ariaLabel: `Edit section ${section.number}` } : { label: "Add a section", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveSectionDrawer({ exerciseId, versionId, section, lines }: { exerciseId: string; versionId: string; section: { id: string; number: string; title: string }; lines: number }) {
  return (
    <RecordEditor
      title={`Remove section ${section.number}, ${section.title}`}
      description={`${lines === 0 ? "It has no lines." : `Its ${lines === 1 ? "line goes" : `${lines} lines go`} with it.`} This is a draft: what is removed is kept in full in the audit trail.`}
      fields={[hidden("exerciseId"), hidden("versionId"), hidden("sectionId")]}
      values={{ exerciseId, versionId, sectionId: section.id }}
      action={removeBqSection}
      danger
      submitLabel={`Remove section ${section.number}`}
      cancelLabel="Keep the section"
      trigger={{ label: "Remove", className: buttonClass("ghost", "sm"), ariaLabel: `Remove section ${section.number}` }}
      size="sm"
    />
  );
}

export function ItemDrawer({
  exerciseId,
  versionId,
  sections,
  kinds,
  sectionId,
  sectionName,
  item,
  scheduleItems = [],
}: {
  exerciseId: string;
  versionId: string;
  sections: Option[];
  kinds: Option[];
  /// FR-EST-004: items of the schedules in force today, as "<issue>|<code>".
  scheduleItems?: Option[];
  /// The section a new line starts in.
  sectionId: string;
  /// Names the section on the button for a screen reader, where every section has an "Add a line".
  sectionName?: string;
  item?: { id: string; label: string; raw: { itemRef: string; description: string; unit: string; kind: string; quantity: string; rate: string; provisional: boolean; sortOrder: string; scheduleItem?: string } };
}) {
  // A line already priced from a schedule may keep that pricing as it stands (the issue it came from may have been superseded since).
  const keep: Option[] = item?.raw.scheduleItem === "keep" ? [{ value: "keep", label: "Keep the rate as priced from the schedule" }] : [];
  const scheduleOptions = [...keep, ...scheduleItems];
  return (
    <RecordEditor
      title={item ? `Edit line ${item.label}` : "Add a line"}
      description="The amount is worked out from the quantity and the rate, to the sen. It is never typed."
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        hidden("itemId"),
        { kind: "select", name: "sectionId", label: "Section", required: true, placeholder: "Choose", options: sections },
        { kind: "text", name: "itemRef", label: "Item" },
        { kind: "textarea", name: "description", label: "Description", required: true },
        { kind: "text", name: "unit", label: "Unit", placeholder: "e.g. m, m³, item" },
        { kind: "select", name: "kind", label: "Kind of line", required: true, placeholder: "Choose", options: kinds },
        { kind: "text", name: "quantity", label: "Quantity", hint: "Up to three decimal places. Prime cost and provisional sums have none." },
        ...(scheduleOptions.length > 0
          ? [{ kind: "select", name: "scheduleItem", label: "Rate from a schedule", placeholder: "No: the rate is entered below", options: scheduleOptions, hint: "The rate of the issue in force today, kept with the line. A later issue never changes it." } as Field]
          : []),
        { kind: "money", name: "rate", label: "Rate", hint: scheduleOptions.length > 0 ? "Entered by hand. Ignored where a schedule item is chosen above." : undefined },
        { kind: "switch", name: "provisional", label: "Provisional quantity", hint: "Measured work only: the quantity may change when it is measured on site." },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ exerciseId, versionId, itemId: item?.id ?? "", sectionId, ...(item ? item.raw : {}), provisional: item?.raw.provisional ?? false }}
      action={saveBqItem}
      submitLabel={item ? "Save the line" : "Add the line"}
      trigger={item ? { label: "Edit", className: buttonClass("ghost", "sm"), ariaLabel: `Edit line ${item.label}` } : { label: "Add a line", icon: true, className: secondary, ariaLabel: sectionName ? `Add a line to section ${sectionName}` : undefined }}
      size="lg"
    />
  );
}

export function RemoveItemDrawer({ exerciseId, versionId, itemId, label }: { exerciseId: string; versionId: string; itemId: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove line ${label}`}
      description="This is a draft: the line is kept in full in the audit trail."
      fields={[hidden("exerciseId"), hidden("versionId"), hidden("itemId")]}
      values={{ exerciseId, versionId, itemId }}
      action={removeBqItem}
      danger
      submitLabel="Remove the line"
      cancelLabel="Keep the line"
      trigger={{ label: "Remove", className: buttonClass("ghost", "sm"), ariaLabel: `Remove line ${label}` }}
      size="sm"
    />
  );
}

export function FinaliseBqDrawer({ exerciseId, versionId, versionNo, allowed, summary }: { exerciseId: string; versionId: string; versionNo: number; allowed: Allowed; summary: [string, string][] }) {
  if (!allowed.allowed) return <Blocked label="Finalise the bill" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Finalise version ${versionNo}`}
      description="The version is frozen with its totals, the standard it follows and the preparer's qualification as they stand today. A finalised version is never changed: it is revised."
      fields={[hidden("exerciseId"), hidden("versionId")]}
      values={{ exerciseId, versionId }}
      sections={
        <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          {summary.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-3">{k}</dt>
              <dd className="min-w-0 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      }
      action={finaliseBq}
      submitLabel="Finalise the bill"
      trigger={{ label: "Finalise the bill", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function ReviseBqDrawer({ exerciseId, versionNo, allowed }: { exerciseId: string; versionNo: number; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Start a revision" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Start a revision of version ${versionNo}`}
      description="A new draft is copied from the finalised version. It replaces it only when it is finalised."
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      reason={{ label: "Why the bill is revised" }}
      action={startBqRevision}
      submitLabel="Start the revision"
      trigger={{ label: "Start a revision", className: secondary }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ company estimate (sealed)

/// The typed figure is checked once on this page, then saved; the form is emptied on every open and after saving.
const FIGURE_CONFIRM = {
  fields: ["value"],
  heading: "Check the figure before it is sealed",
  note: "Once saved, the figure is not shown again on any screen. Check it now. If it is wrong, change it.",
  submitLabel: "Seal the figure",
};

export function PrepareEstimateDrawer({ exerciseId, people, allowed }: { exerciseId: string; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Prepare the estimate" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Prepare the company estimate"
      description="Version 1, by one preparer. The figure is shown only while it is typed and once for checking, then sealed. The day is the organisation's day, set when it is saved."
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "personId", label: "Prepared by", required: true, placeholder: "Choose", options: people, hint: "Recorded on behalf of, not signed. An estimate has one preparer throughout." },
        { kind: "money", name: "value", label: "Company estimate", required: true, sealed: true, hint: "To the sen. Sealed on saving." },
      ]}
      values={{ exerciseId }}
      confirm={FIGURE_CONFIRM}
      action={prepareEstimate}
      submitLabel="Check the figure"
      trigger={{ label: "Prepare the estimate", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function AmendEstimateDrawer({ exerciseId, estimateId, preparerName, preparerPersonId, versionNo, allowed }: { exerciseId: string; estimateId: string; preparerName: string; preparerPersonId: string; versionNo: number; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Amend the estimate" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Amend the estimate: version ${versionNo + 1}`}
      description={`Only ${preparerName}, who prepared it, amends it. Earlier versions are kept, sealed. The reason is sealed with the figure.`}
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        hidden("personId"),
        { kind: "readonly", name: "amendedBy", label: "Amended by", text: preparerName, hint: "The preparer. Recorded on behalf of, not signed." },
        { kind: "money", name: "value", label: "New company estimate", required: true, sealed: true, hint: "To the sen. Sealed on saving." },
        { kind: "textarea", name: "reason", label: "Why it is amended", hint: "Required. Sealed with the figure: it is not recorded in the audit trail or shown on any screen." },
      ]}
      values={{ exerciseId, estimateId, personId: preparerPersonId }}
      confirm={FIGURE_CONFIRM}
      action={amendEstimate}
      submitLabel="Check the figure"
      trigger={{ label: "Amend the estimate", className: secondary }}
      size="md"
    />
  );
}

export function LodgeEstimateDrawer({ exerciseId, estimateId, versionNo, people, allowed, again }: { exerciseId: string; estimateId: string; versionNo: number; people: Option[]; allowed: Allowed; again: boolean }) {
  if (!allowed.allowed) return <Blocked label={again ? "Lodge the new version" : "Lodge the estimate"} reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Lodge version ${versionNo}`}
      description="The version goes into the sealed set as the lodged copy. Lodging is a custody event, recorded on behalf of the person named, not signed."
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        { kind: "select", name: "personId", label: "Lodged by", required: true, placeholder: "Choose", options: people },
        { kind: "text", name: "capacity", label: "Capacity", placeholder: "e.g. head of department" },
      ]}
      values={{ exerciseId, estimateId }}
      action={lodgeEstimate}
      submitLabel="Lodge the estimate"
      trigger={{ label: again ? "Lodge the new version" : "Lodge the estimate", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function RetainCopyDrawer({ exerciseId, estimateId, people, allowed }: { exerciseId: string; estimateId: string; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Record the retained copy" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Record the retained copy"
      description="The second copy of the lodged version, and where it is kept."
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        { kind: "select", name: "personId", label: "Held by", required: true, placeholder: "Choose", options: people },
        { kind: "text", name: "capacity", label: "Capacity" },
        { kind: "text", name: "place", label: "Where it is kept", required: true, placeholder: "e.g. the department's safe" },
      ]}
      values={{ exerciseId, estimateId }}
      action={recordRetainedCopy}
      submitLabel="Record the copy"
      trigger={{ label: "Record the retained copy", className: secondary }}
      size="md"
    />
  );
}

export function VoidEstimateDrawer({ exerciseId, estimateId, preparerName, people, allowed }: { exerciseId: string; estimateId: string; preparerName: string; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Void the company estimate" reason={allowed.reason} destructive />;
  return (
    <RecordEditor
      title={`Void the company estimate prepared by ${preparerName}`}
      description="For when its preparer cannot continue. Its versions are kept, sealed, and a new officer prepares a fresh estimate from version 1. Nothing is voided once it is lodged."
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        { kind: "select", name: "personId", label: "Recorded on behalf of", placeholder: "Not named", options: people, hint: "Not signed: nobody signs in yet." },
      ]}
      values={{ exerciseId, estimateId }}
      destructive={{ reasonLabel: "Why the preparer cannot continue" }}
      action={voidEstimate}
      submitLabel="Void the company estimate"
      cancelLabel="Keep the estimate"
      trigger={{ label: "Void the company estimate", className: buttonClass("destructive", "sm") }}
      size="md"
    />
  );
}


/// OD-9, FR-REQ-014: table the finalised bill's scope at a sitting of the committee the method names.
export function TableScopeDrawer({
  exerciseId,
  table,
}: {
  exerciseId: string;
  table: { allowed: Allowed; versionId: string | null; versionNo: number | null; committee: string | null; sittings: Option[]; holders: Option[]; acts: Option[] };
}) {
  if (!table.allowed.allowed || !table.versionId) return <Blocked label="Table the scope" reason={table.allowed.allowed ? "There is no finalised bill to table." : table.allowed.reason} primary />;
  return (
    <RecordEditor
      title={`Table version ${table.versionNo} of the bill for scope approval`}
      description={`A matter at a sitting of the ${table.committee ?? "committee"}, naming this version. It is decided there; tabling is by a holder of the committee's Secretariat office, recorded on their behalf, not signed.`}
      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        { kind: "select", name: "meetingId", label: "Sitting", required: true, placeholder: "Choose", options: table.sittings, hint: "Sittings of the committee that are scheduled or in progress." },
        { kind: "select", name: "act", label: "The committee's act", required: true, placeholder: "Choose", options: table.acts },
        { kind: "select", name: "tabledByPersonId", label: "Tabled by", required: true, placeholder: table.holders.length === 0 ? "Nobody holds the Secretariat office" : "Choose", options: table.holders },
      ]}
      values={{ exerciseId, versionId: table.versionId }}
      action={tableScope}
      submitLabel="Table the scope"
      trigger={{ label: "Table the scope", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
