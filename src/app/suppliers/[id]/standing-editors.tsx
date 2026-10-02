import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";

import { grantSpecialPermission, linkAwardToSupplier, linkPartyToSupplier, recordSpecialPermission, decidePermissionStep } from "../link-actions";
import { decideStandingStep, liftBlacklisting, recordBlacklisting, reinstateSupplier, requestBlacklisting, requestBlacklistLift, suspendSupplier } from "../standing-actions";

/**
 * The supplier record's a2 drawers (6.15a): standing, links and special permission. No field carries a
 * default but the day, where an act is recorded today. Every person named is recorded on their behalf,
 * not signed. Each act is judged again by the server under its locks; a drawer that cannot proceed says
 * why beside its button, from the same rule.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const ghost = buttonClass("ghost", "sm");
const person = (label: string, people: Option[]): Field => ({ kind: "select", name: "personId", label, required: true, placeholder: "Choose", options: people, hint: ON_BEHALF_HINT });

function Blocked({ label, why }: { label: string; why: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
      <span className={`${secondary} pointer-events-none opacity-50`} aria-disabled>{label}</span>
      <span>{why}</span>
    </span>
  );
}

// ------------------------------------------------------------------ suspension and reinstatement

export function SuspendDrawer({ supplierId, reasons, documents, people, today, blocker }: { supplierId: string; reasons: Option[]; documents: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Suspend" why={blocker} />;
  return (
    <RecordEditor
      title="Suspend the supplier"
      description="A reason from the maintained list, the day it takes effect and the documents it is for. Reinstating it later needs each of those documents verified and in force again. The notice is shown on the record, not sent."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "reasonId", label: "Reason", required: true, placeholder: "Choose", options: reasons, hint: reasons.length ? undefined : "No suspension reason is configured (Configuration › Supplier register, Standing reasons)." },
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true, hint: "Not after today, nor before the supplier was registered." },
        { kind: "tokens", name: "flaggedDocumentIds", label: "The documents it is for", options: documents, hint: "Reinstating needs each verified and in force again." },
        { kind: "textarea", name: "note", label: "Note" },
        person("Recorded by", people),
      ]}
      values={{ supplierId, effectiveOn: today }}
      action={suspendSupplier}
      submitLabel="Suspend"
      trigger={{ label: "Suspend", className: secondary }}
    />
  );
}

export function ReinstateDrawer({ supplierId, checklist, people, today, blocker }: { supplierId: string; checklist: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Reinstate" why={blocker} />;
  return (
    <RecordEditor
      title="Reinstate the supplier"
      description="Tick each document the suspension was for, having seen it verified and in force; say what was done. A blacklisting is not reinstated here: it is lifted on its own route."
      fields={[
        hidden("supplierId"),
        ...(checklist.length
          ? [{ kind: "tokens", name: "checkedDocumentIds", label: "Seen verified and in force", options: checklist, hint: "Every line must be ticked." } as Field]
          : [{ kind: "note", text: "The suspension named no document: there is nothing to tick." } as Field]),
        { kind: "textarea", name: "note", label: "What was done", required: true },
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true },
        person("Recorded by", people),
      ]}
      values={{ supplierId, effectiveOn: today }}
      action={reinstateSupplier}
      submitLabel="Reinstate"
      trigger={{ label: "Reinstate", className: primary }}
    />
  );
}

// ------------------------------------------------------------------ blacklisting (OD-8 A)

export function RequestBlacklistDrawer({ supplierId, reasons, awards, fromAward, people, blocker }: { supplierId: string; reasons: Option[]; awards: Option[]; fromAward: string | null; people: Option[]; blocker: string | null }) {
  if (blocker) return <Blocked label="Ask for blacklisting" why={blocker} />;
  return (
    <RecordEditor
      title="Ask for the supplier's blacklisting"
      description="It is decided on its own route under the approval matrix, and recorded once that route approves it, with the day it takes effect. A first offence lasts the period set under Configuration › Supplier register; a later one until further notice."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "reasonId", label: "Reason", required: true, placeholder: "Choose", options: reasons, hint: reasons.length ? undefined : "No blacklisting reason is configured (Configuration › Supplier register, Standing reasons)." },
        ...(awards.length ? [{ kind: "select", name: "sourceAwardId", label: "From the cancelled award", placeholder: "None", options: awards, hint: "An award cancelled with blacklisting recommended." } as Field] : []),
        { kind: "textarea", name: "note", label: "Note" },
        person("Asked by", people),
      ]}
      values={{ supplierId, sourceAwardId: fromAward ?? "" }}
      action={requestBlacklisting}
      submitLabel="Ask, and send on its route"
      trigger={{ label: "Ask for blacklisting", className: secondary }}
    />
  );
}

export function RequestLiftDrawer({ supplierId, people, blocker }: { supplierId: string; people: Option[]; blocker: string | null }) {
  if (blocker) return <Blocked label="Ask to lift the blacklisting" why={blocker} />;
  return (
    <RecordEditor
      title="Ask to lift the blacklisting"
      description="Decided on its own route under the approval matrix, and recorded once that route approves it."
      fields={[hidden("supplierId"), { kind: "textarea", name: "note", label: "Why", required: true }, person("Asked by", people)]}
      values={{ supplierId }}
      action={requestBlacklistLift}
      submitLabel="Ask, and send on its route"
      trigger={{ label: "Ask to lift the blacklisting", className: secondary }}
    />
  );
}

export function RecordStandingDrawer({ requestId, kind, people, today, approvedOn, blocker }: { requestId: string; kind: "BLACKLIST" | "BLACKLIST_LIFT"; people: Option[]; today: string | null; approvedOn: string | null; blocker: string | null }) {
  const label = kind === "BLACKLIST" ? "Record the blacklisting" : "Record the lifting";
  if (blocker) return <Blocked label={label} why={blocker} />;
  return (
    <RecordEditor
      title={label}
      description={kind === "BLACKLIST" ? "Its route has approved it. The period is worked out from the policy as it stands now and kept with the record." : "Its route has approved it."}
      fields={[
        hidden("requestId"),
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true, hint: approvedOn ? `Not before the route approved it, nor after today.` : undefined },
        person("Recorded by", people),
      ]}
      values={{ requestId, effectiveOn: today }}
      action={kind === "BLACKLIST" ? recordBlacklisting : liftBlacklisting}
      submitLabel={label}
      trigger={{ label, className: primary }}
    />
  );
}

/// A named Person's decision on a step of a blacklisting or a special permission's route.
export function DecideRouteStepDrawer({ stepId, office, done, people, today, matter, refused, kind }: { stepId: string; office: string; done: string; people: Option[]; today: string | null; matter: string; refused: string; kind: "standing" | "permission" }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`On ${matter}. ${ON_BEHALF_HINT} They must hold the office organisation-wide, or a delegation of it with no value ceiling.`}
      fields={[
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: refused }] },
        { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: people, hint: people.length === 0 ? "Nobody holds this office organisation-wide today." : undefined },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was asked for." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ stepId, decidedOn: today }}
      action={kind === "standing" ? decideStandingStep : decidePermissionStep}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: primary }}
    />
  );
}

// ------------------------------------------------------------------ links (OD-9)

export function LinkPartyDrawer({ supplierId, parties, people }: { supplierId: string; parties: Option[]; people: Option[] }) {
  if (parties.length === 0) return <Blocked label="Link a party" why="No unlinked party on any exercise." />;
  return (
    <RecordEditor
      title="Link a party on an exercise to this supplier"
      description="An explicit act, never inferred from a matching number. A number that differs from the register's needs a reason, and stays shown as differing. The party's awards follow the link."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "partyId", label: "Party", required: true, placeholder: "Choose", options: parties },
        { kind: "textarea", name: "reason", label: "Why they are the same company", hint: "Needed where the numbers differ." },
        person("Linked by", people),
      ]}
      values={{ supplierId }}
      action={linkPartyToSupplier}
      submitLabel="Link"
      trigger={{ label: "Link a party", className: secondary }}
    />
  );
}

export function LinkAwardDrawer({ supplierId, awards, people }: { supplierId: string; awards: Option[]; people: Option[] }) {
  if (awards.length === 0) return null;
  return (
    <RecordEditor
      title="Link an award to this supplier"
      description="Only an award that names no awardee party (an award with a party follows the party's link)."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "awardId", label: "Award", required: true, placeholder: "Choose", options: awards },
        { kind: "textarea", name: "reason", label: "Why they are the same company", hint: "Needed where the numbers differ." },
        person("Linked by", people),
      ]}
      values={{ supplierId }}
      action={linkAwardToSupplier}
      submitLabel="Link"
      trigger={{ label: "Link an award", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ special permission (FR-ADV-017)

export function PermissionDrawer({ partyId, partyLabel, requirements, bodies, people, today, blocker }: { partyId: string; partyLabel: string; requirements: Option[]; bodies: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Record a special permission" why={blocker} />;
  return (
    <RecordEditor
      title={`Special permission for ${partyLabel}`}
      description="Relaxing the grade or the field codes of one registration requirement, where the exercise's notice offers it. Both confirmations are needed, and who grants it: a registration body, and/or the organisation's own approval on its route."
      columns={2}
      fields={[
        hidden("partyId"),
        { kind: "select", name: "requirementId", label: "Requirement", required: true, placeholder: "Choose", options: requirements },
        { kind: "select", name: "relaxes", label: "It relaxes", required: true, placeholder: "Choose", options: [{ value: "GRADE", label: "The grade" }, { value: "FIELD_CODE", label: "The field codes" }] },
        { kind: "tokens", name: "grantingBodyIds", label: "Granted by (registration bodies)", options: bodies },
        { kind: "select", name: "internalApproval", label: "Approved inside the organisation too", required: true, placeholder: "Choose", options: [{ value: "yes", label: "Yes: on its route, then granted" }, { value: "no", label: "No: granted by the bodies above" }] },
        { kind: "switch", name: "existingClassConfirmed", label: "The party already holds a registration class" },
        { kind: "switch", name: "goodRecordConfirmed", label: "The party's record is good" },
        { kind: "date", name: "grantedOn", label: "Granted on", hint: "Where no approval inside the organisation is needed. Not after today." },
        { kind: "textarea", name: "note", label: "Note" },
        person("Recorded by", people),
      ]}
      values={{ partyId, grantedOn: today }}
      action={recordSpecialPermission}
      submitLabel="Record"
      trigger={{ label: "Record a special permission", className: ghost }}
      size="lg"
    />
  );
}

export function GrantPermissionDrawer({ permissionId, people, today, blocker }: { permissionId: string; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Record it granted" why={blocker} />;
  return (
    <RecordEditor
      title="Record the permission granted"
      description="Its route has approved it."
      fields={[hidden("permissionId"), { kind: "date", name: "grantedOn", label: "Granted on", required: true }, person("Recorded by", people)]}
      values={{ permissionId, grantedOn: today }}
      action={grantSpecialPermission}
      submitLabel="Record it granted"
      trigger={{ label: "Record it granted", className: primary }}
    />
  );
}
