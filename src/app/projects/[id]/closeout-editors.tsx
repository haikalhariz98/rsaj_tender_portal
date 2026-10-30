"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";

import { acceptDefect, addCpcDefect, addCpcDefectsFromItems, raiseDefectSchedule, raiseMakingGood, raisePracticalCompletion, removeCpcDefect, reportDefect, reportDefectRectified, returnDefect, returnSecurity, withdrawDefect } from "./closeout-actions";

/**
 * The drawers of the close-out stage (Phase 2 close-out stage B; plan closeout-plan.md §3.2): the certificate of practical completion and its list,
 * the defect lines and what happens to each, the Schedule of Defects, the certificate of making good defects, and a security returned. Each posts
 * to its act, which judges it again; a drawer's blocker is the act family's refusal. Every known set of values is a dropdown.
 */

export type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const primary = buttonClass("primary", "sm");
const secondary = buttonClass("secondary", "sm");
const trig = (label: string, menu: boolean, main = false) => ({ label, className: menu ? moreItemClass() : main ? primary : secondary });
const by = (slot: string, people: Option[]): Field => actorField(slot, { name: "personId", people });
const choose = (name: string, label: string, options: Option[], empty: string): Field => ({ kind: "select", name, label, required: true, placeholder: options.length ? "Choose" : empty, options });

export function RaiseCpcDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise practical completion"
      description="Records the passing joint inspection. The defects liability period is fixed from the baseline."
      size="lg"
      columns={2}
      fields={[
        hidden("id"),
        { kind: "date", name: "completionDate", label: "Practical completion on", required: true },
        { kind: "date", name: "possessionTakenOn", label: "Works taken over on", required: true },
        { kind: "date", name: "inspectedOn", label: "Joint inspection on", required: true },
        { kind: "tokens", name: "attendeeIds", label: "Attended", placeholder: "Choose", options: people },
        { kind: "text", name: "otherAttendees", label: "Others who attended", hint: "Separate names with commas." },
        { kind: "textarea", name: "testReasons", label: "Why the works are practically complete", required: true },
        by("PracticalCompletion.person", people),
      ]}
      values={{ id, completionDate: today, possessionTakenOn: today, inspectedOn: today }}
      action={raisePracticalCompletion}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={trig("Raise practical completion", false, true)}
    />
  );
}

/// A line on the CPC's list while it is a draft, or a defect reported during the period.
export function AddDefectDrawer({ id, onCpc, people, blocker, main, today }: { id: string; onCpc: boolean; people: Option[]; blocker: string | null; main: boolean; today: string | null }) {
  return (
    <RecordEditor
      title={onCpc ? "Add a defect to the certificate" : "Report a defect"}
      description="The contractor makes it good."
      fields={[hidden("id"), { kind: "textarea", name: "description", label: "Defect", required: true }, { kind: "text", name: "location", label: "Where" }, ...(onCpc ? [] : [{ kind: "date", name: "observedOn", label: "Observed on", required: true } as Field]), { kind: "date", name: "dueOn", label: "Made good by", required: true }, by("DefectItem.reportedBy", people)]}
      values={onCpc ? { id } : { id, observedOn: today }}
      action={onCpc ? addCpcDefect : reportDefect}
      submitLabel="Add"
      submitBlock={blocker}
      trigger={trig("Add defect", !main, main)}
    />
  );
}

/// The draft CPC's list from the work list: the open Defect items not yet on a list (B-18). Their lines are made and linked; `dueOn` is for the ones with no day of their own.
export function PickDefectItemsDrawer({ id, items, total, people, blocker }: { id: string; items: Option[]; total: number; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Add defects from the work list"
      description={`Each becomes a line on the certificate and stays linked to its item.${total > items.length ? ` Showing ${items.length} of ${total}. Add these, then open again for the rest.` : ""}`}
      fields={[hidden("id"), { kind: "checks", name: "itemIds", label: "Defect items", filterable: true, options: items, empty: "No open Defect items are waiting." }, { kind: "date", name: "dueOn", label: "Made good by", hint: "Used for an item with no due day." }, by("DefectItem.reportedBy", people)]}
      values={{ id }}
      action={addCpcDefectsFromItems}
      submitLabel="Add"
      submitBlock={blocker}
      trigger={trig("Add from work list", true)}
    />
  );
}

