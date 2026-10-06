import { diffFields } from "@/lib/audit/diff";
import { AccountStatus } from "@/generated/prisma/client";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { lockOrganisation } from "@/lib/authority/locks";
import { db } from "@/lib/db";

import { hashPassword, passwordFaults } from "./password";
import { loadSecurityPolicy } from "./policy-store";
import { fillUnset, policyFault, settingLabels, unsetSettings } from "./policy";
import { recordSignInEvent } from "./events";
import { revokeAccountSessions } from "./session-store";
import type { AuditActor, SecurityPolicyKey, SecurityPolicyValues } from "./types";

/**
 * The first administrator (ADR 0034 D18, Phase 1a). The logic of `npm run auth:bootstrap`, apart from its prompts, so that it is exercised
 * against a test database. Run by an operator with server access, which already holds the database: that is why it may do what no screen can.
 *
 * It ships no default: not a name, not a password, not a policy value. It refuses a Person who holds an office, because administration is kept
 * apart from every transactional capability (NFR-SEC-004). It refuses to run again once an administrator exists, unless the operator says
 * `--additional` (a second administrator, which maker-checker needs) or `--recover` (the only administrator is locked out), and the flag goes into the
 * audit label. Every write is audited with a SYSTEM actor, in the transaction that makes it.
 */

export type BootstrapMode = "FIRST" | "ADDITIONAL" | "RECOVER";

export type BootstrapPerson = { existingPersonId: string } | { name: string; jobTitle?: string | null; email?: string | null };

export interface BootstrapInput {
  organisationCode: string;
  mode: BootstrapMode;
  loginName: string;
  password: string;
  /// FIRST and ADDITIONAL: who the account is for. Ignored for RECOVER, which names the account by its sign-in name.
  person?: BootstrapPerson;
  /// Values for settings that are still unset. A setting already set is never changed here.
  policy?: Partial<SecurityPolicyValues>;
}

export type BootstrapResult =
  | { ok: true; mode: BootstrapMode; accountId: string; personId: string; policyFilled: SecurityPolicyKey[]; policyStillUnset: SecurityPolicyKey[] }
  | { ok: false; code: string; message: string; unset?: SecurityPolicyKey[] };

const fail = (code: string, message: string, unset?: SecurityPolicyKey[]): BootstrapResult => ({ ok: false, code, message, ...(unset ? { unset } : {}) });

/// The audit label says which way the command was run.
export const bootstrapLabel = (mode: BootstrapMode) => (mode === "FIRST" ? "bootstrap command" : mode === "ADDITIONAL" ? "bootstrap command (--additional)" : "bootstrap command (--recover)");

/// Letters, digits and . _ - @ only, so that a sign-in name is one word that can be read out and typed.
const LOGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._@-]{2,63}$/;

export interface Holdings {
  offices: number;
  seats: number;
  delegations: number;
}

