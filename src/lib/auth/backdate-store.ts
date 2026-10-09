import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayIn, storedDay } from "@/lib/dates";

import { slotOf } from "./act-slots";
import { auditActorOfStaff } from "./audit-actor";
import { confirmationFaults, type BackdatedAttribution } from "./backdate-confirmation";
import type { Fault, StaffActor } from "./types";

/**
 * Confirming a back-dating, against the database (NFR-AUD-006, Phase 5a). The rules are pure (`backdate-confirmation.ts`); this reads the attribution in the actor's own
 * organisation, judges it, and writes the confirmation with its audit row in the caller's transaction. The signature that makes it the person's own act is the attribution
 * the caller writes beside it (`BackdateConfirmation.confirmedBy`, with the password).
 */

export interface BackdateToConfirm extends BackdatedAttribution {
  signerName: string;
  /// What was signed, in the slot's own words.
  whatWords: string;
  recordedOn: string;
  reason: string;
  confirmedOn: string | null;
}

/// The attribution as the person named would see it before confirming, or null where it is not in their organisation (it reads as not there).
export async function loadBackdateToConfirm(client: Pick<Tx, "actAttribution">, actor: Pick<StaffActor, "organisationId" | "organisationTimeZone">, attributionId: string): Promise<BackdateToConfirm | null> {
  const row = await client.actAttribution.findFirst({
    where: { id: attributionId, organisationId: actor.organisationId },
    include: { subjectPerson: { select: { name: true } }, confirmation: { select: { confirmedAt: true } } },
  });
  if (!row) return null;
  const slot = slotOf(row.entity, row.slot);
  return {
    id: row.id,
    authorisedByPersonId: row.backdateAuthorisedByPersonId,
    effectiveOn: row.effectiveOn ? storedDay(row.effectiveOn) : null,
    alreadyConfirmed: row.confirmation != null,
    signerName: row.subjectPerson?.name ?? "A person no longer on record",
    whatWords: slot?.label ?? "A signature",
    recordedOn: dayIn(row.at, actor.organisationTimeZone),
    reason: row.backdateReason,
    confirmedOn: row.confirmation ? dayIn(row.confirmation.confirmedAt, actor.organisationTimeZone) : null,
  };
}

export type ConfirmOutcome = { ok: true; confirmationId: string } | { ok: false; faults: Fault[] };

/// Confirm, in the caller's transaction: judged on the attribution as it stands now, the person named only, once.
export async function confirmBackdating(tx: Tx, actor: StaffActor, attributionId: string, now: Date): Promise<ConfirmOutcome> {
  const a = await loadBackdateToConfirm(tx, actor, attributionId);
  const faults = confirmationFaults(a, actor.personId);
  if (faults.length > 0 || !a) return { ok: false, faults };
  const row = await tx.backdateConfirmation.create({ data: { organisationId: actor.organisationId, attributionId, confirmedByPersonId: actor.personId, confirmedAt: now }, select: { id: true } });
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "BackdateConfirmation", entityId: row.id, entityLabel: `Back-dating of “${a.whatWords}” confirmed`, reason: a.reason, actor: auditActorOfStaff(actor) },
    "CREATE",
    [
      { field: "Signed by", before: null, after: a.signerName },
      { field: "Dated", before: null, after: a.effectiveOn },
      { field: "Recorded on", before: null, after: a.recordedOn },
      { field: "Confirmed by", before: null, after: actor.personName },
    ],
  );
  return { ok: true, confirmationId: row.id };
}
