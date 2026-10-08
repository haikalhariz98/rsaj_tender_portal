import type { Tx } from "@/lib/audit/record";
import { uniqueViolationIndex } from "@/lib/scope/unique-violation";

import { attributionFaults, attributionRow, stepUpFault, type AttributionRequest } from "./attribution";
import { AttributionRefused } from "./attribution-store";
import { slotOf } from "./act-slots";
import type { SupplierActor } from "./types";

/**
 * The attribution of an act a SUPPLIER's account did (Phase 4b, B0 of the CPD registration spec; ADR 0034 D12): the supplier counterpart of `attributeAct`, called inside the act's own
 * transaction with the act's audit row, so that the act, its audit entry and its attribution commit together or not at all.
 *
 * A supplier's act is always its own: the subject and the recorder are the signed-in account, in the session they signed in with, and a request names neither (the actor is the
 * session's, as everywhere on the portal). So the only mode is SIGNED. A signature-class act is signed with the password asked again (`confirmSupplierPassword`), and, as for a person,
 * the writer does not trust the stamp the caller hands over: it must be the stamp the supplier's own session carries now, and no earlier attribution may already have been signed on it.
 * The account must be the organisation's.
 */

export interface AttributeSupplierActInput {
  actor: SupplierActor;
  entity: string;
  entityId: string;
  slot: string;
  /// From `confirmSupplierPassword`: when the password was asked again for this act. Required for a signature-class slot.
  stepUpAt?: Date | null;
  /// NFR-SIG-001: the exact document or record signed.
  document?: { entity: string; id: string } | null;
  reason?: string;
}

export async function attributeSupplierAct(tx: Tx, input: AttributeSupplierActInput) {
  const { actor } = input;
  const request: AttributionRequest = {
    entity: input.entity,
    entityId: input.entityId,
    slot: input.slot,
    subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: actor.accountId },
    recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: actor.accountId, sessionId: actor.sessionId },
    mode: "SIGNED",
    stepUpAt: input.stepUpAt ?? null,
    reason: input.reason,
    document: input.document ?? null,
  };
  const faults = attributionFaults(request);
  if (faults.length > 0) throw new AttributionRefused(faults);

  if (slotOf(input.entity, input.slot)?.signatureClass) {
    const session = await tx.supplierSession.findFirst({ where: { id: actor.sessionId, accountId: actor.accountId, organisationId: actor.organisationId, revokedAt: null }, select: { stepUpAt: true } });
    const consumed = request.stepUpAt ? (await tx.actAttribution.count({ where: { sessionId: actor.sessionId, stepUpAt: request.stepUpAt } })) > 0 : false;
    const stale = stepUpFault({ passed: request.stepUpAt, onSession: session?.stepUpAt ?? null, consumed });
    if (stale) throw new AttributionRefused([stale]);
  }

  if ((await tx.supplierAccount.count({ where: { id: actor.accountId, organisationId: actor.organisationId } })) !== 1) {
    throw new AttributionRefused([{ code: "NO_SUCH_ACCOUNT", en: "That account no longer exists.", ms: "Akaun itu tidak lagi wujud." }]);
  }

  const last = await tx.actAttribution.aggregate({ where: { entity: input.entity, entityId: input.entityId, slot: input.slot }, _max: { occurrence: true } });
  try {
    return await tx.actAttribution.create({ data: { organisationId: actor.organisationId, ...attributionRow(request), occurrence: (last._max.occurrence ?? 0) + 1 } });
  } catch (e) {
    const index = uniqueViolationIndex(e);
    if (index === "ActAttribution_sessionId_stepUpAt_key") throw new AttributionRefused([stepUpFault({ passed: request.stepUpAt, onSession: request.stepUpAt ?? null, consumed: true })!]);
    if (index === "ActAttribution_entity_entityId_slot_occurrence_key") {
      throw new AttributionRefused([{ code: "ATTRIBUTION_CONFLICT", en: "Another request acted on this record at the same moment. Reload it and try again.", ms: "Permintaan lain bertindak pada rekod ini pada masa yang sama. Muat semula dan cuba lagi." }]);
    }
    throw e;
  }
}
