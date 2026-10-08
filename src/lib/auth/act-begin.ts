import type { FormState } from "@/components/record-editor";
import type { Tx } from "@/lib/audit/record";
import { todayIn } from "@/lib/dates";

import { administrationConflict } from "./administration-conflict";
import { actFieldNames } from "./act-field-names";
import { actFaultErrors, interpretAct, type ActForm, type ActIntent } from "./act-input";
import { slotOf, type ActSlot } from "./act-slots";
import { attributionFaults, type ActModeName } from "./attribution";
import { AttributionRefused, recorderOf, type AttributeActInput } from "./attribution-store";
import type { StaffActor } from "./types";

/**
 * Who did an act, from a form (ADR 0034 D12, Phase 2b, closes F1): the whole of `beginAct` but for the three things it asks of the world, which are
 * handed in (`ActDeps`) so that the rule is the same in the server and in a test, and the clock is never read here:
 *
 *   - the organisation's switch for recording a signature from paper (read from the database in the server);
 *   - the password check of a signature, which counts a wrong one towards the lockout (`stepUp`);
 *   - the write of the attribution itself, in the act's own transaction (`attributeAct`).
 *
 * `src/app/_auth/act.ts` binds them. A test binds fakes (`src/lib/test-support/staff.ts`, `actModule`), and so exercises the real reading of the form.
 */

export interface ActDeps {
  /// The instant the act is read at: the day of the act is the organisation's day of it.
  now(): Date;
  /// The organisation's switch for a signature recorded from paper: null where it is not set (which refuses, and says so).
  paperSignatureRecording(organisationId: string): Promise<"ALLOWED" | "REFUSED" | null>;
  /// The password of a signature, asked before the act's transaction. A wrong one counts towards the lockout.
  stepUp(actor: StaffActor, password: string): Promise<{ ok: true; at: Date } | { ok: false; message: string }>;
  /// The attribution row, written in the act's own transaction.
  attribute(tx: Tx, input: AttributeActInput): Promise<unknown>;
}

export interface BeginActOptions {
  /// The form field that names the attested person where the act is recorded on someone's behalf.
  personField: string;
  /// The form field that dates the act, where it is dated.
  dateField?: string;
  /// The exact document or record a signature-class act signs, where it is known before the act is read (it is also given to `write`).
  document?: { entity: string; id: string } | null;
  /// Narrows the slot: `false` where this act is the signed-in person's own although its slot may be recorded from paper elsewhere (a slot several acts write).
  /// It can only narrow: an act whose slot is not paper-capable is never made so.
  onBehalf?: boolean;
  /// The form names whom the act is about in the person field itself (a grantor of a delegation, a requesting officer): it is the subject, and is the actor's
  /// own when it is the signed-in person and recorded on their behalf when it is anyone else, so the switch is not asked for. The paper or the reason still is.
  namesSubject?: boolean;
}

export interface WriteExtra {
  /// NFR-SIG-001: what a signature-class act signs, and the office the signer held.
  document?: { entity: string; id: string } | null;
  roleCode?: string | null;
}

export interface PreparedAct {
  slot: ActSlot;
  actor: StaffActor;
  intent: ActIntent;
  /// Whom the act is attributed to.
  subjectPersonId: string;
  /// The signed-in person where the act is attributed to someone else, else null: the person the separation-of-duties checks run on besides the subject.
  recorderId: string | null;
  /// The people the separation-of-duties checks run against: the actor and, where it differs, the person the act is attributed to.
  people: string[];
  /// The day the act is dated (YYYY-MM-DD): today, the back-dated day, or the paper's day. Null where the act has no date.
  day: string | null;
  stepUpAt: Date | null;
  /// Written in the act's own transaction, with its audit row.
  write(tx: Tx, entityId: string, extra?: WriteExtra): Promise<void>;
  /// The same act also fills another person slot (a shortlist is a stage's submission and each bid's shortlisting): the same person, the same way. Only a slot
  /// that is not a signature, so that one password entry never signs two acts.
  writeAlso(tx: Tx, slotKey: string, entityId: string, extra?: WriteExtra): Promise<void>;
}

export type BegunAct = { ok: true; act: PreparedAct } | { ok: false; state: FormState };

