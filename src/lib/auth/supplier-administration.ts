import { randomBytes } from "node:crypto";

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { formatOrgDateTime } from "@/lib/format";
import { hashPool } from "./hash-pool";

import { auditActorOfStaff } from "./audit-actor";
import { codeExpiry, formatCode, generateCode, hashCode } from "./codes";
import { recordSignInEvent } from "./events";
import { loginKeyOf } from "./identity";
import { hashPassword } from "./password";
import type { RequestFacts } from "./request";
import { openAccountFaults, issueSupplierCodeFaults, unlockSupplierFaults } from "./supplier-administration-rules";
import { lockSupplierAccount } from "./supplier-identity";
import { revokeSupplierAccountSessions } from "./supplier-session-store";
import type { Fault, StaffActor } from "./types";

/**
 * Administering a supplier's portal account (Phase 4a, ADR 0034 D2, D6): an officer opens it for a contact, issues the one-time code that activates it or resets its
 * password, unlocks it, and retiring the contact disables it. Each runs INSIDE a transaction the caller owns, with the supplier row already locked by the caller
 * (`inSupplier`, or `recordApplication` for a supplier it has just made): the supplier row first, then the account's own row, the order every supplier write takes.
 * Each writes the change, its audit row (with the officer as actor) and its sign-in log row together. No password, hash or code is ever written to the trail: the code
 * is handed back once to the caller, who shows it once; the database holds its hash and when it ends.
 *
 * Who may is `supplierAccounts.manage` (a permission grantable to roles only, undecided until the organisation decides). The officer must say how the caller's
 * identity was checked, and it is kept on the code (`OneTimeCode.identityCheck`) and in the trail.
 */

export interface IssuedSupplierCode {
  /// Grouped for reading out. Shown once and never stored: only its hash is.
  code: string;
  expiresAt: Date;
}

export type SupplierAdminOutcome<T extends object = object> = ({ ok: true } & T) | { ok: false; faults: Fault[]; fields?: Partial<Record<string, Fault>> };

const refuse = (faults: Fault[], fields?: Partial<Record<string, Fault>>): { ok: false; faults: Fault[]; fields?: Partial<Record<string, Fault>> } => ({ ok: false, faults, ...(fields ? { fields } : {}) });

export const permitted = (actor: StaffActor) => actor.permissions.has("supplierAccounts.manage");

/// How the account reads in the trail. Never the sign-in name (it is often an email, and the trail outlives the account): the row's id names the account, and the supplier's reference
/// leads the label so that the supplier's own History finds it.
const accountLabel = () => "Portal account";

/// A password nobody knows, so that an account waiting to be activated cannot be signed in to: only the activation code sets a real one. Made before the transaction (a hash is slow).
export async function unusableSupplierPasswordHash(): Promise<string> {
  return hashPool.run(() => hashPassword(randomBytes(32).toString("base64url")));
}

/// Thrown, after the transaction is spoilt, when another act took the sign-in name between the check and the write. The caller turns it into the refusal "that sign-in name is already used" and rolls everything back.
export class LoginNameTaken extends Error {
  constructor() {
    super("That sign-in name is already used.");
    this.name = "LoginNameTaken";
  }
}

export interface OpenAccountInput {
  actor: StaffActor;
  supplier: { id: string; reference: string };
  contactId: string;
  loginName: string;
  identityCheck: string;
  /// Why, in the officer's words (for the trail). Defaults are the caller's.
  reason: string;
  /// `SecurityPolicy.resetCodeValidityMinutes`, known set: the caller refuses before it gets here when it is not.
  validityMinutes: number;
  passwordHash: string;
  request: RequestFacts;
  now: Date;
}

/**
 * Open the portal account of a contact, waiting for its activation code, and issue that code. The contact must be on this supplier, live, and without an account; the sign-in
 * name must be well formed and free. Throws a database error on a sign-in name made taken by a race: the caller turns it into the same words as `LOGIN_NAME_TAKEN`.
 */
