import { randomUUID } from "node:crypto";

import { newAmbient, attempt } from "@/lib/ambient/ambient-tx";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db, savepointSql } from "@/lib/db";

import { auditActorOfStaff } from "./audit-actor";
import type { ChangeAct, ChangeFaults } from "./change-store";
import {
  nextStatus,
  STALE_WORDS,
  STATUS_WORDS,
  type ChangeDecision,
  type ChangeStatus,
} from "./configuration-change";
import {
  describeEdit,
  EDIT_KIND_WORDS,
  editIsStale,
  isEditKind,
  isStoredField,
  parseEditPayload,
  readRehearsal,
  rehearsalOf,
  samePayload,
  withheldFaults,
  type EditKind,
  type EditPayload,
  type StagedValue,
  unresolvedEditRule,
} from "./configuration-edit";
import { blankWithheld, withholdRehearsal, WITHHELD_WORDS } from "@/lib/award/return-withheld";
import { loadCandidates } from "./eligibility-store";
import { eligiblePersonIds } from "./eligibility";
import { loadGrants } from "./permission-store";
import { twoPersonOn } from "./policy-store";
import { appliesAtOnce, withOnePersonReason } from "./two-person";
import { organisationDay } from "@/lib/dates";
import type { Fault, PermissionKey, StaffActor } from "./types";
import { inOrder } from "@/lib/series";

/**
 * The life of an editor's save held for a second person (ADR 0034 D15, Phase 5). The rules of the editor are the editor's own and are not restated here: the
 * registry runs it. This file proposes (a rehearsal: the editor runs, its audit rows are kept, everything is undone), decides (the editor runs again, for
 * real, inside the decision's transaction, and the change is STALE if it would now change something other than it was rehearsed to change), and withdraws.
 *
 * Lock order: the change's own row, and then whatever the editor locks, in the editor's own order. The organisation's row is not taken first, because an editor
 * that locks another row before it would then be ordered against every other path that does (see `lock-order.test.ts`).
 */

/// What the registry knows of an editor.
export interface EditOperation {
  key: string;
  kind: EditKind;
  /// The editor in words, for the queue: "Numbering: save a series".
  label: string;
  /// Whether an administrator account may propose or decide it. False where the editor reaches what an administrator is kept from (NFR-SEC-004: SULIT values,
  /// the corrections of a contract, a rate schedule); the editor itself still refuses an administrator where it asks for one.
  administratorMay: boolean;
  /// What the proposer must hold: `configuration.draft` for configuration; null for an act of the record, whose own rule (who may do the act) is judged in the rehearsal.
  proposePermission: PermissionKey | null;
  /// What the person who decides must hold: `configuration.issue` for configuration, `corrections.decide` for a correction of the record.
  decidePermission: PermissionKey;
}

export interface EditRunResult {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
}

/// The editors, from the app layer (they live under `src/app`, which this library does not import).
export interface EditRegistry {
  find(key: string): EditOperation | null;
  /// Run the editor with `data` as its posted form, as the signed-in person of the request.
  run(key: string, data: FormData): Promise<EditRunResult>;
}

export type EditRefusal = { ok: false; kind: "EDITOR"; result: EditRunResult } | ChangeFaults;
/// Proposed, waiting for a second person (`changeId`); or applied at once, because the organisation's two-person switch is off (`applied`, no change row).
export type ProposeEditOutcome = { ok: true; changeId: string; applied?: undefined } | { ok: true; applied: true; changeId?: undefined } | EditRefusal;

const f = (code: string, en: string): Fault => ({ code, en });
const refuse = (faults: Fault[]): ChangeFaults => ({ ok: false, kind: "FAULTS", faults });

const LOADER = f("LOADER_RUN", "A loader run is not a person, so it cannot propose or decide a change.");
const NO_SUCH_CHANGE = f("NO_SUCH_CHANGE", "That change no longer exists.");
const UNKNOWN_EDITOR = f("UNKNOWN_EDITOR", "That is not an editor a change can carry.");
const NO_CHANGE = f("NO_CHANGE", "Nothing would change: the values posted are the ones already stored.");
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

const ADMIN_REFUSED = f(
  "ADMINISTRATOR_REFUSED",
  "An administrator account does not propose or decide this change: it reaches what administration is kept apart from (SULIT values or the contract's corrections).",
);

