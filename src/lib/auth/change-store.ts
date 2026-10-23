import { AccountStatus } from "@/generated/prisma/client";
import type { FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { lockOrganisation } from "@/lib/authority/locks";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";

import { holdingHistoryOf, holdingsOf, lockPersons } from "./administration-guard";
import { auditActorOfStaff } from "./audit-actor";
import { codeExpiry, formatCode, generateCode, hashCode } from "./codes";
import {
  accountCodeTargetFaults,
  decisionFaults,
  isStale,
  KIND_PERMISSION,
  KIND_WORDS,
  nextStatus,
  parseChange,
  planChange,
  proposalFaults,
  secondPersonFault,
  snapshot,
  STALE_WORDS,
  STATUS_WORDS,
  type ChangeDecision,
  type ChangeKind,
  type ChangeStatus,
  type FieldFault,
  type LiveState,
  type ParsedChange,
  type PermissionChoice,
} from "./configuration-change";
import { describeChange, type ChangeLine, type ChangeNames } from "./configuration-change-words";
import { isEditKind } from "./configuration-edit";
import { eligibleFor } from "./eligibility-store";
import { recordSignInEvent } from "./events";
import { lockAccount } from "./identity";
import { PERMISSIONS } from "./permissions";
import { settingLabels, unsetSettings } from "./policy";
import { loadSecurityPolicy } from "./policy-store";
import type { RequestFacts } from "./request";
import { revokeAccountSessions } from "./session-store";
import type { Fault, StaffActor } from "./types";
import type { WriteExtra } from "./act-begin";
import { inOrder } from "@/lib/series";

/**
 * The life of a two-person change, against the database (ADR 0034 D15, Phase 2c). The rules are pure (`configuration-change.ts`, and `eligibility.ts`);
 * this reads what they judge, in one transaction, and writes the result with its audit row and its attribution.
 *
 * - `proposeChange`: the proposer holds the kind's permission; what is proposed is parsed field by field, run against the live values, and refused if it would not apply
 *   or if nobody besides the proposer could decide it (the product never fakes a second approval). The live values it depends on are kept as `before`.
 * - `decideChange`: a different Person, holding the permission, who gave their password, applies or declines it. Applying re-reads the live values under the locks:
 *   if they no longer read as `before`, the change is STALE, which is written (a decision is) and nothing is applied. If the rules of the kind refuse the live
 *   state, the change stays PROPOSED and the faults are given back.
 * - `withdrawChange`: the proposer takes their own change back.
 *
 * Lock order, always: the organisation, then the change's row, then the account, then the Persons, and no other lock after them. The database refuses what this
 * code must never do (a decided change is final, the proposer never decides: migrations 20261007130100 and 20261007160000).
 */

/// What the store needs of an act that was begun with the password: the person it is attributed to and the writer of its row.
export interface ChangeAct {
  subjectPersonId: string;
  write(tx: Tx, entityId: string, extra?: WriteExtra): Promise<void>;
}

export type ChangeFaults = { ok: false; kind: "FAULTS"; faults: Fault[]; fields?: FieldFault[] };

const refuse = (faults: Fault[], fields?: FieldFault[]): ChangeFaults => ({ ok: false, kind: "FAULTS", faults, ...(fields ? { fields } : {}) });
const f = (code: string, en: string): Fault => ({ code, en });

const REASON_REQUIRED = f("REASON_REQUIRED", "A reason is required.");
const NO_SUCH_CHANGE = f("NO_SUCH_CHANGE", "That change no longer exists.");
const LOADER = f("LOADER_RUN", "A loader run is not a person, so it cannot propose or decide a change.");

const accountLabel = (personName: string) => `Sign-in account of ${personName}`;

// --------------------------------------------------------------------------------------------- reading the live state

interface Target {
  accountId: string | null;
  personId: string | null;
  personName: string | null;
}

/// The account a change is about, found before it is locked (an account's Person never changes, so what is read here is what stays true).
async function targetOf(tx: Tx, organisationId: string, change: ParsedChange): Promise<Target> {
  if (change.kind === "ADMINISTRATOR_GRANT" || change.kind === "ADMINISTRATOR_REVOKE" || change.kind === "ACCOUNT_CODE") {
    const account = await tx.staffAccount.findFirst({ where: { id: change.payload.accountId, organisationId }, select: { id: true, personId: true, person: { select: { name: true } } } });
    return { accountId: account?.id ?? null, personId: account?.personId ?? null, personName: account?.person.name ?? null };
  }
  return { accountId: null, personId: null, personName: null };
}

/// The locks a change takes on what it is about, after the change's own row: the account, then the Person.
async function lockTarget(tx: Tx, target: Target): Promise<void> {
  if (target.accountId) await lockAccount(tx, target.accountId);
  if (target.personId) await lockPersons(tx, [target.personId]);
}

async function accountFacts(tx: Tx, organisationId: string, accountId: string) {
  const a = await tx.staffAccount.findFirst({ where: { id: accountId, organisationId }, select: { isAdministrator: true, status: true, person: { select: { isActive: true } } } });
  return a ? { isAdministrator: a.isAdministrator, status: a.status, personActive: a.person.isActive } : null;
}

/// The live values a change is judged on: read after the locks, in the caller's transaction.
export async function readLive(tx: Tx, organisationId: string, change: ParsedChange, target: Target, now: Date): Promise<LiveState> {
  switch (change.kind) {
    case "SECURITY_POLICY":
      return { kind: change.kind, policy: await loadSecurityPolicy(tx, organisationId) };
    case "PERMISSION_GRANT": {
      const [row, role] = await inOrder(
        () => tx.rolePermission.findUnique({ where: { organisationId_permissionKey_roleCode: { organisationId, permissionKey: change.payload.permissionKey, roleCode: change.payload.roleCode } }, select: { decision: true } }),
        // A committee is not a role a person signs in as, so a permission is never granted to one.
        () => tx.authorityRole.findFirst({ where: { organisationId, code: change.payload.roleCode, isCommittee: false }, select: { id: true } }));
      const decision: PermissionChoice = row?.decision ?? "UNDECIDED";
      return { kind: change.kind, decision, roleExists: role != null };
    }
    case "ADMINISTRATOR_GRANT": {
      const account = target.accountId ? await accountFacts(tx, organisationId, target.accountId) : null;
      const holdings = target.personId ? await holdingsOf(tx, target.personId, now) : { offices: 0, seats: 0, delegations: 0 };
      return { kind: change.kind, account, holdings };
    }
    case "ADMINISTRATOR_REVOKE": {
      const account = target.accountId ? await accountFacts(tx, organisationId, target.accountId) : null;
      const activeAdministrators = await tx.staffAccount.count({ where: { organisationId, isAdministrator: true, status: AccountStatus.ACTIVE } });
      return { kind: change.kind, account, activeAdministrators };
    }
    case "ACCOUNT_CODE": {
      const account = target.accountId ? await accountFacts(tx, organisationId, target.accountId) : null;
      // What the person has ever held, not what they hold this minute: an office ended a moment ago is not what lets one person reset an approver's account.
      const h = target.personId ? await holdingHistoryOf(tx, target.personId) : { offices: 0, seats: 0, delegations: 0 };
      return { kind: change.kind, account, heldOffice: h.offices + h.seats + h.delegations > 0 };
    }
  }
}

/// The names a change reads by, for its audit rows and its queue.
async function namesFor(tx: Tx, organisationId: string, change: ParsedChange, target: Target): Promise<ChangeNames> {
  let roleName: string | null = null;
  if (change.kind === "PERMISSION_GRANT") {
    roleName = (await tx.authorityRole.findFirst({ where: { organisationId, code: change.payload.roleCode }, select: { nameEn: true } }))?.nameEn ?? null;
  }
  return { accountPerson: target.personName, roleName };
}

/// A change's lines as the trail records them: in words, so History reads them without a code.
function auditLines(kind: ChangeKind, change: ParsedChange, before: Record<string, unknown>, names: ChangeNames): FieldChange[] {
  const summary = describeChange(kind, change.payload, before, names);
  return [
    { field: "Change", before: null, after: summary.title },
    ...(summary.subject ? [{ field: "About", before: null, after: summary.subject }] : []),
    ...summary.lines.map((l) => ({ field: l.label, before: l.before, after: l.after })),
  ];
}

// --------------------------------------------------------------------------------------------- proposing

export type ProposeOutcome = { ok: true; changeId: string } | ChangeFaults;

export async function proposeChange(
  actor: StaffActor,
  act: ChangeAct,
  input: { kind: ChangeKind; payload: unknown; reason: string },
  now: Date = new Date(),
): Promise<ProposeOutcome> {
  if (actor.system) return refuse([LOADER]);
  const reason = input.reason.trim();
  const parsed = parseChange(input.kind, input.payload);
  if (!parsed.ok) return refuse(parsed.faults.map((x) => f(x.code, x.en)), parsed.faults);
  const change = parsed.change;
  const unpermitted = proposalFaults(input.kind, actor);
  if (unpermitted.length > 0) return refuse(unpermitted);
  if (!reason) return refuse([REASON_REQUIRED], [{ field: "reason", ...REASON_REQUIRED }]);

  return db.$transaction(async (tx): Promise<ProposeOutcome> => {
    await lockOrganisation(tx, actor.organisationId);
    const target = await targetOf(tx, actor.organisationId, change);
    await lockTarget(tx, target);
    const live = await readLive(tx, actor.organisationId, change, target, now);
    const plan = planChange(change, live);
    if (!plan.ok) return refuse(plan.faults);
    if (change.kind === "ACCOUNT_CODE") {
      const own = accountCodeTargetFaults({ targetPersonId: target.personId!, proposerPersonId: actor.personId, deciderPersonId: null });
      if (own.length > 0) return refuse(own);
      const policy = await loadSecurityPolicy(tx, actor.organisationId);
      const unset = unsetSettings(policy, "ISSUE_CODE");
      if (unset.length > 0) return refuse([f("POLICY_NOT_SET", `A code cannot be issued until the organisation sets: ${settingLabels(unset).join("; ")}.`)]);
    }
    // Nobody else could decide it: refused here, with the reason said, rather than left in a queue that no one can clear. A code is never decided by the account's own Person.
    const eligible = (await eligibleFor(tx, { organisationId: actor.organisationId, timeZone: actor.organisationTimeZone, now }, KIND_PERMISSION[input.kind])).filter((p) => (change.kind === "ACCOUNT_CODE" ? p !== target.personId : true));
    const second = secondPersonFault(eligible, actor.personId);
    if (second) return refuse([second]);

    const before = snapshot(change, live);
    const row = await tx.configurationChange.create({
      data: {
        organisationId: actor.organisationId,
        kind: input.kind,
        payload: change.payload as object,
        before: before as object,
        reason,
        proposedByPersonId: actor.personId,
        proposedAt: now,
      },
      select: { id: true },
    });
    const names = await namesFor(tx, actor.organisationId, change, target);
    await writeAudit(
      tx,
      { organisationId: actor.organisationId, entity: "ConfigurationChange", entityId: row.id, entityLabel: KIND_WORDS[input.kind].en, reason, actor: auditActorOfStaff(actor) },
      "CREATE",
      [...auditLines(input.kind, change, before, names), { field: "Standing", before: null, after: STATUS_WORDS.PROPOSED.en }],
    );
    await act.write(tx, row.id);
    return { ok: true, changeId: row.id };
  });
}

// --------------------------------------------------------------------------------------------- deciding

export interface IssuedChangeCode {
  /// Grouped for reading out. Shown once, to the person who decided the change, and never stored: only its hash is.
  code: string;
  expiresAt: Date;
  personName: string;
  purpose: "ACTIVATION" | "RESET";
}

export type DecideOutcome =
  | { ok: true; status: "APPLIED" | "DECLINED" | "WITHDRAWN"; code?: IssuedChangeCode }
  /// The live values no longer read as the proposer saw them: written as STALE, and nothing was applied.
  | { ok: false; kind: "STALE"; message: string }
  | ChangeFaults;

interface Decision {
  decision: Extract<ChangeDecision, "APPLY" | "DECLINE" | "WITHDRAW">;
  reason: string;
}

const DECISION_AUDIT_REASON: Record<Decision["decision"], string> = { APPLY: "Applied by a second person", DECLINE: "Declined by a second person", WITHDRAW: "Withdrawn by its proposer" };

/**
 * Decide a proposed change: apply it, decline it, or (the proposer's own) withdraw it. One transaction, under the locks, whatever the outcome. The password was
 * asked before it (`act` is the attribution of the decision, which is a signature: it names the change as the document signed).
 */
export async function decideChange(
  actor: StaffActor,
  act: ChangeAct,
  input: { changeId: string; decision: Decision["decision"]; reason: string; /// The office the decider holds the permission through (NFR-SIG-001); null for an administrator, who holds it through the flag.
    roleCode?: string | null },
  request: RequestFacts,
  now: Date = new Date(),
): Promise<DecideOutcome> {
  if (actor.system) return refuse([LOADER]);
  const reason = input.reason.trim();
  if (input.decision === "DECLINE" && !reason) return refuse([REASON_REQUIRED], [{ field: "reason", ...REASON_REQUIRED }]);

  return db.$transaction(async (tx): Promise<DecideOutcome> => {
    await lockOrganisation(tx, actor.organisationId);
    // The change's own row, then what it is about. The change is found within the actor's organisation: another's reads as gone.
    await tx.$queryRaw`SELECT id FROM "ConfigurationChange" WHERE id = ${input.changeId} AND "organisationId" = ${actor.organisationId} FOR UPDATE`;
    const row = await tx.configurationChange.findFirst({ where: { id: input.changeId, organisationId: actor.organisationId } });
    if (!row) return refuse([NO_SUCH_CHANGE]);
    // An editor's save is decided in `edit-store.ts` (Phase 5), which runs the editor: this path is for the kinds that have a rule of their own.
    if (isEditKind(row.kind)) return refuse([f("WRONG_PATH", "This change is decided as a change to configuration.")]);
    const rowKind = row.kind;
    const parsed = parseChange(rowKind, row.payload);
    if (!parsed.ok) return refuse([f("UNREADABLE", "This change no longer fits what a change of its kind carries, so it cannot be decided. Decline it, and propose it again.")]);
    const change = parsed.change;
    const target = await targetOf(tx, actor.organisationId, change);
    await lockTarget(tx, target);

    // Who may: the proposer withdraws their own and nobody else's; anyone else is a second person, holding the permission.
    if (input.decision === "WITHDRAW") {
      if (row.status !== "PROPOSED") return refuse([f("NOT_PROPOSED", "This change has already been decided or withdrawn.")]);
      if (row.proposedByPersonId !== actor.personId) return refuse([f("NOT_THE_PROPOSER", "Only the person who proposed a change withdraws it.")]);
    } else {
      const faults = decisionFaults({ kind: row.kind, status: row.status, proposedByPersonId: row.proposedByPersonId }, { personId: actor.personId, permissions: actor.permissions });
      if (change.kind === "ACCOUNT_CODE" && target.personId) faults.push(...accountCodeTargetFaults({ targetPersonId: target.personId, proposerPersonId: null, deciderPersonId: actor.personId }));
      if (faults.length > 0) return refuse(faults);
    }

    const names = await namesFor(tx, actor.organisationId, change, target);
    const live = await readLive(tx, actor.organisationId, change, target, now);
    const nowBefore = snapshot(change, live);
    const decidedBy = { decidedByPersonId: actor.personId, decidedAt: now };
    const trail = (status: ChangeStatus, why: string, decisionReason: string) =>
      writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "ConfigurationChange", entityId: row.id, entityLabel: KIND_WORDS[rowKind].en, reason: decisionReason ? `${why}: ${decisionReason}` : why, actor: auditActorOfStaff(actor) },
        "UPDATE",
        [
          { field: "Standing", before: STATUS_WORDS.PROPOSED.en, after: STATUS_WORDS[status].en },
          { field: "Decided by", before: null, after: actor.personName },
        ],
      );

    if (input.decision === "WITHDRAW" || input.decision === "DECLINE") {
      const status = nextStatus("PROPOSED", input.decision)!;
      await tx.configurationChange.update({ where: { id: row.id }, data: { status, ...decidedBy, decisionReason: reason } });
      await trail(status, DECISION_AUDIT_REASON[input.decision], reason);
      await act.write(tx, row.id, { document: { entity: "ConfigurationChange", id: row.id }, roleCode: input.roleCode ?? null });
      return { ok: true, status: status as "DECLINED" | "WITHDRAWN" };
    }

    // APPLY. What the proposer saw must still stand, or nothing is applied, and the change is STALE: that is a decision, so it is written and kept.
    if (isStale(row.before as Record<string, unknown>, nowBefore)) {
      const status = nextStatus("PROPOSED", "STALE")!;
      await tx.configurationChange.update({ where: { id: row.id }, data: { status, ...decidedBy, decisionReason: STALE_WORDS.en } });
      await trail(status, "Out of date when it was decided", STALE_WORDS.en);
      await act.write(tx, row.id, { document: { entity: "ConfigurationChange", id: row.id }, roleCode: input.roleCode ?? null });
      return { ok: false, kind: "STALE", message: STALE_WORDS.en };
    }
    // The rules of the kind, on the live state: a refusal leaves the change proposed, so it can still be declined, or the cause put right.
    const plan = planChange(change, live);
    if (!plan.ok) return refuse(plan.faults);

    const lines = describeChange(row.kind, change.payload, nowBefore, names).lines;
    const code = await applyChange(tx, actor, row.id, change, lines, row.reason, target, names, request, now);
    if (!code.ok) return code;
    const status = nextStatus("PROPOSED", "APPLY")!;
    await tx.configurationChange.update({ where: { id: row.id }, data: { status, ...decidedBy, decisionReason: reason } });
    await trail(status, DECISION_AUDIT_REASON.APPLY, reason);
    await act.write(tx, row.id, { document: { entity: "ConfigurationChange", id: row.id }, roleCode: input.roleCode ?? null });
    await code.afterDecision?.();
    return { ok: true, status: "APPLIED", ...(code.issued ? { code: code.issued } : {}) };
  });
}