/// Why a Person may not be made an administrator, or null. Pure. (Phase 2a's `administrationConflict` generalises this.)
export function holdingsFault(h: Holdings): string | null {
  const parts = [
    h.offices > 0 && `${h.offices} ${h.offices === 1 ? "office" : "offices"}`,
    h.seats > 0 && `${h.seats} committee ${h.seats === 1 ? "seat" : "seats"}`,
    h.delegations > 0 && `${h.delegations} ${h.delegations === 1 ? "delegation" : "delegations"}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `This person holds ${parts.join(", ")}. An administrator holds no office, seat or delegation, so that administration stays apart from transactions. Give the administrator a person of their own.`;
}

/// What a person holds that has not ended. A period whose end is today or earlier has ended.
async function holdingsOf(tx: Tx, personId: string, now: Date): Promise<Holdings> {
  const live = { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
  const [offices, seats, delegations] = await Promise.all([
    tx.roleAssignment.count({ where: { personId, ...live } }),
    tx.committeeMember.count({ where: { personId, ...live } }),
    // AND, because both halves are an OR and one would overwrite the other as keys of one object.
    tx.delegation.count({ where: { AND: [{ OR: [{ fromPersonId: personId }, { toPersonId: personId }] }, live] } }),
  ]);
  return { offices, seats, delegations };
}

function systemActor(mode: BootstrapMode): AuditActor {
  return { kind: "SYSTEM", label: bootstrapLabel(mode) };
}

export async function bootstrapAdministrator(input: BootstrapInput, now: Date = new Date()): Promise<BootstrapResult> {
  const organisation = await db.organisation.findUnique({ where: { code: input.organisationCode }, select: { id: true, name: true } });
  if (!organisation) return fail("NO_ORGANISATION", `There is no organisation with the code "${input.organisationCode}". Run npm run setup first: the organisation must already exist.`);

  const loginName = input.loginName.trim();
  if (input.mode !== "RECOVER" && !LOGIN_NAME.test(loginName)) {
    return fail("BAD_LOGIN_NAME", "The sign-in name is 3 to 64 characters: letters, digits and . _ - @, starting with a letter or digit.");
  }

  const run = async (tx: Tx): Promise<BootstrapResult> => {
    // One bootstrap at a time, and the check for an existing administrator is made under the lock, so two operators cannot each be "first".
    await lockOrganisation(tx, organisation.id);
    const administrators = await tx.staffAccount.count({ where: { organisationId: organisation.id, isAdministrator: true, status: AccountStatus.ACTIVE } });
    if (input.mode === "FIRST" && administrators > 0) {
      return fail("ADMINISTRATOR_EXISTS", "An administrator already exists. To add a second one run this command with --additional. If the only administrator is locked out, run it with --recover.");
    }
    if (input.mode !== "FIRST" && administrators === 0) {
      return fail("NO_ADMINISTRATOR", `There is no administrator yet, so ${input.mode === "ADDITIONAL" ? "--additional" : "--recover"} has nothing to add to or recover. Run the command without a flag.`);
    }

    // The settings: fill what is unset from what the operator typed, then check what sign-in and a password need is set.
    const existing = await loadSecurityPolicy(tx, organisation.id);
    const { values, filled } = fillUnset(existing, input.policy ?? {});
    const fault = policyFault(values);
    if (fault) return fail("POLICY_FAULT", fault);
    const unset = unsetSettings(values, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE");
    if (unset.length > 0) {
      return fail("POLICY_NOT_SET", `These settings are the organisation's own to choose and are not set: ${settingLabels(unset).join("; ")}.`, unset);
    }
    const actor = systemActor(input.mode);
    if (filled.length > 0) {
      const data = Object.fromEntries(filled.map((k) => [k, values[k]]));
      await tx.securityPolicy.upsert({ where: { organisationId: organisation.id }, create: { organisationId: organisation.id, ...data }, update: data });
      await writeAudit(
        tx,
        { organisationId: organisation.id, entity: "SecurityPolicy", entityId: organisation.id, entityLabel: `Security settings of ${organisation.name}`, reason: "Set by the bootstrap command because they were unset", actor },
        existing ? "UPDATE" : "CREATE",
        existing ? diffFields(Object.fromEntries(filled.map((k) => [k, existing[k]])), data) : diffFields(null, data),
      );
    }
    const minLength = values.passwordMinLength as number;

    if (input.mode === "RECOVER") {
      const account = await tx.staffAccount.findUnique({ where: { loginKey: loginName.toLowerCase() }, include: { person: { select: { name: true } } } });
      if (!account || account.organisationId !== organisation.id || !account.isAdministrator) return fail("NOT_AN_ADMINISTRATOR", "There is no administrator account with that sign-in name in this organisation.");
      const faults = passwordFaults(input.password, { loginName: account.loginName, minLength });
      if (faults.length > 0) return fail("BAD_PASSWORD", faults[0].en);
      const passwordHash = await hashPassword(input.password);
      await tx.staffAccount.update({ where: { id: account.id }, data: { passwordHash, passwordChangedAt: now, mustChangePassword: false, status: AccountStatus.ACTIVE, disabledAt: null, disabledReason: "", failedAttempts: 0, lockedUntil: null, resetNoticePending: true } });
      await revokeAccountSessions(tx, account.id, "ACCOUNT_CHANGED", now);
      await writeAudit(
        tx,
        { organisationId: organisation.id, entity: "StaffAccount", entityId: account.id, entityLabel: `Sign-in account of ${account.person.name}`, reason: "Recovered with the bootstrap command (--recover): new password, lock cleared, every session ended", actor },
        "UPDATE",
        [
          { field: "passwordChangedAt", before: account.passwordChangedAt.toISOString(), after: now.toISOString() },
          ...diffFields({ status: account.status, failedAttempts: account.failedAttempts, resetNoticePending: account.resetNoticePending }, { status: AccountStatus.ACTIVE, failedAttempts: 0, resetNoticePending: true }),
          ...(account.lockedUntil ? [{ field: "lockedUntil", before: account.lockedUntil.toISOString(), after: null }] : []),
        ],
      );
      await recordSignInEvent(tx, { organisationId: organisation.id, staffAccountId: account.id, kind: "PASSWORD_CHANGED", at: now });
      if (account.lockedUntil) await recordSignInEvent(tx, { organisationId: organisation.id, staffAccountId: account.id, kind: "UNLOCKED", at: now });
      return { ok: true, mode: input.mode, accountId: account.id, personId: account.personId, policyFilled: filled, policyStillUnset: unsetSettings(values, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE") };
    }

    if (!input.person) return fail("NO_PERSON", "Say who the administrator is: an existing person, or the details of a new one.");
    if ((await tx.staffAccount.findUnique({ where: { loginKey: loginName.toLowerCase() }, select: { id: true } }))) return fail("LOGIN_NAME_TAKEN", "That sign-in name is already used.");
    const faults = passwordFaults(input.password, { loginName, minLength });
    if (faults.length > 0) return fail("BAD_PASSWORD", faults[0].en);

    let personId: string;
    let personName: string;
    if ("existingPersonId" in input.person) {
      const person = await tx.person.findFirst({ where: { id: input.person.existingPersonId, organisationId: organisation.id }, select: { id: true, name: true, isActive: true, staffAccount: { select: { id: true } } } });
      if (!person) return fail("NO_PERSON", "There is no such person in this organisation.");
      if (!person.isActive) return fail("PERSON_INACTIVE", "That person is no longer active.");
      if (person.staffAccount) return fail("PERSON_HAS_ACCOUNT", "That person already has a sign-in account. A person has at most one, and it is never changed to another person.");
      const holdings = holdingsFault(await holdingsOf(tx, person.id, now));
      if (holdings) return fail("PERSON_HOLDS_OFFICE", holdings);
      personId = person.id;
      personName = person.name;
    } else {
      const name = input.person.name.trim();
      if (!name) return fail("NO_PERSON", "A new person needs a name.");
      const created = await tx.person.create({ data: { organisationId: organisation.id, name, jobTitle: input.person.jobTitle?.trim() || null, email: input.person.email?.trim() || null }, select: { id: true } });
      await writeAudit(tx, { organisationId: organisation.id, entity: "Person", entityId: created.id, entityLabel: name, reason: "Created by the bootstrap command as the administrator's own person", actor }, "CREATE", diffFields(null, { name, jobTitle: input.person.jobTitle?.trim() || null, email: input.person.email?.trim() || null }));
      personId = created.id;
      personName = name;
    }

    const passwordHash = await hashPassword(input.password);
    const account = await tx.staffAccount.create({
      data: { organisationId: organisation.id, personId, loginName, loginKey: loginName.toLowerCase(), passwordHash, passwordChangedAt: now, isAdministrator: true, status: AccountStatus.ACTIVE },
      select: { id: true },
    });
    await writeAudit(
      tx,
      { organisationId: organisation.id, entity: "StaffAccount", entityId: account.id, entityLabel: `Sign-in account of ${personName}`, reason: input.mode === "FIRST" ? "The first administrator, created by the bootstrap command" : "A further administrator, created by the bootstrap command (--additional)", actor },
      "CREATE",
      diffFields(null, { loginName, isAdministrator: true, status: AccountStatus.ACTIVE, person: personName }),
    );
    await recordSignInEvent(tx, { organisationId: organisation.id, staffAccountId: account.id, kind: "ACCOUNT_CREATED", at: now });
    return { ok: true, mode: input.mode, accountId: account.id, personId, policyFilled: filled, policyStillUnset: [] };
  };

  // A refusal rolls everything back, the settings written on the way included: nothing is left half done.
  try {
    return await db.$transaction(
      async (tx) => {
        const result = await run(tx);
        if (!result.ok) throw new Refused(result);
        return result;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

class Refused extends Error {
  constructor(readonly result: BootstrapResult) {
    super("refused");
  }
}