/// The posted form, put back as the editor reads it. The reason is the change's own, not a posted field.
export function formOf(payload: Pick<EditPayload, "operation" | "fields">, reason: string): FormData {
  const data = new FormData();
  for (const [name, value] of payload.fields) {
    if (name === "reason") continue;
    if (typeof value === "string") data.append(name, value);
    else data.append(name, new File([Buffer.from(value.file.base64, "base64")], value.file.name, { type: value.file.type }));
  }
  data.set("reason", reason);
  return data;
}

/// A posted form with the change's reason in place of whatever it posted.
function withReason(data: FormData, reason: string): FormData {
  const out = new FormData();
  for (const [name, value] of data.entries()) if (name !== "reason") out.append(name, value);
  out.set("reason", reason);
  return out;
}

/// A posted form, as a change holds it. Files above the size a change holds are refused later, by `parseEditPayload`, with the field named.
export async function stagedFields(data: FormData): Promise<[string, StagedValue][]> {
  const out: [string, StagedValue][] = [];
  for (const [name, value] of data.entries()) {
    // The reason is the change's own; a password and an act's attribution fields are the acting person's, read from their own request, and are never stored.
    if (name === "reason" || !isStoredField(name)) continue;
    if (typeof value === "string") out.push([name, value]);
    else out.push([name, { file: { name: value.name, type: value.type, size: value.size, base64: value.size > 1_500_000 ? "" : Buffer.from(await value.arrayBuffer()).toString("base64") } }]);
  }
  return out;
}

/// The proposer's reason with who proposed it, as the editor records it when the second person applies it.
export const appliedReason = (proposerName: string, reason: string): string => (reason ? `${reason} (proposed by ${proposerName}, applied by a second person)` : `Proposed by ${proposerName}, applied by a second person`);

/// Who could decide an editor's save, besides `exceptPersonId`: holders of the deciding permission, and not an administrator account where the editor is kept from one.
async function deciders(client: Tx, actor: StaffActor, op: EditOperation, now: Date, exceptPersonId: string): Promise<string[]> {
  const [candidates, grants] = await inOrder(() => loadCandidates(client, actor.organisationId), () => loadGrants(client, actor.organisationId));
  const usable = op.administratorMay ? candidates : candidates.filter((c) => !c.isAdministrator);
  return eligiblePersonIds(op.decidePermission, usable, grants, organisationDay(now, actor.organisationTimeZone)).filter((p) => p !== exceptPersonId);
}

/// Who may propose it: a holder of the maker's permission, and not an administrator account where the editor is kept from one.
export function editProposalFaults(op: EditOperation, proposer: { permissions: ReadonlySet<string>; isAdministrator: boolean }): Fault[] {
  const out: Fault[] = [];
  if (op.proposePermission && !proposer.permissions.has(op.proposePermission)) out.push(f("NOT_PERMITTED", "You do not hold the permission that proposes a change to configuration."));
  if (!op.administratorMay && proposer.isAdministrator) out.push(ADMIN_REFUSED);
  return out;
}

/// Who may decide it: a different Person from the proposer, holding the checker's permission, while it is proposed, and not an administrator account where the editor is kept from one.
export function editDecisionFaults(op: Pick<EditOperation, "decidePermission" | "administratorMay">, change: { status: string; proposedByPersonId: string }, decider: { personId: string; permissions: ReadonlySet<string>; isAdministrator: boolean }): Fault[] {
  const out: Fault[] = [];
  if (change.status !== "PROPOSED") out.push(f("NOT_PROPOSED", "This change has already been decided or withdrawn."));
  if (decider.personId === change.proposedByPersonId) out.push(f("PROPOSER_IS_DECIDER", "You proposed this change, so you cannot decide it. A second person decides it."));
  if (!decider.permissions.has(op.decidePermission)) out.push(f("NOT_PERMITTED", "You do not hold the permission that decides this kind of change."));
  if (!op.administratorMay && decider.isAdministrator) out.push(ADMIN_REFUSED);
  return out;
}