export async function openSupplierAccount(tx: Tx, input: OpenAccountInput): Promise<SupplierAdminOutcome<{ accountId: string; issued: IssuedSupplierCode }>> {
  const { actor, supplier, request, now } = input;
  const loginName = input.loginName.trim();
  const contact = await tx.supplierContact.findFirst({ where: { id: input.contactId, supplierId: supplier.id, organisationId: actor.organisationId }, select: { id: true, name: true, retiredOn: true, account: { select: { id: true } } } });
  const taken = await tx.supplierAccount.findUnique({ where: { loginKey: loginKeyOf(loginName) }, select: { id: true } });
  const fields = openAccountFaults({
    permitted: permitted(actor),
    loginName,
    loginNameTaken: taken != null,
    identityCheck: input.identityCheck,
    contact: contact ? { retired: contact.retiredOn != null, hasAccount: contact.account != null } : null,
  });
  const entries = Object.values(fields) as Fault[];
  if (entries.length > 0) return refuse(entries, fields);

  let account: { id: string };
  try {
    account = await tx.supplierAccount.create({
      data: { organisationId: actor.organisationId, contactId: contact!.id, supplierId: supplier.id, loginName, loginKey: loginKeyOf(loginName), passwordHash: input.passwordHash, passwordChangedAt: now, status: "PENDING_ACTIVATION" },
      select: { id: true },
    });
  } catch (e) {
    // The unique index on the sign-in key is the backstop for two acts that each found the name free. The transaction is spoilt either way, so the caller rolls it back.
    if ((e as { code?: string })?.code === "P2002") throw new LoginNameTaken();
    throw e;
  }
  const code = generateCode();
  const expiresAt = codeExpiry(now, input.validityMinutes);
  await tx.oneTimeCode.create({
    data: {
      organisationId: actor.organisationId,
      store: "SUPPLIER",
      supplierAccountId: account.id,
      purpose: "ACTIVATION",
      codeHash: hashCode(code),
      expiresAt,
      issuedByPersonId: actor.personId,
      reason: input.reason.trim(),
      identityCheck: input.identityCheck.trim(),
      createdAt: now,
    },
  });
  const actorForTrail = auditActorOfStaff(actor);
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "SupplierAccount", entityId: account.id, entityLabel: `${supplier.reference} · ${accountLabel()}`, reason: input.reason.trim(), actor: actorForTrail },
    "CREATE",
    diffFields(null, { status: "PENDING_ACTIVATION" }),
  );
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "SupplierAccount", entityId: account.id, entityLabel: `${supplier.reference} · ${accountLabel()}`, reason: input.reason.trim(), actor: actorForTrail },
    "UPDATE",
    [
      { field: "oneTimeCode", before: null, after: `activation code issued, valid until ${formatOrgDateTime(expiresAt, actor.organisationTimeZone)}` },
      { field: "identityChecked", before: null, after: input.identityCheck.trim() },
    ],
  );
  await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: account.id, kind: "ACCOUNT_CREATED", request, at: now });
  await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: account.id, kind: "CODE_ISSUED", request, at: now });
  return { ok: true, accountId: account.id, issued: { code: formatCode(code), expiresAt } };
}

export interface IssueCodeInput {
  actor: StaffActor;
  supplier: { id: string; reference: string };
  accountId: string;
  purpose: "ACTIVATION" | "RESET";
  identityCheck: string;
  reason: string;
  validityMinutes: number;
  request: RequestFacts;
  now: Date;
}

/**
 * Issue a one-time code for an existing account: activation for one waiting for it, reset for an active one. Every other code still open for the account is voided
 * (one live code at a time). A reset ends the account's sessions when the code is ISSUED, not only when it is used, because a reset is ordered when the account may be in
 * someone else's hands (ADR 0034 D6).
 */
export async function issueSupplierCode(tx: Tx, input: IssueCodeInput): Promise<SupplierAdminOutcome<{ issued: IssuedSupplierCode; sessionsEnded: number }>> {
  const { actor, supplier, request, now } = input;
  await lockSupplierAccount(tx, input.accountId);
  const target = await tx.supplierAccount.findFirst({ where: { id: input.accountId, supplierId: supplier.id, organisationId: actor.organisationId }, include: { contact: { select: { retiredOn: true } } } });
  const faults = issueSupplierCodeFaults({
    permitted: permitted(actor),
    target: target ? { status: target.status, contactRetired: target.contact.retiredOn != null } : null,
    purpose: input.purpose,
    identityCheck: input.identityCheck,
  });
  if (faults.length > 0) return refuse(faults);

  const code = generateCode();
  const expiresAt = codeExpiry(now, input.validityMinutes);
  const voided = await tx.oneTimeCode.updateMany({ where: { store: "SUPPLIER", supplierAccountId: target!.id, usedAt: null }, data: { usedAt: now } });
  await tx.oneTimeCode.create({
    data: {
      organisationId: actor.organisationId,
      store: "SUPPLIER",
      supplierAccountId: target!.id,
      purpose: input.purpose,
      codeHash: hashCode(code),
      expiresAt,
      issuedByPersonId: actor.personId,
      reason: input.reason.trim(),
      identityCheck: input.identityCheck.trim(),
      createdAt: now,
    },
  });
  const sessionsEnded = input.purpose === "RESET" ? await revokeSupplierAccountSessions(tx, target!.id, "ADMINISTRATOR", now) : 0;
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "SupplierAccount", entityId: target!.id, entityLabel: `${supplier.reference} · ${accountLabel()}`, reason: input.reason.trim(), actor: auditActorOfStaff(actor) },
    "UPDATE",
    [
      { field: "oneTimeCode", before: voided.count > 0 ? `${voided.count} open, voided` : null, after: `${input.purpose === "ACTIVATION" ? "activation" : "reset"} code issued, valid until ${formatOrgDateTime(expiresAt, actor.organisationTimeZone)}` },
      { field: "identityChecked", before: null, after: input.identityCheck.trim() },
      ...(sessionsEnded > 0 ? [{ field: "signedInSessions", before: String(sessionsEnded), after: "0" }] : []),
    ],
  );
  await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: target!.id, kind: "CODE_ISSUED", request, at: now });
  return { ok: true, issued: { code: formatCode(code), expiresAt }, sessionsEnded };
}

