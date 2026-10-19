import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { AMEND_LODGED_NOTE } from "@/lib/scope/labels";

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
  takeScopeSettings,
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
      description={clearsVerifications ? "Verified. Changing a fact clears the verifications and returns it to draft." : undefined}
      columns={2}
      fields={[
        hidden("exerciseId"),
        ...(kinds.length > 0
          ? [{ kind: "select", name: "contractKindCode", label: "Contract kind", placeholder: "Specify it in words instead", options: kinds } as Field]
          : [{ kind: "note", text: "Contract kinds not set. Describe the kind in words." } as Field]),
        { kind: "text", name: "contractKindOther", label: "Contract kind, in words", hint: "Used where it is not on the list." },
        ...(statuses.length > 0
          ? [{ kind: "select", name: "projectStatusCode", label: "Project status", placeholder: "Specify it in words instead", options: statuses } as Field]
          : [{ kind: "note", text: "Project statuses not set. Describe the status in words." } as Field]),
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
      description="Signed with your own password. Editing the panel later clears it."
      fields={[
        hidden("exerciseId"),
        hidden("columnCode"),
        actorField("SpecPanelVerification.person", { name: "personId", people, dated: true }),
        { kind: "date", name: "verifiedOn", label: "Verified on", hint: "Empty means today. Never after today." },
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
      description={`${reverify ? "Verified scan is no longer live. " : ""}Freezes the panel. Editing it later clears the verifications.`}
      more={`Every column is verified by a named person, and ${scans === 1 ? "the signed form is" : "the signed forms are"} attached and filed as SULIT.${reverify ? " Verifying again records the scans attached now. The trail keeps the earlier ones." : ""}`}
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
      description="Amounts are worked out from quantity and rate."
      fields={[
        hidden("exerciseId"),
        ...(templates.length > 0
          ? [{ kind: "select", name: "templateCode", label: "Start from a template", placeholder: "No template: add the sections myself", options: templates, hint: "A template brings its section headings, no lines." } as Field]
          : [{ kind: "note", text: "No bill templates set. Add sections by hand." } as Field]),
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

      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        { kind: "select", name: "scopedBy", label: "Scoped by", placeholder: "Not set", options: scopedBy },
        { kind: "textarea", name: "scopeStatement", label: "Scope statement" },
        { kind: "select", name: "followsStandard", label: "Follows the measurement standard", placeholder: "Not answered yet", options: YES_NO },
        { kind: "textarea", name: "departuresText", label: "Departures from the standard", hint: "Required when the bill does not follow it." },
        { kind: "select", name: "preparerPersonId", label: "Prepared by", placeholder: "Not named", options: people, hint: "Checked against their qualification at finalising." },
        {
          kind: "select",
          name: "provisionalExcludedFromFirm",
          label: "Provisional quantities and the firm value",
          placeholder: "Not stated",
          options: [
            { value: "yes", label: "Left out of the firm value" },
            { value: "no", label: "Counted in the firm value" },
          ],
          hint: "Not stated leaves the firm value unstated.",
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
      description={`${lines === 0 ? "It has no lines." : `Its ${lines === 1 ? "line goes" : `${lines} lines go`} with it.`} Kept in the audit trail.`}
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
      description="Amount is worked out, never typed."
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
        { kind: "text", name: "quantity", label: "Quantity", hint: "Up to three decimal places." },
        ...(scheduleOptions.length > 0
          ? [{ kind: "select", name: "scheduleItem", label: "Rate from a schedule", placeholder: "No: the rate is entered below", options: scheduleOptions, hint: "Rate in force today, kept with the line." } as Field]
          : []),
        { kind: "money", name: "rate", label: "Rate", hint: scheduleOptions.length > 0 ? "Ignored if a schedule item is chosen." : undefined },
        { kind: "switch", name: "provisional", label: "Provisional quantity", hint: "Quantity may change on site." },
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
      description="Kept in the audit trail."
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
      description="Freezes the version. A finalised version is never changed."
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
      description="Replaces the finalised version only when finalised."
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
  heading: "Check the figure before it is saved",
  note: "Not shown again once saved. Check it now.",
  submitLabel: "Save the figure",
};

export function PrepareEstimateDrawer({ exerciseId, people, allowed }: { exerciseId: string; people: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Prepare the estimate" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Prepare the company estimate"
      description="Version 1. The figure is withheld once saved."
      fields={[
        hidden("exerciseId"),
        actorField("CompanyEstimate.preparer", { name: "personId", people, hint: "One preparer throughout." }),
        { kind: "money", name: "value", label: "Company estimate", required: true, sealed: true, hint: "To the sen. Withheld from view on saving." },
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

export function AmendEstimateDrawer({ exerciseId, estimateId, preparerName, versionNo, lodged, allowed }: { exerciseId: string; estimateId: string; preparerName: string; versionNo: number; lodged: boolean; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Amend the estimate" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Amend the estimate: version ${versionNo + 1}`}
      description={`Only ${preparerName} amends it. Earlier versions and the reason are withheld.`}
      more="Earlier versions are kept, withheld from view and held unencrypted in the database."
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        actorField("CompanyEstimateVersion.preparer", { name: "personId", label: "Amended by", hint: `Only the preparer, ${preparerName}, amends it, signed in.` }),
        { kind: "money", name: "value", label: "New company estimate", required: true, sealed: true, hint: "To the sen. Withheld from view on saving." },
        ...(lodged ? [{ kind: "note" as const, text: AMEND_LODGED_NOTE }] : []),
        { kind: "textarea", name: "reason", label: "Why it is amended", required: true, hint: "Withheld with the figure." },
      ]}
      values={{ exerciseId, estimateId }}
      confirm={FIGURE_CONFIRM}
      action={amendEstimate}
      submitLabel="Check the figure"
      trigger={{ label: "Amend the estimate", className: secondary }}
      size="md"
    />
  );
}

export function LodgeEstimateDrawer({ exerciseId, estimateId, versionNo, allowed, again, relodge = false, online = false }: { exerciseId: string; estimateId: string; versionNo: number; allowed: Allowed; again: boolean; relodge?: boolean; online?: boolean }) {
  const label = relodge ? "Lodge it again" : again ? "Lodge the new version" : "Lodge the estimate";
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} />;
  return (
    <RecordEditor
      title={relodge ? `Lodge version ${versionNo} again` : `Lodge version ${versionNo}`}
      description={
        relodge
          ? "Key changed: the sealed copy cannot be opened. Lodge the same version again. Only the officer who lodged it can."
          : online
            ? "Lodges a sealed copy under the exercise's key. The version itself stays unencrypted in the database."
            : "Goes into the sealed set as the lodged copy."
      }
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        actorField("EstimateEvent.person", { name: "personId", label: "Lodged by", paper: false }),
        { kind: "text", name: "capacity", label: "Capacity", placeholder: "e.g. head of department" },
        ...(relodge ? [{ kind: "text" as const, name: "reason", label: "Why it is lodged again", required: true, placeholder: "e.g. the key was changed" }] : []),
      ]}
      values={{ exerciseId, estimateId }}
      action={lodgeEstimate}
      submitLabel={relodge ? "Lodge it again" : "Lodge the estimate"}
      trigger={{ label, className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function RetainCopyDrawer({ exerciseId, estimateId, allowed, versionNo }: { exerciseId: string; estimateId: string; allowed: Allowed; versionNo: number | null }) {
  if (!allowed.allowed) return <Blocked label="Record the retained copy" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Record the retained copy"
      description={`The second copy of the lodged version${versionNo != null ? `, version ${versionNo}` : ""}, and where it is kept.`}
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        actorField("EstimateEvent.person", { name: "personId", label: "Held by", paper: false }),
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

export function VoidEstimateDrawer({ exerciseId, estimateId, preparerName, allowed }: { exerciseId: string; estimateId: string; preparerName: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Void the company estimate" reason={allowed.reason} destructive />;
  return (
    <RecordEditor
      title={`Void the company estimate prepared by ${preparerName}`}
      description="Starts a fresh estimate from version 1. Nothing is voided once lodged."
      more="Earlier versions are kept, withheld from view and held unencrypted."
      fields={[
        hidden("exerciseId"),
        hidden("estimateId"),
        actorField("EstimateEvent.person", { name: "personId", label: "Voided by", paper: false }),
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
  file = false,
}: {
  exerciseId: string;
  table: { allowed: Allowed; versionId: string | null; versionNo: number | null; committee: string | null; act: string | null; sittings: Option[]; holders: Option[] };
  /// SR-09: the bill is an uploaded file, and it is that file's version that is tabled.
  file?: boolean;
}) {
  if (!table.allowed.allowed || !table.versionId) return <Blocked label="Table the scope" reason={table.allowed.allowed ? (file ? "There is no uploaded bill of quantities to table." : "There is no finalised bill to table.") : table.allowed.reason} primary />;
  return (
    <RecordEditor
      title={`Table version ${table.versionNo} for scope approval`}
      description={`A matter for ${table.committee ?? "the committee"} (${table.act ?? "act not set"}). Only its Secretariat tables it.`}
      fields={[
        hidden("exerciseId"),
        hidden("versionId"),
        { kind: "select", name: "meetingId", label: "Sitting", required: true, placeholder: "Choose", options: table.sittings, hint: "Sittings of the committee that are scheduled or in progress." },
        actorField("CommitteeDecision.tabledBy", { name: "tabledByPersonId", hint: table.holders.length === 0 ? "Nobody holds the Secretariat office." : "Only a holder of the Secretariat office can table." }),
      ]}
      values={{ exerciseId, versionId: table.versionId }}
      action={tableScope}
      submitLabel="Table the scope"
      trigger={{ label: "Table the scope", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

/**
 * Take the organisation's setting for the switches this exercise holds as "not set" (SR-08, SR-09, ADR 0035). It copies what Configuration says now, once, and is not a free choice:
 * from the first submission the exercise's switches are frozen. Disabled with the reason where the organisation has not set them either.
 */
export function TakeSettingsDrawer({ exerciseId, take, rows }: { exerciseId: string; take: Allowed; rows: [string, string][] }) {
  if (!take.allowed) return <Blocked label="Take the organisation's setting" reason={take.reason} primary />;
  return (
    <RecordEditor
      title="Take the organisation's setting"
      description="Takes the current setting once. Frozen on first submission."
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      sections={
        <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-3">{k}</dt>
              <dd className="min-w-0 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      }
      action={takeScopeSettings}
      submitLabel="Take the setting"
      trigger={{ label: "Take the organisation's setting", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
