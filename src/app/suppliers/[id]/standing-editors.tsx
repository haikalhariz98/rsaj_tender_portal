import { RecordEditor, type Field } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { NEW_APPLICATION_WAY_BACK } from "@/lib/suppliers/labels";

import { grantSpecialPermission, linkAwardToSupplier, linkPartyToSupplier, recordSpecialPermission, decidePermissionStep } from "../link-actions";
import { decideStandingStep, liftBlacklisting, recordBlacklisting, recordRegistrationCancelled, reinstateSupplier, requestBlacklisting, requestBlacklistLift, suspendSupplier, withdrawRegistrationCancelled, withdrawStandingRequest } from "../standing-actions";

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

// ------------------------------------------------------------------ suspension and reinstatement

export function SuspendDrawer({ supplierId, reasons, documents, people, today, blocker }: { supplierId: string; reasons: Option[]; documents: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Suspend" reason={blocker} />;
  return (
    <RecordEditor
      title="Suspend the supplier"
      description="Reinstating needs each document verified again. Not emailed."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "reasonId", label: "Reason", required: true, placeholder: "Choose", options: reasons, hint: reasons.length ? undefined : "No suspension reason is configured (Configuration › Supplier register, Standing reasons)." },
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true, hint: "Not after today, nor before the supplier was registered." },
        { kind: "tokens", name: "flaggedDocumentIds", label: "The documents it is for", options: documents, hint: "Reinstating needs each verified and in force again." },
        { kind: "textarea", name: "note", label: "Note" },
        actorField("StandingEvent.recordedBy", { name: "personId", people }),
      ]}
      values={{ supplierId, effectiveOn: today }}
      action={suspendSupplier}
      submitLabel="Suspend"
      trigger={{ label: "Suspend", className: secondary }}
    />
  );
}

export function ReinstateDrawer({ supplierId, checklist, people, today, blocker }: { supplierId: string; checklist: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Reinstate" reason={blocker} />;
  return (
    <RecordEditor
      title="Reinstate the supplier"
      description="Tick each document it was for. A blacklisting is lifted on its own route."
      fields={[
        hidden("supplierId"),
        ...(checklist.length
          ? [{ kind: "tokens", name: "checkedDocumentIds", label: "Seen verified and in force", options: checklist, hint: "Every line must be ticked." } as Field]
          : [{ kind: "note", text: "The suspension named no document: there is nothing to tick." } as Field]),
        { kind: "textarea", name: "note", label: "What was done", required: true },
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true },
        actorField("StandingEvent.recordedBy", { name: "personId", people }),
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
  if (blocker) return <Blocked label="Ask for blacklisting" reason={blocker} />;
  return (
    <RecordEditor
      title="Ask for the supplier's blacklisting"
      description="Decided on its own route. Recorded once approved."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "reasonId", label: "Reason", required: true, placeholder: "Choose", options: reasons, hint: reasons.length ? undefined : "No blacklisting reason is configured (Configuration › Supplier register, Standing reasons)." },
        ...(awards.length ? [{ kind: "select", name: "sourceAwardId", label: "From the cancelled award", placeholder: "None", options: awards, hint: "An award cancelled with blacklisting recommended." } as Field] : []),
        { kind: "textarea", name: "note", label: "Note" },
        actorField("StandingRequest.requestedBy", { name: "personId", people }),
      ]}
      values={{ supplierId, sourceAwardId: fromAward ?? "" }}
      action={requestBlacklisting}
      submitLabel="Ask, and send on its route"
      trigger={{ label: "Ask for blacklisting", className: secondary }}
    />
  );
}

export function RequestLiftDrawer({ supplierId, people, blocker }: { supplierId: string; people: Option[]; blocker: string | null }) {
  if (blocker) return <Blocked label="Ask to lift the blacklisting" reason={blocker} />;
  return (
    <RecordEditor
      title="Ask to lift the blacklisting"
      description="Decided on its own route. Recorded once approved."
      fields={[hidden("supplierId"), { kind: "textarea", name: "note", label: "Why", required: true }, actorField("StandingRequest.requestedBy", { name: "personId", people })]}
      values={{ supplierId }}
      action={requestBlacklistLift}
      submitLabel="Ask, and send on its route"
      trigger={{ label: "Ask to lift the blacklisting", className: secondary }}
    />
  );
}

export function RecordStandingDrawer({ requestId, kind, people, today, approvedOn, blocker }: { requestId: string; kind: "BLACKLIST" | "BLACKLIST_LIFT"; people: Option[]; today: string | null; approvedOn: string | null; blocker: string | null }) {
  const label = kind === "BLACKLIST" ? "Record the blacklisting" : "Record the lifting";
  if (blocker) return <Blocked label={label} reason={blocker} />;
  return (
    <RecordEditor
      title={label}
      description={kind === "BLACKLIST" ? "Its route has approved it. The period is worked out from the policy as it stands now and kept with the record." : "Its route has approved it."}
      fields={[
        hidden("requestId"),
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true, hint: approvedOn ? `Not before the route approved it, nor after today.` : undefined },
        actorField("StandingEvent.recordedBy", { name: "personId", people }),
      ]}
      values={{ requestId, effectiveOn: today }}
      action={kind === "BLACKLIST" ? recordBlacklisting : liftBlacklisting}
      submitLabel={label}
      trigger={{ label, className: primary }}
    />
  );
}

