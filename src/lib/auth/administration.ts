import { randomBytes } from "node:crypto";

import { AccountStatus } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { lockOrganisation } from "@/lib/authority/locks";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";

import { auditActorOfStaff } from "./audit-actor";
import { createAccountFaults, disableFaults, enableFaults, issueCodeFaults, leaverFaults, officeHolderNotice, unlockFaults } from "./administration-rules";
import { codeExpiry, formatCode, generateCode, hashCode } from "./codes";
import { recordSignInEvent } from "./events";
import { hashPool } from "./hash-pool";
import { lockAccount, loginKeyOf } from "./identity";
import { holdingsOf } from "./administration-guard";
import { LOGIN_NAME } from "./bootstrap";
import { hashPassword } from "./password";
import { loadSecurityPolicy } from "./policy-store";
import { unsetSettings } from "./policy";
import type { RequestFacts } from "./request";
import { revokeAccountSessions } from "./session-store";
import type { AuditActor, Fault, SecurityPolicyKey, StaffActor } from "./types";

/**
 * Administering sign-in accounts (Phase 1b, ADR 0034 D2, D6): create an account for a person, disable it, put a disabled one back to waiting, unlock it, and
 * issue a one-time code. Each act is one transaction that writes the change, its audit row (with the administrator as actor) and its sign-in log row together,
 * under the organisation's lock and then the account's (the order bootstrap takes them in). No password, hash, token or code is ever written to the trail.
 *
 * Who may administer is `isAdministrator` until permissions arrive (Phase 2a). Nobody issues a code for, or disables, their own account. Activating or
 * resetting an office holder's account is meant to need a second person (Phase 2c): that check is not built, and `officeHolderNotice` says so on the screen
 * and the audit row records that the person holds an office, rather than the product implying an approval that did not happen.
 */

export type AdminOutcome<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; kind: "FAULTS"; faults: Fault[]; fields?: Partial<Record<string, Fault>> }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

const refuse = (faults: Fault[], fields?: Partial<Record<string, Fault>>): { ok: false; kind: "FAULTS"; faults: Fault[]; fields?: Partial<Record<string, Fault>> } => ({ ok: false, kind: "FAULTS", faults, ...(fields ? { fields } : {}) });

const accountLabel = (personName: string) => `Sign-in account of ${personName}`;

/// A password nobody knows, so that an account waiting to be activated cannot be signed in to: only the activation code sets a real one.
async function unusablePasswordHash(): Promise<string> {
  return hashPool.run(() => hashPassword(randomBytes(32).toString("base64url")));
}

export async function createAccount(actor: StaffActor, input: { personId: string; loginName: string }, request: RequestFacts, now: Date = new Date()): Promise<AdminOutcome<{ accountId: string }>> {
  const loginName = input.loginName.trim();
  const passwordHash = await unusablePasswordHash();
  return db.$transaction(async (tx): Promise<AdminOutcome<{ accountId: string }>> => {
    // One account is made at a time, so the sign-in name and the person's single account are judged against what is there.
    await lockOrganisation(tx, actor.organisationId);
    const person = input.personId
      ? await tx.person.findFirst({ where: { id: input.personId, organisationId: actor.organisationId }, select: { id: true, name: true, isActive: true, staffAccount: { select: { id: true } } } })
      : null;
    const taken = LOGIN_NAME.test(loginName) ? await tx.staffAccount.findUnique({ where: { loginKey: loginKeyOf(loginName) }, select: { id: true } }) : null;
    const faults = createAccountFaults({
      isAdministrator: actor.isAdministrator,
      loginNameValid: LOGIN_NAME.test(loginName),
      loginNameTaken: taken != null,
      person: person ? { isActive: person.isActive, hasAccount: person.staffAccount != null } : null,
    });
    const entries = Object.entries(faults) as [string, Fault][];
    if (entries.length > 0) return refuse(entries.map(([, f]) => f), faults);

    const account = await tx.staffAccount.create({
      data: { organisationId: actor.organisationId, personId: person!.id, loginName, loginKey: loginKeyOf(loginName), passwordHash, passwordChangedAt: now, isAdministrator: false, status: AccountStatus.PENDING_ACTIVATION },
      select: { id: true },
    });
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "StaffAccount",
        entityId: account.id,
        entityLabel: accountLabel(person!.name),
        reason: "A sign-in account made for the person; it waits for an activation code",
        actor: auditActorOfStaff(actor),
      },
      "CREATE",
      diffFields(null, { loginName, status: AccountStatus.PENDING_ACTIVATION, isAdministrator: false, person: person!.name }),
    );
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: account.id, kind: "ACCOUNT_CREATED", request, at: now });
    return { ok: true, accountId: account.id };
  });
}

