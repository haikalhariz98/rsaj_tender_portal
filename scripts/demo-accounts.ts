/**
 * Sign-in accounts for the demonstration (Phase 1b): so that someone who has loaded the demo can sign in as an administrator, and as each of the people the demo
 * is about, to see the screens as they would. For a development or demonstration database only: it refuses unless the demonstration is loaded (`npm run demo:load`),
 * because everything it makes opens with one published password. A database that holds real people and no demonstration is never given accounts by it.
 *
 *   DEMO_ACCOUNT_PASSWORD=... npm run demo:accounts
 *
 * What it makes, and only where it is not already there (a second run adds nothing and changes no password):
 *
 * - The organisation's sign-in settings that are unset, filled with the SAMPLE values below. They are a demonstration's, not a recommendation: a customer
 *   chooses its own (the bootstrap command asks for each; Configuration is where they are kept). A setting already set is never changed.
 * - Two administrators, each a person of their own who holds no office (administration stays apart from transactions): `demo.admin1` and `demo.admin2`.
 *   Two, because the checks that need a second person cannot be shown with one.
 * - An ordinary account for every active person of the demonstration (ids prefixed `demo_`) who has none, signing in as `demo.<their name>`. A person who is
 *   not the demonstration's, whoever made them, is never given one: accounts for real people are made on Sign-in accounts, with a code, by an administrator.
 *
 * Every account has the one password in `DEMO_ACCOUNT_PASSWORD`, which this reads from the environment and never prints, stores in a file or puts in the
 * trail (only its hash is stored). Set it in your own `.env` (see `.env.example`). It must satisfy the organisation's shortest-password setting.
 * Every row is written as the system, "demo loader", in the transaction that makes it.
 */
import "dotenv/config";

import { AccountStatus, type PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { writeAudit } from "../src/lib/audit/record";
import { recordSignInEvent } from "../src/lib/auth/events";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword, passwordFaults } from "../src/lib/auth/password";
import { fillUnset, policyFault, settingLabels, unsetSettings } from "../src/lib/auth/policy";
import { loadSecurityPolicy } from "../src/lib/auth/policy-store";
import type { AuditActor, SecurityPolicyValues } from "../src/lib/auth/types";
import { db } from "../src/lib/db";
import { ORGANISATION_CODE } from "../src/lib/org";
import { DEMO_PREFIX, demoIsLoaded } from "../prisma/demo-sign-in";

/// SAMPLE values for a demonstration. Nothing in the product defaults to them: a customer's own are chosen, never inherited from here.
const DEMO_POLICY: Partial<SecurityPolicyValues> = {
  staffIdleMinutes: 30,
  staffAbsoluteMinutes: 480,
  maxConcurrentSessions: 3,
  concurrentSessionAction: "REVOKE_OLDEST",
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  addressThrottleAttempts: 10,
  addressThrottleMinutes: 30,
  passwordMinLength: 12,
  resetCodeValidityMinutes: 60,
};

const ADMINISTRATORS = [
  { loginName: "demo.admin1", name: "Demo Administrator One" },
  { loginName: "demo.admin2", name: "Demo Administrator Two" },
];

