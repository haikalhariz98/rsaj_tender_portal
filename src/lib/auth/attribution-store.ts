import type { Tx } from "@/lib/audit/record";

import { uniqueViolationIndex } from "@/lib/scope/unique-violation";

import { slotOf } from "./act-slots";
import { attributionFaults, attributionRow, needsStepUp, stepUpFault, type ActModeName, type ActRecorder, type ActSubject } from "./attribution";
import { loadSecurityPolicy } from "./policy-store";
import type { Fault, StaffActor } from "./types";

/**
 * The one writer of an act's attribution (ADR 0034 D12, Phase 2a). Called inside the act's own transaction, with the act's audit row, so that
 * the act, its audit entry and its attribution commit together or not at all. It judges the request by `attributionFaults` and writes
 * nothing if it finds any: the caller lets the refusal end the transaction.
 *
 * The recorder is always taken from the signed-in actor, never from a form: a person (with the session), or, for a loader run (`actor.system`), the
 * system by its label and never the loader's empty person id. The subject is the person the act is attributed to, which is the actor
 * for a signed act and whoever the form named for one recorded on their behalf.
 */

export class AttributionRefused extends Error {
  constructor(readonly faults: Fault[]) {
    super(faults.map((f) => f.en).join(" "));
    this.name = "AttributionRefused";
  }
}

export interface AttributeActInput {
  actor: StaffActor;
  entity: string;
  entityId: string;
  slot: string;
  subject: ActSubject;
  mode: ActModeName;
  /// From `stepUp`: when the password was asked again for this act.
  stepUpAt?: Date | null;
  paperReference?: string;
  reason?: string;
  /// NFR-SIG-001, for a signature-class act: the exact document or record signed, and the office held.
  document?: { entity: string; id: string } | null;
  roleCode?: string | null;
  /// NFR-AUD-006: the day the act is dated and, where that is earlier than the day it is recorded, why and who authorised it.
  effectiveOn?: string | null;
  backdate?: { reason: string; authorisedByPersonId: string } | null;
}

export const recorderOf = (actor: StaffActor): ActRecorder => (actor.system ? { kind: "SYSTEM", label: actor.system.label } : { kind: "PERSON", personId: actor.personId, sessionId: actor.sessionId });

export async function attributeAct(tx: Tx, input: AttributeActInput) {
  const policy = await loadSecurityPolicy(tx, input.actor.organisationId);
  const request = {
    entity: input.entity,
    entityId: input.entityId,
    slot: input.slot,
    subject: input.subject,
    recorder: recorderOf(input.actor),
    mode: input.mode,
    stepUpAt: input.stepUpAt ?? null,
    paperReference: input.paperReference,
    reason: input.reason,
    document: input.document ?? null,
    roleCode: input.roleCode ?? null,
    effectiveOn: input.effectiveOn ?? null,
    backdate: input.backdate ?? null,
    recorderPermissions: input.actor.permissions,
    paperSignatureRecording: policy?.paperSignatureRecording ?? null,
  };
  const faults = attributionFaults(request);
  if (faults.length > 0) throw new AttributionRefused(faults);
  // The password really asked again for this act (review of Phase 2a): the stamp is the one the session carries now, and it signs one act only.
  // The caller's own claim is never the proof; `@@unique([sessionId, stepUpAt])` holds the single use against two acts racing on one stamp.
  if (needsStepUp(request) && request.recorder.kind === "PERSON") {
    const session = request.recorder.sessionId ? await tx.staffSession.findFirst({ where: { id: request.recorder.sessionId, revokedAt: null }, select: { stepUpAt: true } }) : null;
    const consumed = request.stepUpAt && request.recorder.sessionId ? (await tx.actAttribution.count({ where: { sessionId: request.recorder.sessionId, stepUpAt: request.stepUpAt } })) > 0 : false;
    const stale = stepUpFault({ passed: request.stepUpAt, onSession: session?.stepUpAt ?? null, consumed });
    if (stale) throw new AttributionRefused([stale]);
  }
  // Every Person named belongs to the actor's organisation (ADR 0034 D10): the attested person of a form is whoever the form said, and a Person of
  // another organisation reads as no longer existing. A system recorder names no Person.
  const personIds = [
    ...new Set([
      ...[request.subject, request.recorder].flatMap((p) => (p.kind === "PERSON" ? [p.personId] : [])),
      ...(request.backdate ? [request.backdate.authorisedByPersonId] : []),
    ]),
  ];
  if (personIds.length > 0 && (await tx.person.count({ where: { id: { in: personIds }, organisationId: input.actor.organisationId } })) !== personIds.length) {
    throw new AttributionRefused([{ code: "NO_SUCH_PERSON", en: "That person no longer exists.", ms: "Orang itu tidak lagi wujud." }]);
  }
  // Written again, a slot is a new occurrence: the earlier ones are evidence and stay, and the highest is the one in force (`latestAttribution`).
  const last = await tx.actAttribution.aggregate({ where: { entity: input.entity, entityId: input.entityId, slot: input.slot }, _max: { occurrence: true } });
  try {
    return await tx.actAttribution.create({ data: { organisationId: input.actor.organisationId, ...attributionRow(request), occurrence: (last._max.occurrence ?? 0) + 1 } });
  } catch (e) {
    // Two people acted on the same record at the same moment: the second finds the first's row and is refused, the whole act with it.
    const index = uniqueViolationIndex(e);
    if (index === "ActAttribution_sessionId_stepUpAt_key") {
      throw new AttributionRefused([stepUpFault({ passed: request.stepUpAt, onSession: request.stepUpAt ?? null, consumed: true })!]);
    }
    if (index === "ActAttribution_entity_entityId_slot_occurrence_key") {
      throw new AttributionRefused([{ code: "ATTRIBUTION_CONFLICT", en: "Someone else acted on this record at the same moment. Reload it and try again.", ms: "Orang lain bertindak pada rekod ini pada masa yang sama. Muat semula dan cuba lagi." }]);
    }
    throw e;
  }
}

/**
 * The attribution of a row copied into a new version of its record (an evaluation's next version carries its scores, assessments, submissions and each bid's
 * record forward unchanged). The copy is a new row with a new id, and its person column is the original's, so it must read as attributed and not as missing:
 * it is written for that person by the system, "carried forward from the earlier version". It is not a signature, and says so; the original row keeps its own
 * attribution, signed or not, in the earlier version. (Phase 2b: an open item for the product owner, whether a carried row should instead point at its source's.)
 */
export const CARRIED_FORWARD = "carried forward from the earlier version";

export async function carryAttribution(tx: Tx, organisationId: string, c: { entity: string; slot: string; entityId: string; personId: string }) {
  if (!slotOf(c.entity, c.slot)) throw new Error(`"${c.entity}.${c.slot}" is not an act slot.`);
  await tx.actAttribution.create({
    data: {
      organisationId,
      ...attributionRow({
        entity: c.entity,
        entityId: c.entityId,
        slot: c.slot,
        subject: { kind: "PERSON", personId: c.personId },
        recorder: { kind: "SYSTEM", label: CARRIED_FORWARD },
        mode: "RECORDED_ON_BEHALF",
        reason: "Carried forward unchanged into the next version of the record.",
      }),
    },
  });
}