export function RemoveDefectDrawer({ id, lines, blocker }: { id: string; lines: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Remove a defect from the certificate"
      description="Only while the certificate is a draft."
      fields={[hidden("id"), choose("defectId", "Defect", lines, "None to remove")]}
      values={{ id }}
      action={removeCpcDefect}
      submitLabel="Remove"
      danger
      submitBlock={blocker}
      trigger={trig("Remove a defect", true)}
    />
  );
}

const DEFECT_ACTS = {
  REPORT: { title: "Record the contractor's report", action: reportDefectRectified, label: "Contractor's report", note: "Note", required: false, submit: "Record" },
  ACCEPT: { title: "Accept as made good", action: acceptDefect, label: "Accept", note: "Note", required: false, submit: "Accept" },
  RETURN: { title: "Return: not made good", action: returnDefect, label: "Return", note: "Why it is not made good", required: true, submit: "Return" },
  WITHDRAW: { title: "Withdraw the defect", action: withdrawDefect, label: "Withdraw", note: "Why it is withdrawn", required: true, submit: "Withdraw" },
} as const;

export function DefectActDrawer({ id, act, lines, documents, people, today, blocker }: { id: string; act: keyof typeof DEFECT_ACTS; lines: Option[]; documents?: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  const a = DEFECT_ACTS[act];
  return (
    <RecordEditor
      title={a.title}
      description={act === "WITHDRAW" ? "Not made good. The reason is kept on the certificate." : undefined}
      fields={[
        hidden("id"),
        choose("defectId", "Defect", lines, "None"),
        { kind: "date", name: "on", label: "On", required: true },
        { kind: "textarea", name: "note", label: a.note, required: a.required },
        ...(documents ? [{ kind: "select", name: "evidenceDocumentId", label: "Evidence", placeholder: documents.length ? "None" : "No documents on this contract", options: documents } as Field] : []),
        by("DefectEvent.person", people),
      ]}
      values={{ id, on: today }}
      action={a.action}
      submitLabel={a.submit}
      submitBlock={blocker}
      trigger={trig(a.label, true)}
    />
  );
}

export function RaiseScheduleDrawer({ id, people, blocker }: { id: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise the Schedule of Defects"
      description="Lists every defect still open."
      fields={[hidden("id"), { kind: "date", name: "rectifyBy", label: "Made good by", required: true }, by("DefectSchedule.person", people)]}
      values={{ id }}
      action={raiseDefectSchedule}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={trig("Raise schedule", false, true)}
    />
  );
}

export function RaiseCmgdDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise making good of defects"
      description="Every defect made good or withdrawn."
      fields={[hidden("id"), { kind: "date", name: "madeGoodOn", label: "Defects made good on", required: true }, { kind: "date", name: "finalInspectionOn", label: "Final defects inspection on", required: true }, by("MakingGood.person", people)]}
      values={{ id, madeGoodOn: today, finalInspectionOn: today }}
      action={raiseMakingGood}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={trig("Raise making good", false, true)}
    />
  );
}

export function ReturnSecurityDrawer({ id, securities, people, today, blocker }: { id: string; securities: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Return a security"
      description="Once each."
      fields={[
        hidden("id"),
        choose("securityId", "Security", securities, "None to return yet"),
        { kind: "date", name: "returnedOn", label: "Returned on", required: true },
        { kind: "text", name: "officialReceiptRef", label: "Official receipt", hint: "Cash or banker's draft only." },
        { kind: "textarea", name: "note", label: "Note" },
        by("SecurityRelease.person", people),
      ]}
      values={{ id, returnedOn: today }}
      action={returnSecurity}
      submitLabel="Return"
      submitBlock={blocker}
      trigger={trig("Return a security", false, true)}
    />
  );
}
