import type { Tx } from "@/lib/audit/record";

import { attributionFaults, attributionRow, type ActModeName, type ActRecorder, type ActSubject } from "./attribution";
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
    recorderPermissions: input.actor.permissions,
    paperSignatureRecording: policy?.paperSignatureRecording ?? null,
  };
  const faults = attributionFaults(request);
  if (faults.length > 0) throw new AttributionRefused(faults);
  return tx.actAttribution.create({ data: { organisationId: input.actor.organisationId, ...attributionRow(request) } });
}
