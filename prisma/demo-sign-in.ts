/**
 * Where the demonstration meets sign-in (Phase 1b review): what marks a database as holding the demo, and what stops the demo's wipe.
 *
 * - The marker. Everything the demo loader makes has an id prefixed `demo_`. `demo:accounts` makes sign-in accounts only on a database that holds the demo, and
 *   only for the demo's own people, so the one password in `.env.example` never opens a real person's account.
 * - Since Phase 1d the wipe itself is retired (`DEMO_WIPE_RETIRED`), and `demoSignInDependents` / `demoSignInRefusal` below have no caller. They are
 *   kept, with their database test, as the record of what blocked it; the trail and the sign-in log now refuse a delete on their own (triggers).
 * - The wipe's refusal (before Phase 1d). A demo person with a sign-in account, a code they issued, or an audit entry they made on something that is not demo data cannot be
 *   removed: the sign-in log and the audit trail are permanent and no wipe deletes them, and each of those rows points at the person. The wipe refuses, whatever
 *   its flags, and says what, before it has removed anything (a partial wipe is the worse outcome).
 */
import type { PrismaClient } from "../src/generated/prisma/client";

export const DEMO_PREFIX = "demo_";

type Db = Pick<PrismaClient, "orgUnit" | "staffAccount" | "auditEntry" | "oneTimeCode" | "person">;

/// Whether the demo has been loaded: any organisation unit it made, in `organisationId` where given. The starter packs always give it (step 4.8 M4): a second organisation
/// added to a demonstration database is not a demonstration, so the development fill must not treat it as one.
export async function demoIsLoaded(db: Pick<PrismaClient, "orgUnit">, organisationId?: string): Promise<boolean> {
  return (await db.orgUnit.count({ where: { ...(organisationId ? { organisationId } : {}), id: { startsWith: DEMO_PREFIX } } })) > 0;
}

/// Whether a demo load has written anything at all, finished or not: its people come first, its organisation units soon after. A load that finds either
/// writes nothing (Phase 1d: nothing can take a half-made demo away again, so nothing is written twice).
export async function demoStarted(db: Pick<PrismaClient, "orgUnit" | "person">): Promise<boolean> {
  if (await demoIsLoaded(db)) return true;
  return (await db.person.count({ where: { id: { startsWith: DEMO_PREFIX } } })) > 0;
}

/// Why `npm run demo:wipe` no longer removes anything (ADR 0034 D11, Phase 1d).
export const DEMO_WIPE_RETIRED = [
  "npm run demo:wipe is retired: nothing was removed.",
  "The audit trail and the sign-in log are permanent (ADR 0034 D11): the database refuses to change or delete them, for every login,",
  "and a demonstration's records stand in that trail like any other. Business rows are not wiped on their own either, since that",
  "would leave the trail describing records that are gone.",
  "To start again, use a new database (npm run setup against an empty one, then npm run demo:load). To add the Results fixture",
  "to a database loaded before it existed, use npm run demo:results.",
].join("\n");

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

/// Why `npm run demo:switches` no longer writes anything (product owner's ruling 12c, 2026-10-12; ruling G2).
export const DEMO_SWITCHES_RETIRED = [
  "npm run demo:switches is retired: nothing was written.",
  "It changed organisation-wide configuration (the upload rules, the scope policy, a tender document part's template file) with one person's write, which the",
  "two-person path forbids (ruling G2). The demonstration writes configuration only inside npm run demo:load on a fresh database. On a database that already",
  "holds the demo, set these through Configuration: Documents (upload rules), Scope and estimate (the two switches) and Tender documents (a part's template file).",
].join("\n");