const ACTOR: AuditActor = { kind: "SYSTEM", label: "demo loader" };

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `demo.${s}`.slice(0, 64);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demonstration accounts are for a development or demonstration database, never a production one.");
  if (process.argv.slice(2).some((a) => a === "--help" || a === "-h")) {
    console.log("DEMO_ACCOUNT_PASSWORD=... npm run demo:accounts\n\nMakes sign-in accounts for the demonstration: two administrators and one for each person of the demonstration (it must be loaded first). See the head of scripts/demo-accounts.ts.");
    return;
  }
  const password = process.env.DEMO_ACCOUNT_PASSWORD ?? "";
  if (!password) throw new Error("DEMO_ACCOUNT_PASSWORD is not set. Put a password of your own for the demonstration accounts in .env (see .env.example), then run this again.");

  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, name: true } });
  if (!org) throw new Error(`There is no organisation with the code ${ORGANISATION_CODE}. Run npm run setup and npm run demo:load first.`);

  // The marker (the product's client omits some columns from its types, as the loader's plain one does not; it is the same connection): a database that holds the demonstration. Nothing below is done to one that does not (the sample settings, the administrators and the accounts all
  // open with the one published password).
  if (!(await demoIsLoaded(db as unknown as PrismaClient))) throw new Error("The demonstration is not loaded in this database, so no demonstration accounts are made: they all sign in with one published password. Run npm run demo:load first. For a real person, an administrator makes the account on Sign-in accounts.");

  // The settings: fill what is unset with the sample values, and say so in the trail.
  const existing = await loadSecurityPolicy(db, org.id);
  const { values, filled } = fillUnset(existing, DEMO_POLICY);
  const fault = policyFault(values);
  if (fault) throw new Error(fault);
  const unset = unsetSettings(values, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE");
  if (unset.length > 0) throw new Error(`These settings are unset and the demonstration has no sample for them: ${settingLabels(unset).join("; ")}.`);
  const minLength = values.passwordMinLength as number;
  const faults = passwordFaults(password, { loginName: "demo.admin1", minLength });
  if (faults.length > 0) throw new Error(`DEMO_ACCOUNT_PASSWORD will not do: ${faults[0].en}`);

  if (filled.length > 0) {
    const data = Object.fromEntries(filled.map((k) => [k, values[k]]));
    await db.$transaction(async (tx) => {
      await tx.securityPolicy.upsert({ where: { organisationId: org.id }, create: { organisationId: org.id, ...data }, update: data });
      await writeAudit(
        tx,
        { organisationId: org.id, entity: "SecurityPolicy", entityId: org.id, entityLabel: `Security settings of ${org.name}`, reason: "Sample values filled in for the demonstration where they were unset", actor: ACTOR },
        existing ? "UPDATE" : "CREATE",
        existing ? diffFields(Object.fromEntries(filled.map((k) => [k, existing[k]])), data) : diffFields(null, data),
      );
    });
    console.log(`Filled ${filled.length} unset sign-in setting${filled.length === 1 ? "" : "s"} with sample values: ${settingLabels(filled).join("; ")}.`);
  }

  const made: { loginName: string; person: string; kind: string }[] = [];
  const taken = new Set((await db.staffAccount.findMany({ select: { loginKey: true } })).map((a) => a.loginKey));

  async function makeAccount(personId: string, personName: string, loginName: string, isAdministrator: boolean) {
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const now = new Date();
      const account = await tx.staffAccount.create({
        data: { organisationId: org!.id, personId, loginName, loginKey: loginKeyOf(loginName), passwordHash, passwordChangedAt: now, isAdministrator, status: AccountStatus.ACTIVE },
        select: { id: true },
      });
      await writeAudit(
        tx,
        { organisationId: org!.id, entity: "StaffAccount", entityId: account.id, entityLabel: `Sign-in account of ${personName}`, reason: "A demonstration account, made by the demo accounts command", actor: ACTOR },
        "CREATE",
        diffFields(null, { loginName, isAdministrator, status: AccountStatus.ACTIVE, person: personName }),
      );
      await recordSignInEvent(tx, { organisationId: org!.id, staffAccountId: account.id, kind: "ACCOUNT_CREATED", at: now });
    });
    taken.add(loginKeyOf(loginName));
    made.push({ loginName, person: personName, kind: isAdministrator ? "administrator" : "ordinary" });
  }

  for (const a of ADMINISTRATORS) {
    if (taken.has(loginKeyOf(a.loginName))) continue;
    const person = await db.$transaction(async (tx) => {
      const found = await tx.person.findFirst({ where: { organisationId: org.id, name: a.name }, select: { id: true } });
      if (found) return found;
      const p = await tx.person.create({ data: { organisationId: org.id, name: a.name, jobTitle: "Account administrator" }, select: { id: true } });
      await writeAudit(tx, { organisationId: org.id, entity: "Person", entityId: p.id, entityLabel: a.name, reason: "The demonstration administrator's own person, who holds no office", actor: ACTOR }, "CREATE", diffFields(null, { name: a.name, jobTitle: "Account administrator" }));
      return p;
    });
    await makeAccount(person.id, a.name, a.loginName, true);
  }

  const people = await db.person.findMany({ where: { organisationId: org.id, id: { startsWith: DEMO_PREFIX }, isActive: true, staffAccount: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  for (const p of people) {
    let loginName = slug(p.name);
    for (let n = 2; taken.has(loginKeyOf(loginName)); n++) loginName = `${slug(p.name).slice(0, 60)}.${n}`;
    await makeAccount(p.id, p.name, loginName, false);
  }

  if (made.length === 0) {
    console.log("Every account the demonstration needs is already there. Nothing was changed.");
    return;
  }
  console.log(`Made ${made.length} account${made.length === 1 ? "" : "s"}. Each signs in with the password in DEMO_ACCOUNT_PASSWORD:`);
  for (const m of made) console.log(`  ${m.loginName.padEnd(36)} ${m.kind.padEnd(14)} ${m.person}`);
  console.log("\nOpen http://localhost:3000 (not 127.0.0.1: the session cookie is Secure) and sign in.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