// --------------------------------------------------------------------------------------------- applying, kind by kind

/// `afterDecision` is what must wait until the decision is attributed: ending the decider's own session, which the attribution of the decision is written in.
type Applied = { ok: true; issued?: IssuedChangeCode; afterDecision?: () => Promise<unknown> } | ChangeFaults;

/// Write the change to what it is about, with the trail of that row: the one place a change reaches the configuration it changes.
async function applyChange(
  tx: Tx,
  actor: StaffActor,
  changeId: string,
  change: ParsedChange,
  lines: ChangeLine[],
  proposerReason: string,
  target: Target,
  names: ChangeNames,
  request: RequestFacts,
  now: Date,
): Promise<Applied> {
  const audit = auditActorOfStaff(actor);
  const why = `Applied by a second person (change ${KIND_WORDS[change.kind].en.toLowerCase()}): ${proposerReason}`;
  switch (change.kind) {
    case "SECURITY_POLICY": {
      const row = await tx.securityPolicy.update({ where: { organisationId: actor.organisationId }, data: change.payload.changes, select: { id: true } });
      await writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "SecurityPolicy", entityId: row.id, entityLabel: "Sign-in settings", reason: why, actor: audit },
        "UPDATE",
        lines.map((l) => ({ field: l.label, before: l.before, after: l.after })),
      );
      return { ok: true };
    }
    case "PERMISSION_GRANT": {
      const { permissionKey, roleCode, decision } = change.payload;
      const where = { organisationId_permissionKey_roleCode: { organisationId: actor.organisationId, permissionKey, roleCode } };
      const existing = await tx.rolePermission.findUnique({ where, select: { id: true } });
      let entityId = existing?.id ?? changeId;
      if (decision === "UNDECIDED") {
        if (existing) await tx.rolePermission.delete({ where: { id: existing.id } });
      } else if (existing) {
        await tx.rolePermission.update({ where: { id: existing.id }, data: { decision } });
      } else {
        entityId = (await tx.rolePermission.create({ data: { organisationId: actor.organisationId, permissionKey, roleCode, decision }, select: { id: true } })).id;
      }
      await writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "RolePermission", entityId, entityLabel: `${PERMISSIONS[permissionKey].label.en} — ${names.roleName ?? "a role"}`, reason: why, actor: audit },
        existing ? (decision === "UNDECIDED" ? "DELETE" : "UPDATE") : "CREATE",
        lines.map((l) => ({ field: l.label, before: l.before, after: l.after })),
      );
      return { ok: true };
    }
    case "ADMINISTRATOR_GRANT":
    case "ADMINISTRATOR_REVOKE": {
      const makeAdministrator = change.kind === "ADMINISTRATOR_GRANT";
      await tx.staffAccount.update({ where: { id: target.accountId! }, data: { isAdministrator: makeAdministrator } });
      // A change to the administrator flag ends every session of the account (ADR 0034 D4): what the account may do is not what its sessions were opened with.
      // The decider's own session, where they take administration from themselves, ends after their decision is attributed (it is written in that session).
      const own = target.accountId === actor.accountId;
      const ended = await revokeAccountSessions(tx, target.accountId!, "ACCOUNT_CHANGED", now, own ? actor.sessionId : undefined);
      await writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "StaffAccount", entityId: target.accountId!, entityLabel: accountLabel(names.accountPerson ?? "a person"), reason: why, actor: audit },
        "UPDATE",
        [
          { field: "Administrator rights", before: makeAdministrator ? "Not an administrator" : "An administrator", after: makeAdministrator ? "An administrator" : "Not an administrator" },
          ...(ended > 0 || own ? [{ field: "Open sessions", before: String(ended + (own ? 1 : 0)), after: "0" }] : []),
        ],
      );
      return { ok: true, ...(own ? { afterDecision: () => revokeAccountSessions(tx, target.accountId!, "ACCOUNT_CHANGED", now) } : {}) };
    }
    case "ACCOUNT_CODE": {
      const policy = await loadSecurityPolicy(tx, actor.organisationId);
      const validity = policy?.resetCodeValidityMinutes;
      const unset = unsetSettings(policy, "ISSUE_CODE");
      if (unset.length > 0 || validity == null) return refuse([f("POLICY_NOT_SET", `A code cannot be issued until the organisation sets: ${settingLabels(unset).join("; ")}.`)]);
      const code = generateCode();
      const expiresAt = codeExpiry(now, validity);
      const voided = await tx.oneTimeCode.updateMany({ where: { store: "STAFF", staffAccountId: target.accountId!, usedAt: null }, data: { usedAt: now } });
      // The second person issues it and is the one shown it: the issuer of the code is the person who decided, never the proposer.
      await tx.oneTimeCode.create({
        data: {
          organisationId: actor.organisationId,
          store: "STAFF",
          staffAccountId: target.accountId!,
          purpose: change.payload.purpose,
          codeHash: hashCode(code),
          expiresAt,
          issuedByPersonId: actor.personId,
          reason: proposerReason,
          createdAt: now,
        },
      });
      // A reset of an office holder's account ends what is signed in as it now: the person whose password is reset is not the one using it.
      const ended = change.payload.purpose === "RESET" ? await revokeAccountSessions(tx, target.accountId!, "ADMINISTRATOR", now) : 0;
      await writeAudit(
        tx,
        { organisationId: actor.organisationId, entity: "StaffAccount", entityId: target.accountId!, entityLabel: accountLabel(names.accountPerson ?? "a person"), reason: `${proposerReason} (proposed by another person, issued by a second)`, actor: audit },
        "UPDATE",
        [
          {
            field: "One-time code",
            before: voided.count > 0 ? `${voided.count} open, voided` : null,
            after: `${change.payload.purpose === "ACTIVATION" ? "activation" : "reset"} code issued by a second person, valid until ${formatOrgDateTime(expiresAt, actor.organisationTimeZone)}`,
          },
          ...(ended > 0 ? [{ field: "Open sessions", before: String(ended), after: "0" }] : []),
        ],
      );
      await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: target.accountId!, kind: "CODE_ISSUED", request, at: now });
      return { ok: true, issued: { code: formatCode(code), expiresAt, personName: names.accountPerson ?? "the person", purpose: change.payload.purpose } };
    }
  }
}