/// Withdraw a request its route approved but that can no longer be recorded, or one never sent (fix R-7).
export function WithdrawRequestDrawer({ requestId, what, people }: { requestId: string; what: string; people: Option[] }) {
  return (
    <RecordEditor
      title={`Withdraw the request: ${what}`}
      description="Closes the request. It stays on record, marked withdrawn."
      fields={[hidden("requestId"), actorField("StandingRequest.withdrawnBy", { name: "personId", people })]}
      values={{ requestId }}
      destructive={{ reasonLabel: "Why it is withdrawn" }}
      cancelLabel="Keep the request"
      action={withdrawStandingRequest}
      submitLabel="Withdraw it"
      trigger={{ label: "Withdraw", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ a registration cancelled (615-C2)

/// Record a registration body's cancellation of the supplier's registration: a fact, from the body's notice. No route.
export function RecordCancellationDrawer({ supplierId, bodies, people, today, blocker }: { supplierId: string; bodies: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Record a registration cancelled" reason={blocker} />;
  return (
    <RecordEditor
      title="Record a registration cancelled"
      description="Bars the supplier from sales, bids and awards while it stands."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "cancellingBodyId", label: "Cancelled by", required: true, placeholder: "Choose", options: bodies, hint: bodies.length ? undefined : "No registration body is configured (Configuration › Supplier register)." },
        { kind: "text", name: "externalReference", label: "The body's reference", required: true, hint: "As on its notice." },
        { kind: "date", name: "effectiveOn", label: "Takes effect on", required: true, hint: "As the notice states; not after today, nor before the supplier was registered." },
        { kind: "textarea", name: "note", label: "Note" },
        actorField("StandingEvent.recordedBy", { name: "personId", people }),
      ]}
      values={{ supplierId, effectiveOn: today }}
      action={recordRegistrationCancelled}
      submitLabel="Record it"
      trigger={{ label: "Record a registration cancelled", className: secondary }}
    />
  );
}

/// Withdraw a registration cancelled that was recorded in error: the reason is kept with it.
export function WithdrawCancellationDrawer({ eventId, people, notRevisited }: { eventId: string; people: Option[]; notRevisited: string }) {
  return (
    <RecordEditor
      title="Withdraw the cancellation: recorded in error"
      description={`Only for a record made in error. ${notRevisited} ${NEW_APPLICATION_WAY_BACK.en}`}
      fields={[hidden("eventId"), actorField("StandingEvent.withdrawnBy", { name: "personId", people })]}
      values={{ eventId }}
      destructive={{ reasonLabel: "Why it was recorded in error" }}
      cancelLabel="Keep it"
      action={withdrawRegistrationCancelled}
      submitLabel="Withdraw it"
      trigger={{ label: "Withdraw: recorded in error", className: ghost }}
    />
  );
}

/// A named Person's decision on a step of a blacklisting or a special permission's route.
export function DecideRouteStepDrawer({ stepId, office, done, people, today, matter, refused, kind }: { stepId: string; office: string; done: string; people: Option[]; today: string | null; matter: string; refused: string; kind: "standing" | "permission" }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`On ${matter}. The holder signs with their password.`}
      fields={[
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: refused }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true, hint: people.length === 0 ? "Nobody holds this office organisation-wide today." : undefined }),
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

export function LinkPartyDrawer({ supplierId, parties }: { supplierId: string; parties: Option[] }) {
  if (parties.length === 0) return <Blocked label="Link a party" reason="No unlinked party on any exercise." />;
  return (
    <RecordEditor
      title="Link a party on an exercise to this supplier"
      description="An explicit link. A differing number needs a reason."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "partyId", label: "Party", required: true, placeholder: "Choose", options: parties },
        { kind: "textarea", name: "reason", label: "Why they are the same company", hint: "Needed where the numbers differ." },
        // The officer who links is the one signed in: the History names them.
      ]}
      values={{ supplierId }}
      action={linkPartyToSupplier}
      submitLabel="Link"
      trigger={{ label: "Link a party", className: secondary }}
    />
  );
}

export function LinkAwardDrawer({ supplierId, awards }: { supplierId: string; awards: Option[] }) {
  if (awards.length === 0) return null;
  return (
    <RecordEditor
      title="Link an award to this supplier"
      description="Only for an award with no awardee party."
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "awardId", label: "Award", required: true, placeholder: "Choose", options: awards },
        { kind: "textarea", name: "reason", label: "Why they are the same company", hint: "Needed where the numbers differ." },
        // The officer who links is the one signed in: the History names them.
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
  if (blocker) return <Blocked label="Record a special permission" reason={blocker} />;
  return (
    <RecordEditor
      title={`Special permission for ${partyLabel}`}
      description="Needs both confirmations: the registration body and the organisation's approval."
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
        actorField("SpecialPermission.requestedBy", { name: "personId", people }),
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
  if (blocker) return <Blocked label="Record it granted" reason={blocker} />;
  return (
    <RecordEditor
      title="Record the permission granted"
      description="Its route has approved it."
      fields={[hidden("permissionId"), { kind: "date", name: "grantedOn", label: "Granted on", required: true }, actorField("SpecialPermission.grantedBy", { name: "personId", people })]}
      values={{ permissionId, grantedOn: today }}
      action={grantSpecialPermission}
      submitLabel="Record it granted"
      trigger={{ label: "Record it granted", className: primary }}
    />
  );
}