export async function disableAccount(actor: StaffActor, input: { accountId: string; reason: string }, request: RequestFacts, now: Date = new Date()): Promise<AdminOutcome<{ sessionsEnded: number }>> {
  return db.$transaction(async (tx): Promise<AdminOutcome<{ sessionsEnded: number }>> => {
    await lockOrganisation(tx, actor.organisationId);
    await lockAccount(tx, input.accountId);
    const target = await tx.staffAccount.findFirst({ where: { id: input.accountId, organisationId: actor.organisationId }, include: { person: { select: { name: true } } } });
    const activeAdministrators = await tx.staffAccount.count({ where: { organisationId: actor.organisationId, isAdministrator: true, status: AccountStatus.ACTIVE } });
    const faults = disableFaults({ isAdministrator: actor.isAdministrator, actorAccountId: actor.accountId, target, activeAdministrators, reason: input.reason });
    if (faults.length > 0) return refuse(faults);

    const sessionsEnded = await disableTarget(tx, target!, { reason: input.reason.trim(), why: `Disabled by an administrator: ${input.reason.trim()}`, audit: auditActorOfStaff(actor), organisationId: actor.organisationId, request, now });
    return { ok: true, sessionsEnded };
  });
}

/**
 * Disable an account and end everything that signs in with it, in the caller's transaction: status, the reason, every open session, every open code. The
 * administrator's act and a person's leaving both do exactly this.
 */
async function disableTarget(
  tx: Tx,
  target: { id: string; status: AccountStatus; person: { name: string } },
  i: { reason: string; why: string; audit: AuditActor; organisationId: string; request: RequestFacts | null; now: Date },
): Promise<number> {
  await tx.staffAccount.update({ where: { id: target.id }, data: { status: AccountStatus.DISABLED, disabledAt: i.now, disabledReason: i.reason } });
  const sessionsEnded = await revokeAccountSessions(tx, target.id, "ACCOUNT_DISABLED", i.now);
  const voided = await tx.oneTimeCode.updateMany({ where: { store: "STAFF", staffAccountId: target.id, usedAt: null }, data: { usedAt: i.now } });
  await writeAudit(
    tx,
    { organisationId: i.organisationId, entity: "StaffAccount", entityId: target.id, entityLabel: accountLabel(target.person.name), reason: i.why, actor: i.audit },
    "UPDATE",
    [
      ...diffFields({ status: target.status }, { status: AccountStatus.DISABLED }),
      { field: "disabledReason", before: null, after: i.reason },
      ...(sessionsEnded > 0 ? [{ field: "openSessions", before: String(sessionsEnded), after: "0" }] : []),
      ...(voided.count > 0 ? [{ field: "openOneTimeCodes", before: String(voided.count), after: "0" }] : []),
    ],
  );
  await recordSignInEvent(tx, { organisationId: i.organisationId, staffAccountId: target.id, kind: "ACCOUNT_DISABLED", request: i.request, at: i.now });
  return sessionsEnded;
}

/// Refused: making this person inactive would disable a sign-in account the actor may not disable, or leave nobody to administer sign-in.
export class LeaverRefused extends Error {
  constructor(readonly fault: Fault) {
    super(fault.en);
    this.name = "LeaverRefused";
  }
}