export interface UnlockInput {
  actor: StaffActor;
  supplier: { id: string; reference: string };
  accountId: string;
  identityCheck: string;
  request: RequestFacts;
  now: Date;
}

/// Unlock a supplier's account: the lock a rival can put on it by guessing at its password near a closing time is time-limited, and an officer can lift it sooner.
export async function unlockSupplierAccount(tx: Tx, input: UnlockInput): Promise<SupplierAdminOutcome> {
  const { actor, supplier, request, now } = input;
  await lockSupplierAccount(tx, input.accountId);
  const target = await tx.supplierAccount.findFirst({ where: { id: input.accountId, supplierId: supplier.id, organisationId: actor.organisationId }, select: { id: true, loginName: true, failedAttempts: true, lockedUntil: true } });
  const faults = unlockSupplierFaults({ permitted: permitted(actor), target, identityCheck: input.identityCheck, now });
  if (faults.length > 0) return refuse(faults);
  await tx.supplierAccount.update({ where: { id: target!.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "SupplierAccount", entityId: target!.id, entityLabel: `${supplier.reference} · ${accountLabel()}`, reason: "Unlocked by an officer", actor: auditActorOfStaff(actor) },
    "UPDATE",
    [
      { field: "failedAttempts", before: String(target!.failedAttempts), after: "0" },
      ...(target!.lockedUntil ? [{ field: "lockedUntil", before: target!.lockedUntil.toISOString(), after: null }] : []),
      { field: "identityChecked", before: null, after: input.identityCheck.trim() },
    ],
  );
  await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: target!.id, kind: "UNLOCKED", request, at: now });
  return { ok: true };
}

/**
 * Retiring a contact disables the contact's portal account, ends its sessions and voids its open codes, in the same transaction (ADR 0034 D2). Called by the writer
 * that sets `retiredOn`, under the supplier's lock. Does nothing for a contact with no account. Gives back how many sessions it ended.
 */
export async function disableAccountOfRetiredContact(tx: Tx, input: { actor: StaffActor; supplier: { id: string; reference: string }; contactId: string; reason: string; request: RequestFacts; now: Date }): Promise<number> {
  const { actor, supplier, now } = input;
  const account = await tx.supplierAccount.findFirst({ where: { contactId: input.contactId, supplierId: supplier.id, organisationId: actor.organisationId }, select: { id: true, loginName: true, status: true } });
  if (!account) return 0;
  await lockSupplierAccount(tx, account.id);
  if (account.status === "DISABLED") return 0;
  await tx.supplierAccount.update({ where: { id: account.id }, data: { status: "DISABLED", disabledAt: now, disabledReason: input.reason.trim() } });
  const ended = await revokeSupplierAccountSessions(tx, account.id, "ACCOUNT_DISABLED", now);
  const voided = await tx.oneTimeCode.updateMany({ where: { store: "SUPPLIER", supplierAccountId: account.id, usedAt: null }, data: { usedAt: now } });
  await writeAudit(
    tx,
    { organisationId: actor.organisationId, entity: "SupplierAccount", entityId: account.id, entityLabel: `${supplier.reference} · ${accountLabel()}`, reason: input.reason.trim(), actor: auditActorOfStaff(actor) },
    "UPDATE",
    [
      { field: "status", before: account.status, after: "DISABLED" },
      ...(ended > 0 ? [{ field: "signedInSessions", before: String(ended), after: "0" }] : []),
      ...(voided.count > 0 ? [{ field: "otherOpenOneTimeCodes", before: String(voided.count), after: "0" }] : []),
    ],
  );
  await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: account.id, kind: "ACCOUNT_DISABLED", request: input.request, at: now });
  return ended;
}