/// The fault where nobody besides the proposer could decide it: the product never fakes a second approval, and says who must exist first.
const secondPerson = (op: EditOperation) =>
  op.decidePermission === "configuration.issue"
    ? f(
        "SECOND_PERSON_NEEDED",
        "A second person is needed. Nobody else can decide a change to configuration, and the person who proposes a change never decides it. Another holder of the permission to issue configuration must exist first (an administrator holds it, and so does a role the organisation grants it to).",
      )
    : f(
        "SECOND_PERSON_NEEDED",
        "A second person is needed. Nobody else can decide a correction of the record, and the person who proposes one never decides it. The organisation must first grant the permission to decide corrections to a role that someone else holds (Configuration, Users and roles), and an administrator account does not decide a correction.",
      );

// --------------------------------------------------------------------------------------------- proposing

export async function proposeEdit(
  actor: StaffActor,
  act: ChangeAct,
  registry: EditRegistry,
  input: { operation: string; fields: [string, StagedValue][]; reason: string; /// The form as posted, for the rehearsal.
    posted?: FormData },
  now: Date = new Date(),
): Promise<ProposeEditOutcome> {
  if (actor.system) return refuse([LOADER]);
  const op = registry.find(input.operation);
  if (!op) return refuse([UNKNOWN_EDITOR]);
  const unpermitted = editProposalFaults(op, actor);
  if (unpermitted.length > 0) return refuse(unpermitted);
  const parsed = parseEditPayload({ operation: input.operation, fields: input.fields }, op.kind);
  if (!parsed.ok) return refuse(parsed.faults.map((x) => f(x.code, `${x.field === "*" ? "" : `${x.field}: `}${x.en}`)));
  // A proposal never holds the withheld marker (go-live N7): that is a decided change's record.
  const marked = withheldFaults(parsed.payload);
  if (marked.length > 0) return refuse(marked);
  // Stored as the editor's own shape: `withheld` is a reading of a decided row, never a key of the stored payload.
  const payload = { operation: parsed.payload.operation, fields: parsed.payload.fields };
  const reason = input.reason.trim();

  return db.$transaction(async (tx): Promise<ProposeEditOutcome> => {
    // The same proposer's same proposal, waiting: said, not stacked.
    const waiting = await tx.configurationChange.findMany({ where: { organisationId: actor.organisationId, kind: op.kind, status: "PROPOSED", proposedByPersonId: actor.personId }, select: { payload: true } });
    for (const w of waiting) {
      const p = parseEditPayload(w.payload, op.kind);
      if (p.ok && samePayload(p.payload, payload)) return refuse([f("ALREADY_PROPOSED", "You have already proposed exactly this. It is waiting for a second person.")]);
    }
    // The rehearsal: the editor runs against the live values, as the proposer, and everything it wrote is undone. What it refuses is told to the proposer in its own words.
    const ambient = newAmbient(tx, savepointSql(tx), "REHEARSAL");
    // The editor is rehearsed on the form as it was posted where the caller has it (an act's own fields, a paper reference, are judged for the proposer as they always were), else on what is kept.
    const rehearsed = input.posted ? withReason(input.posted, reason) : formOf(payload, reason);
    const run = await attempt(ambient, () => registry.run(op.key, rehearsed), () => false);
    if (!run.result.ok) return { ok: false, kind: "EDITOR", result: run.result };
    if (run.captured.length === 0) return refuse([NO_CHANGE]);

    // Switch off (ADR 0043 D3): the save applies at once, in this transaction, by the same editor run a decision makes, as the person. No change row is written (that table holds
    // only two-person decisions), and every audit row the editor writes carries the one-person reason. Read without a lock: an editor takes its own locks in its own order, and
    // a switch turned on in the meantime only makes this save one the person was entitled to a moment ago.
    // shortcut: no organisation lock around the read, upgrade if editors are made to lock the organisation first.
    // Only a holder of the permission that decides it saves alone (step 4.8 M1): a drafter without it falls through to the queue, as with the switch on.
    if (appliesAtOnce(op.kind, await twoPersonOn(tx, actor.organisationId)) && actor.permissions.has(op.decidePermission)) {
      const real = newAmbient(tx, savepointSql(tx), "IMMEDIATE");
      const oneReason = withOnePersonReason(reason);
      const applied = await attempt(real, () => registry.run(op.key, withReason(rehearsed, oneReason)), (r) => r.ok);
      if (!applied.result.ok) return { ok: false, kind: "EDITOR", result: applied.result };
      // One summary row whatever the editor audits itself, so the list of one-person changes holds every one (step 4.8 M3).
      const summary = describeEdit(op.kind, op.label, rehearsalOf(run.captured));
      await writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "ConfigurationChange", entityId: randomUUID(), entityLabel: op.label, reason: oneReason, actor: auditActorOfStaff(actor) },
        "CREATE",
        [{ field: "Change", before: null, after: summary.title }, ...summary.lines.map((l) => ({ field: l.label, before: l.before, after: l.after }))],
      );
      return { ok: true, applied: true };
    }

    // Nobody else could decide it: refused here, with the reason said, rather than left in a queue that no one can clear.
    const others = await deciders(tx, actor, op, now, actor.personId);
    if (others.length === 0) return refuse([secondPerson(op)]);

    const before = rehearsalOf(run.captured);
    const row = await tx.configurationChange.create({
      data: { organisationId: actor.organisationId, kind: op.kind, payload: payload as unknown as object, before: before as unknown as object, reason, proposedByPersonId: actor.personId, proposedAt: now },
      select: { id: true },
    });
    // The trail is append-only: the proposal's own row says "Withheld" for each personal value of a return correction (go-live N7). The queue reads the stored `before`.
    const summary = describeEdit(op.kind, op.label, withholdRehearsal(op.kind, payload.operation, before));
    await writeAudit(
      tx,
      { organisationId: actor.organisationId, entity: "ConfigurationChange", entityId: row.id, entityLabel: op.label, reason, actor: auditActorOfStaff(actor) },
      "CREATE",
      [
        { field: "Change", before: null, after: summary.title },
        ...(summary.subject ? [{ field: "About", before: null, after: summary.subject }] : []),
        ...summary.lines.map((l) => ({ field: l.label, before: l.before, after: l.after })),
        { field: "Standing", before: null, after: STATUS_WORDS.PROPOSED.en },
      ],
    );
    await act.write(tx, row.id);
    return { ok: true, changeId: row.id };
  }, TX_OPTIONS);
}