/**
 * A person is made inactive (they left): their account is disabled and its sessions end in the same transaction as the change to the person, so that no
 * session outlives it by even a request (every request re-checks the person as well; this makes it a recorded fact). Nothing happens for a person with no account,
 * or whose account is already disabled. Throws `LeaverRefused` (so the person's own change rolls back with it) unless `by` is an administrator, where the account
 * is the actor's own, or where it is the only active administrator's: the rules of disabling the account directly (`leaverFaults`).
 */
export async function disableAccountOfLeaver(
  tx: Tx,
  input: { personId: string; organisationId: string; actor: AuditActor; by: { isAdministrator: boolean; accountId: string }; reason: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await lockOrganisation(tx, input.organisationId);
  const account = await tx.staffAccount.findFirst({ where: { personId: input.personId, organisationId: input.organisationId }, include: { person: { select: { name: true } } } });
  if (!account || account.status === AccountStatus.DISABLED) return;
  await lockAccount(tx, account.id);
  const activeAdministrators = account.isAdministrator && account.status === AccountStatus.ACTIVE ? await tx.staffAccount.count({ where: { organisationId: input.organisationId, isAdministrator: true, status: AccountStatus.ACTIVE } }) : 0;
  const faults = leaverFaults({ isAdministrator: input.by.isAdministrator, actorAccountId: input.by.accountId, account, activeAdministrators });
  if (faults.length > 0) throw new LeaverRefused(faults[0]);
  await disableTarget(tx, account, { reason: input.reason, why: `The person was made inactive, so the account is disabled: ${input.reason}`, audit: input.actor, organisationId: input.organisationId, request: null, now });
}

export async function enableAccount(actor: StaffActor, input: { accountId: string; reason: string }): Promise<AdminOutcome> {
  return db.$transaction(async (tx): Promise<AdminOutcome> => {
    await lockOrganisation(tx, actor.organisationId);
    await lockAccount(tx, input.accountId);
    const target = await tx.staffAccount.findFirst({ where: { id: input.accountId, organisationId: actor.organisationId }, include: { person: { select: { name: true, isActive: true } } } });
    const faults = enableFaults({ isAdministrator: actor.isAdministrator, target: target ? { status: target.status, personActive: target.person.isActive } : null, reason: input.reason });
    if (faults.length > 0) return refuse(faults);

    // Back to waiting for activation, never straight to active: the person sets a password of their own with a new code, so a password forgotten or known to others is not what comes back.
    await tx.staffAccount.update({
      where: { id: target!.id },
      data: { status: AccountStatus.PENDING_ACTIVATION, disabledAt: null, disabledReason: "", failedAttempts: 0, lockedUntil: null, mustChangePassword: false },
    });
    await writeAudit(
      tx,
      { organisationId: actor.organisationId, entity: "StaffAccount", entityId: target!.id, entityLabel: accountLabel(target!.person.name), reason: input.reason.trim(), actor: auditActorOfStaff(actor) },
      "UPDATE",
      [...diffFields({ status: target!.status }, { status: AccountStatus.PENDING_ACTIVATION }), { field: "disabledReason", before: target!.disabledReason || null, after: null }],
    );
    return { ok: true };
  });
}

export async function unlockAccount(actor: StaffActor, input: { accountId: string; reason: string }, request: RequestFacts, now: Date = new Date()): Promise<AdminOutcome> {
  return db.$transaction(async (tx): Promise<AdminOutcome> => {
    await lockAccount(tx, input.accountId);
    const target = await tx.staffAccount.findFirst({ where: { id: input.accountId, organisationId: actor.organisationId }, include: { person: { select: { name: true } } } });
    const faults = unlockFaults({ isAdministrator: actor.isAdministrator, target, reason: input.reason, now });
    if (faults.length > 0) return refuse(faults);

    await tx.staffAccount.update({ where: { id: target!.id }, data: { failedAttempts: 0, lockedUntil: null } });
    await writeAudit(
      tx,
      { organisationId: actor.organisationId, entity: "StaffAccount", entityId: target!.id, entityLabel: accountLabel(target!.person.name), reason: input.reason.trim(), actor: auditActorOfStaff(actor) },
      "UPDATE",
      [
        { field: "failedAttempts", before: String(target!.failedAttempts), after: "0" },
        ...(target!.lockedUntil ? [{ field: "lockedUntil", before: target!.lockedUntil.toISOString(), after: null }] : []),
      ],
    );
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: target!.id, kind: "UNLOCKED", request, at: now });
    return { ok: true };
  });
}