const text = (data: FormData, name: string): string => {
  const v = data.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/// The form's say about who acted, read. This and `beginAct` are the only readers of an actor's person from a request.
export function readActForm(data: FormData, opts: { personField: string; dateField?: string }): ActForm {
  const f = actFieldNames(opts.personField);
  return {
    onBehalf: data.get(f.onBehalf) != null && text(data, f.onBehalf) !== "off",
    attestedPersonId: text(data, opts.personField) || null,
    paperReference: text(data, f.paperReference),
    reason: text(data, f.reason),
    password: typeof data.get(f.password) === "string" ? (data.get(f.password) as string) : "",
    claimedDay: opts.dateField ? text(data, opts.dateField) || null : null,
    backdate: data.get(f.backdate) != null && text(data, f.backdate) !== "off",
    backdateReason: text(data, f.backdateReason),
    backdateAuthorisedByPersonId: text(data, f.backdateAuthorisedBy) || null,
  };
}

/**
 * The same, for a request whose body is JSON (a route handler): who the body says the act is recorded for. The key is the person's own (`onBehalfOf`),
 * and it is read only as the attested person of an act recorded on someone's behalf, never as the actor. The paper reference and the reason ride beside it.
 */
export function actFormFromJson(body: unknown, opts: { personKey: string; dateKey?: string }): ActForm {
  const o = (typeof body === "object" && body != null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const person = s(opts.personKey);
  return {
    onBehalf: person !== "",
    attestedPersonId: person || null,
    paperReference: s("paperReference"),
    reason: s("reason"),
    password: typeof o.password === "string" ? o.password : "",
    claimedDay: opts.dateKey ? s(opts.dateKey) || null : null,
    backdate: false,
    backdateReason: "",
    backdateAuthorisedByPersonId: null,
  };
}

export function parseSlotKey(key: string): { entity: string; field: string; slot: ActSlot } {
  const dot = key.indexOf(".");
  const entity = key.slice(0, dot);
  const field = key.slice(dot + 1);
  const slot = slotOf(entity, field);
  if (!slot) throw new Error(`"${key}" is not an act slot (src/lib/auth/act-slots.ts).`);
  return { entity, field, slot };
}

export async function beginActWith(deps: ActDeps, actor: StaffActor, data: FormData, key: string, opts: BeginActOptions): Promise<BegunAct> {
  const form = readActForm(data, opts);
  if (opts.namesSubject && !actor.system) form.onBehalf = form.attestedPersonId != null && form.attestedPersonId !== actor.personId;
  return beginActFromWith(deps, actor, form, key, opts);
}

/// As `beginActWith`, for an act whose request is not a form (a route handler's JSON body): the caller has read who the request names into an `ActForm`.
export async function beginActFromWith(deps: ActDeps, actor: StaffActor, form: ActForm, key: string, opts: BeginActOptions): Promise<BegunAct> {
  const { entity, field, slot } = parseSlotKey(key);
  // NFR-SEC-004 (the product owner's sweep, Phase 3d): administration is kept apart from every transactional, approval and certification capability, so an
  // administrator account does no act that attributes a person, but the few that are an administrator's own configuration acts (`administratorMay`). A loader
  // run is not an account, and is never refused here. This is the second line behind the entry points that ask first (`staffForAct`): nothing reaches a write by
  // way of a slot without passing it.
  if (!actor.system && !slot.administratorMay) {
    const refused = administrationConflict({ kind: "ACT", act: "TRANSACTION", actorIsAdministrator: actor.isAdministrator });
    if (refused) return { ok: false, state: { ok: false, message: refused.en } };
  }
  const today = todayIn(deps.now(), actor.organisationTimeZone);
  const read = interpretAct({
    slot: { signatureClass: slot.signatureClass, onBehalf: slot.onBehalf && opts.onBehalf !== false, paperGated: slot.paperGated },
    actorPersonId: actor.system ? null : actor.personId,
    systemLabel: actor.system?.label ?? null,
    today,
    dated: opts.dateField != null,
    form,
  });
  if (!read.ok) {
    const shown = actFaultErrors(read.faults, { person: opts.personField, date: opts.dateField });
    return { ok: false, state: { ok: false, errors: shown.errors, message: shown.message } };
  }
  const intent = read.intent;

  // The refusals the writer will make, said now as the form's own: the permission to record from paper, the organisation's switch, an unknown slot.
  const paperSwitch = await deps.paperSignatureRecording(actor.organisationId);
  const preflight = attributionFaults({
    entity,
    entityId: "pending",
    slot: field,
    subject: { kind: "PERSON", personId: intent.subjectPersonId },
    recorder: recorderOf(actor),
    mode: intent.mode,
    // The password is asked below: judged there.
    stepUpAt: intent.passwordRequired ? new Date(0) : null,
    paperReference: intent.paperReference,
    reason: intent.reason,
    recorderPermissions: actor.permissions,
    paperSignatureRecording: paperSwitch,
    document: opts.document ?? { entity: "pending", id: "pending" },
    effectiveOn: intent.effectiveOn,
    backdate: intent.backdate,
  });
  if (preflight.length > 0) return { ok: false, state: { ok: false, message: preflight.map((f) => f.en).join(" ") } };

  let stepUpAt: Date | null = null;
  if (intent.passwordRequired) {
    const asked = await deps.stepUp(actor, form.password);
    if (!asked.ok) return { ok: false, state: { ok: false, errors: { [actFieldNames(opts.personField).password]: asked.message } } };
    stepUpAt = asked.at;
  }

  const recorderId = actor.system || intent.subjectPersonId === actor.personId ? null : actor.personId;
  const people = [...new Set([intent.subjectPersonId, ...(recorderId ? [recorderId] : [])])];
  const act: PreparedAct = {
    slot,
    actor,
    intent,
    subjectPersonId: intent.subjectPersonId,
    recorderId,
    people,
    day: intent.day,
    stepUpAt,
    async write(tx, entityId, extra) {
      await deps.attribute(tx, {
        actor,
        entity,
        entityId,
        slot: field,
        subject: { kind: "PERSON", personId: intent.subjectPersonId },
        mode: intent.mode as ActModeName,
        stepUpAt,
        paperReference: intent.paperReference,
        reason: intent.reason,
        document: extra?.document ?? opts.document ?? null,
        roleCode: extra?.roleCode ?? null,
        effectiveOn: intent.effectiveOn,
        backdate: intent.backdate,
      });
    },
    async writeAlso(tx, slotKey, entityId, extra) {
      const also = parseSlotKey(slotKey);
      if (also.slot.signatureClass) throw new Error(`"${slotKey}" is a signature: it asks its own password and is begun with its own beginAct.`);
      // A slot that cannot be recorded for someone else, written by an act that was: refused as the form's message, never a crash (the registry holds every such pairing: `act-wiring-scan.test.ts`).
      if (intent.mode === "RECORDED_ON_BEHALF" && !also.slot.onBehalf && !actor.system) {
        throw new AttributionRefused([
          {
            code: "CONSEQUENCE_NOT_PAPER",
            en: `"${also.slot.label}" cannot be recorded for someone else, so this act cannot be recorded from paper: the person it is for signs it themselves.`,
            ms: `"${also.slot.ms}" tidak boleh direkodkan bagi pihak orang lain, jadi tindakan ini tidak boleh direkodkan daripada kertas: orang yang berkenaan menandatanganinya sendiri.`,
          },
        ]);
      }
      await deps.attribute(tx, {
        actor,
        entity: also.entity,
        entityId,
        slot: also.field,
        subject: { kind: "PERSON", personId: intent.subjectPersonId },
        mode: intent.mode as ActModeName,
        stepUpAt: null,
        paperReference: intent.paperReference,
        reason: intent.reason,
        document: extra?.document ?? null,
        roleCode: extra?.roleCode ?? null,
        effectiveOn: intent.effectiveOn,
        backdate: null,
      });
    },
  };
  return { ok: true, act };
}

/// An act whose attribution was refused in its own transaction (a race the pre-flight could not see: the password stamp spent, a person gone), as the form's state.
export function attributionRefusalState(error: unknown): FormState | null {
  return error instanceof AttributionRefused ? { ok: false, message: error.faults.map((f) => f.en).join(" ") } : null;
}
