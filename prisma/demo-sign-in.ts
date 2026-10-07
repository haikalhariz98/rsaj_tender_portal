/**
 * Where the demonstration meets sign-in (Phase 1b review): what marks a database as holding the demo, and what stops the demo's wipe.
 *
 * - The marker. Everything the demo loader makes has an id prefixed `demo_`. `demo:accounts` makes sign-in accounts only on a database that holds the demo, and
 *   only for the demo's own people, so the one password in `.env.example` never opens a real person's account.
 * - The wipe's refusal. A demo person with a sign-in account, a code they issued, or an audit entry they made on something that is not demo data cannot be
 *   removed: the sign-in log and the audit trail are permanent and no wipe deletes them, and each of those rows points at the person. The wipe refuses, whatever
 *   its flags, and says what, before it has removed anything (a partial wipe is the worse outcome).
 */
import type { PrismaClient } from "../src/generated/prisma/client";

export const DEMO_PREFIX = "demo_";

type Db = Pick<PrismaClient, "orgUnit" | "staffAccount" | "auditEntry" | "oneTimeCode" | "person">;

/// Whether the demo has been loaded: any organisation unit it made.
export async function demoIsLoaded(db: Pick<PrismaClient, "orgUnit">): Promise<boolean> {
  return (await db.orgUnit.count({ where: { id: { startsWith: DEMO_PREFIX } } })) > 0;
}

/// What stands on the demo's people and so blocks removing them, as lines for the operator (empty when nothing does).
export async function demoSignInDependents(db: Db, organisationId: string): Promise<string[]> {
  const demo = { startsWith: DEMO_PREFIX };
  const accounts = await db.staffAccount.findMany({ where: { organisationId, personId: demo }, select: { loginName: true, person: { select: { name: true } } }, orderBy: { loginName: "asc" } });
  // What a demo person made on something that is not demo data (what they made on demo records goes with those records, as the wipe has always done).
  const audited = await db.auditEntry.groupBy({ by: ["actorPersonId"], where: { organisationId, actorPersonId: demo, NOT: { entityId: demo } }, _count: { _all: true } });
  const issued = await db.oneTimeCode.groupBy({ by: ["issuedByPersonId"], where: { organisationId, issuedByPersonId: demo }, _count: { _all: true } });
  const ids = [...new Set([...audited.map((a) => a.actorPersonId), ...issued.map((c) => c.issuedByPersonId)].filter((x): x is string => x != null))];
  const names = new Map((await db.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const name = (id: string | null) => (id ? (names.get(id) ?? id) : "someone");
  return [
    ...accounts.map((a) => `  sign-in account "${a.loginName}" of ${a.person.name}, a demo person`),
    ...audited.map((a) => `  ${a._count._all} audit entr${a._count._all === 1 ? "y" : "ies"} on records that are not demo data, made by ${name(a.actorPersonId)}, a demo person`),
    ...issued.map((c) => `  ${c._count._all} one-time code${c._count._all === 1 ? "" : "s"} issued by ${name(c.issuedByPersonId)}, a demo person`),
  ];
}

/// What the wipe says when `demoSignInDependents` found anything.
export function demoSignInRefusal(lines: readonly string[]): string {
  return [
    "Refused whatever the flag: these stand on demo people, and the sign-in log and the audit trail are permanent. No wipe deletes them, and each points at the person it names:",
    ...lines,
    "Nothing was removed. Once a demo person has a sign-in account, or has made a change while signed in, the demonstration is not wiped: npm run demo:results adds to a loaded database, and a full reload starts from a new database.",
  ].join("\n");
}