export interface IssuedCode {
  /// Grouped for reading out. Shown once and never stored: only its hash is.
  code: string;
  expiresAt: Date;
  /// What to say beside it where the person holds an office, a seat or a delegation; null otherwise.
  officeHolderNotice: string | null;
}

/**
 * Issue a one-time code (activation for an account waiting to be activated, reset for an active one). Every other code still open for the account is voided: one
 * live code at a time. The code is given back to the caller once; the database holds its hash and when it ends, and the trail holds that one was issued, by whom and why.
 */
export async function issueCode(
  actor: StaffActor,
  input: { accountId: string; purpose: "ACTIVATION" | "RESET"; reason: string },
  request: RequestFacts,
  now: Date = new Date(),
): Promise<AdminOutcome<{ issued: IssuedCode }>> {
  const policy = await loadSecurityPolicy(db, actor.organisationId);
  const unset = unsetSettings(policy, "ISSUE_CODE");
  if (unset.length > 0 || policy?.resetCodeValidityMinutes == null) return { ok: false, kind: "POLICY_NOT_SET", unset };
  const validity = policy.resetCodeValidityMinutes;

  const code = generateCode();
  return db.$transaction(async (tx): Promise<AdminOutcome<{ issued: IssuedCode }>> => {
    await lockAccount(tx, input.accountId);
    const target = await tx.staffAccount.findFirst({ where: { id: input.accountId, organisationId: actor.organisationId }, include: { person: { select: { name: true, isActive: true } } } });
    const faults = issueCodeFaults({
      isAdministrator: actor.isAdministrator,
      actorAccountId: actor.accountId,
      target: target ? { id: target.id, status: target.status, personActive: target.person.isActive } : null,
      purpose: input.purpose,
      reason: input.reason,
    });
    if (faults.length > 0) return refuse(faults);

    const holdings = await holdingsOf(tx, target!.personId, now);
    const notice = officeHolderNotice(holdings);
    const expiresAt = codeExpiry(now, validity);
    const voided = await tx.oneTimeCode.updateMany({ where: { store: "STAFF", staffAccountId: target!.id, usedAt: null }, data: { usedAt: now } });
    await tx.oneTimeCode.create({
      data: {
        organisationId: actor.organisationId,
        store: "STAFF",
        staffAccountId: target!.id,
        purpose: input.purpose,
        codeHash: hashCode(code),
        expiresAt,
        issuedByPersonId: actor.personId,
        reason: input.reason.trim(),
        createdAt: now,
      },
    });
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "StaffAccount",
        entityId: target!.id,
        entityLabel: accountLabel(target!.person.name),
        reason: `${input.reason.trim()}${notice ? " (the person holds an office, a seat or a delegation; the second-person check for this is not built yet)" : ""}`,
        actor: auditActorOfStaff(actor),
      },
      "UPDATE",
      [
        { field: "oneTimeCode", before: voided.count > 0 ? `${voided.count} open, voided` : null, after: `${input.purpose === "ACTIVATION" ? "activation" : "reset"} code issued, valid until ${formatOrgDateTime(expiresAt, actor.organisationTimeZone)}` },
      ],
    );
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: target!.id, kind: "CODE_ISSUED", request, at: now });
    return { ok: true, issued: { code: formatCode(code), expiresAt, officeHolderNotice: notice } };
  });
}
