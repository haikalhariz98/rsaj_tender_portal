import { beginActFromWith, beginActWith, type ActDeps, type BeginActOptions, type BegunAct } from "@/lib/auth/act-begin";
import type { ActForm } from "@/lib/auth/act-input";
import { attributeAct } from "@/lib/auth/attribution-store";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";

import { stepUp } from "./actor";

/**
 * Who did an act, from a form (ADR 0034 D12, Phase 2b, closes F1). The one place an actor's person is read from a request.
 *
 * An act is the signed-in person's own. Nothing a form carries can make it someone else's, except the one thing the registry allows for the slot: recorded
 * on behalf of a named person from a paper record (`onBehalf`), by someone holding the permission to, with the paper's reference or the reason. A person's
 * name in the form without that is not read.
 *
 *   const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn" });
 *   if (!begun.ok) return begun.state;
 *   const act = begun.act;                       // act.subjectPersonId is who it is attributed to; act.recorderId, where it is someone else's, is the actor
 *   ... the checks, against act.subjectPersonId and (act.recorderId) ...
 *   await act.write(tx, step.id, { document: { entity: "Requisition", id } });   // inside the act's own transaction
 *
 * A signature-class act, signed, asks for the password here, before the act's transaction (a wrong password counts towards the lockout and is written on
 * its own: inside the act's transaction a refusal would roll it back). The stamp it leaves on the session is what `write` checks and spends.
 *
 * The rule is `src/lib/auth/act-begin.ts`; this file binds it to the database, the clock and the password check. A source scan
 * (`act-wiring-scan.test.ts`, `act-attribution-scan.test.ts`) holds every other reader of a person from a form to the people it lists as not being the actor.
 */

export type { BeginActOptions, BegunAct, PreparedAct, WriteExtra } from "@/lib/auth/act-begin";
export { actFormFromJson, attributionRefusalState, parseSlotKey, readActForm } from "@/lib/auth/act-begin";
export { actFieldNames, ACT_FIELDS } from "@/lib/auth/act-field-names";

const deps: ActDeps = {
  now: () => new Date(),
  paperSignatureRecording: async (organisationId) => (await loadSecurityPolicy(db, organisationId))?.paperSignatureRecording ?? null,
  stepUp,
  attribute: attributeAct,
};

export const beginAct = (actor: StaffActor, data: FormData, key: string, opts: BeginActOptions): Promise<BegunAct> => beginActWith(deps, actor, data, key, opts);

/// As `beginAct`, for an act whose request is not a form (a route handler's JSON body): the caller has read who the request names into an `ActForm`.
export const beginActFrom = (actor: StaffActor, form: ActForm, key: string, opts: BeginActOptions): Promise<BegunAct> => beginActFromWith(deps, actor, form, key, opts);
