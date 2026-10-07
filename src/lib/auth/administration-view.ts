import type { AccountStatus, CodePurpose } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { holdingHistoryFor } from "./administration-guard";
import { unsetSettings } from "./policy";
import { loadSecurityPolicy } from "./policy-store";
import type { SecurityPolicyKey, StaffActor } from "./types";

/**
 * What the accounts screen shows (Phase 1b): every sign-in account of the organisation with where it stands, the people who have none yet, and which
 * setting stops a code being issued. Read-only; the acts are in `administration.ts`.
 */

export interface AccountRow {
  id: string;
  personId: string;
  personName: string;
  jobTitle: string | null;
  personActive: boolean;
  loginName: string;
  status: AccountStatus;
  isAdministrator: boolean;
  isYou: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastSignInAt: Date | null;
  disabledReason: string;
  /// What the person holds that has not ended; all zero for a person who holds nothing.
  holdings: { offices: number; seats: number; delegations: number };
  /// What the person has ever held, ended or not: what decides whether a code for the account needs a second person.
  held: { offices: number; seats: number; delegations: number };
  /// A code issued and neither used nor expired: when it ends. Null where there is none.
  openCode: { purpose: CodePurpose; expiresAt: Date } | null;
}

export interface AccountsView {
  rows: AccountRow[];
  /// Active people with no account yet, for the "create an account" form.
  people: { id: string; name: string; jobTitle: string | null }[];
  /// The settings that stop a code being issued (empty where it can be).
  codeSettingsUnset: SecurityPolicyKey[];
  activeAdministrators: number;
}

export async function loadAccountsView(actor: StaffActor, now: Date = new Date()): Promise<AccountsView> {
  const organisationId = actor.organisationId;
  const live = { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
  const [accounts, people, policy] = await Promise.all([
    db.staffAccount.findMany({
      where: { organisationId },
      orderBy: [{ isAdministrator: "desc" }, { loginKey: "asc" }],
      include: { person: { select: { name: true, jobTitle: true, isActive: true } }, codes: { where: { usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 1, select: { purpose: true, expiresAt: true } } },
    }),
    db.person.findMany({ where: { organisationId, isActive: true, staffAccount: null }, orderBy: { name: "asc" }, select: { id: true, name: true, jobTitle: true } }),
    loadSecurityPolicy(db, organisationId),
  ]);
  const personIds = accounts.map((a) => a.personId);
  const [offices, seats, delegations, history] = await Promise.all([
    db.roleAssignment.groupBy({ by: ["personId"], where: { personId: { in: personIds }, ...live }, _count: { _all: true } }),
    db.committeeMember.groupBy({ by: ["personId"], where: { personId: { in: personIds }, ...live }, _count: { _all: true } }),
    // A delegation names two people; each is held by both.
    db.delegation.findMany({ where: { AND: [{ OR: [{ fromPersonId: { in: personIds } }, { toPersonId: { in: personIds } }] }, live] }, select: { fromPersonId: true, toPersonId: true } }),
    holdingHistoryFor(db, personIds),
  ]);
  const count = (rows: { personId: string | null; _count: { _all: number } }[]) => new Map(rows.flatMap((r) => (r.personId ? [[r.personId, r._count._all] as const] : [])));
  const officeBy = count(offices);
  const seatBy = count(seats);
  const delegationBy = new Map<string, number>();
  for (const d of delegations) for (const p of [d.fromPersonId, d.toPersonId]) delegationBy.set(p, (delegationBy.get(p) ?? 0) + 1);

  const rows: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    personId: a.personId,
    personName: a.person.name,
    jobTitle: a.person.jobTitle,
    personActive: a.person.isActive,
    loginName: a.loginName,
    status: a.status,
    isAdministrator: a.isAdministrator,
    isYou: a.id === actor.accountId,
    failedAttempts: a.failedAttempts,
    lockedUntil: a.lockedUntil,
    lastSignInAt: a.lastSignInAt,
    disabledReason: a.disabledReason,
    holdings: { offices: officeBy.get(a.personId) ?? 0, seats: seatBy.get(a.personId) ?? 0, delegations: delegationBy.get(a.personId) ?? 0 },
    held: history.get(a.personId) ?? { offices: 0, seats: 0, delegations: 0 },
    openCode: a.codes[0] ? { purpose: a.codes[0].purpose, expiresAt: a.codes[0].expiresAt } : null,
  }));
  return {
    rows,
    people,
    codeSettingsUnset: unsetSettings(policy, "ISSUE_CODE"),
    activeAdministrators: rows.filter((r) => r.isAdministrator && r.status === "ACTIVE").length,
  };
}