// --------------------------------------------------------------------------------------------- deciding

export type DecideEditOutcome =
  | { ok: true; status: "APPLIED" | "DECLINED" | "WITHDRAWN" }
  | { ok: false; kind: "STALE"; message: string }
  | EditRefusal;

interface EditDecision {
  decision: Extract<ChangeDecision, "APPLY" | "DECLINE" | "WITHDRAW">;
  reason: string;
  roleCode?: string | null;
}

const DECISION_AUDIT_REASON: Record<EditDecision["decision"], string> = { APPLY: "Applied by a second person", DECLINE: "Declined by a second person", WITHDRAW: "Withdrawn by its proposer" };

export async function decideEdit(
  actor: StaffActor,
  act: ChangeAct,
  registry: EditRegistry,
  input: { changeId: string } & EditDecision,
  now: Date = new Date(),
): Promise<DecideEditOutcome> {
  if (actor.system) return refuse([LOADER]);
  const reason = input.reason.trim();
  if (input.decision === "DECLINE" && !reason) return refuse([f("REASON_REQUIRED", "A reason is required.")]);

  return db.$transaction(async (tx): Promise<DecideEditOutcome> => {
    await tx.$queryRaw`SELECT id FROM "ConfigurationChange" WHERE id = ${input.changeId} AND "organisationId" = ${actor.organisationId} FOR UPDATE`;
    const row = await tx.configurationChange.findFirst({ where: { id: input.changeId, organisationId: actor.organisationId }, include: { proposedBy: { select: { name: true } } } });
    if (!row || !isEditKind(row.kind)) return refuse([NO_SUCH_CHANGE]);
    const parsed = parseEditPayload(row.payload, row.kind);
    const op = parsed.ok ? registry.find(parsed.payload.operation) : null;
    // A change that cannot be read, or whose editor is gone, cannot be applied. It can still be declined or withdrawn (no editor runs), so that its personal values are blanked
    // like any other decided change's (go-live N7), by the rule of its kind.
    const unreadable = f("UNREADABLE", "This change no longer fits what a change of its kind carries, or its editor is gone, so it cannot be applied. Decline it, and propose it again.");
    if (input.decision === "APPLY" && (!parsed.ok || !op)) return refuse([unreadable]);
    const rule = op ?? unresolvedEditRule(row.kind);

    if (input.decision === "WITHDRAW") {
      if (row.status !== "PROPOSED") return refuse([f("NOT_PROPOSED", "This change has already been decided or withdrawn.")]);
      if (row.proposedByPersonId !== actor.personId) return refuse([f("NOT_THE_PROPOSER", "Only the person who proposed a change withdraws it.")]);
    } else {
      const faults = editDecisionFaults(rule, row, actor);
      if (faults.length > 0) return refuse(faults);
      // A payload already holding the withheld marker would run the editor on empty values (go-live N7).
      if (input.decision === "APPLY" && parsed.ok) {
        const marked = withheldFaults(parsed.payload);
        if (marked.length > 0) return refuse(marked);
      }
    }

    const label = op?.label ?? EDIT_KIND_WORDS[row.kind].en;
    const decidedBy = { decidedByPersonId: actor.personId, decidedAt: now };
    // PDPA (go-live N7; ruling on open item 2030, decisions-log line 2047, chosen at line 2823): the contractor signatory's personal values leave the stored payload in
    // the same UPDATE that decides it, whatever the decision. The editor has already run on the parsed in-memory payload, so the correction is unaffected. Null for any other kind.
    const blanked = blankWithheld(row.kind, row.payload);
    const trail = (status: ChangeStatus, why: string, decisionReason: string) =>
      writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "ConfigurationChange", entityId: row.id, entityLabel: label, reason: decisionReason ? `${why}: ${decisionReason}` : why, actor: auditActorOfStaff(actor) },
        "UPDATE",
        [
          { field: "Standing", before: STATUS_WORDS.PROPOSED.en, after: STATUS_WORDS[status].en },
          { field: "Decided by", before: null, after: actor.personName },
          // Said, never the values themselves.
          ...(blanked ? [{ field: WITHHELD_WORDS.field, before: WITHHELD_WORDS.held, after: WITHHELD_WORDS.en }] : []),
        ],
      );
    const conclude = async (status: ChangeStatus, why: string, decisionReason: string) => {
      await tx.configurationChange.update({ where: { id: row.id }, data: { status, ...decidedBy, decisionReason, ...(blanked ? { payload: blanked } : {}) } });
      await trail(status, why, decisionReason);
      await act.write(tx, row.id, { document: { entity: "ConfigurationChange", id: row.id }, roleCode: input.roleCode ?? null });
    };

    if (input.decision === "WITHDRAW" || input.decision === "DECLINE") {
      const status = nextStatus("PROPOSED", input.decision)!;
      await conclude(status, DECISION_AUDIT_REASON[input.decision], reason);
      return { ok: true, status: status as "DECLINED" | "WITHDRAWN" };
    }

    if (!parsed.ok || !op) return refuse([unreadable]);
    // APPLY. The editor runs, for real, in this transaction. It is kept only if it did not refuse and wrote what it was rehearsed to write: otherwise every
    // write it made is undone, and the change is either left proposed (the editor refused: the cause can be put right, or the change declined) or STALE.
    const rehearsed = readRehearsal(row.before);
    const ambient = newAmbient(tx, savepointSql(tx), "APPLY", { personId: row.proposedByPersonId, name: row.proposedBy.name });
    let stale = false;
    const run = await attempt(
      ambient,
      () => registry.run(op.key, formOf(parsed.payload, appliedReason(row.proposedBy.name, row.reason))),
      (result, captured) => {
        if (!result.ok) return false;
        stale = !rehearsed || editIsStale(rehearsed, captured);
        return !stale;
      },
    );
    if (!run.result.ok) return { ok: false, kind: "EDITOR", result: run.result };
    if (stale) {
      const status = nextStatus("PROPOSED", "STALE")!;
      await conclude(status, "Out of date when it was decided", STALE_WORDS.en);
      return { ok: false, kind: "STALE", message: STALE_WORDS.en };
    }
    await conclude(nextStatus("PROPOSED", "APPLY")!, DECISION_AUDIT_REASON.APPLY, reason);
    return { ok: true, status: "APPLIED" };
  }, TX_OPTIONS);
}

export { EDIT_KIND_WORDS };
