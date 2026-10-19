/**
 * Sign-in accounts for the demonstration (Phase 1b): so that someone who has loaded the demo can sign in as an administrator, and as each of the people the demo
 * is about, to see the screens as they would. For a development or demonstration database only: it refuses unless the demonstration is loaded (`npm run demo:load`),
 * because everything it makes opens with one published password. A database that holds real people and no demonstration is never given accounts by it.
 *
 *   DEMO_ACCOUNT_PASSWORD=... npm run demo:accounts
 *
 * What it makes, and only where it is not already there (a second run adds nothing and changes no password):
 *
 * - Two administrators, each a person of their own who holds no office (administration stays apart from transactions): `demo.admin1` and `demo.admin2`.
 *   Two, because the checks that need a second person cannot be shown with one.
 * - An ordinary account for every active person of the demonstration (ids prefixed `demo_`) who has none, signing in as `demo.<their name>`. A person who is
 *   not the demonstration's, whoever made them, is never given one: accounts for real people are made on Sign-in accounts, with a code, by an administrator.
 *
 * It writes accounts and nothing else (AC-65, ruling 12c): no configuration, on any database. The sign-in settings, the supplier register's lists and document types, the dial code and
 * the permission grants the demonstration stands on are written by `npm run demo:load` on a fresh database. Where one is missing here, this prints a line in words saying what it is and
 * where to set it (Configuration, by two people), and writes nothing for it.
 *
 * Every account has the one password in `DEMO_ACCOUNT_PASSWORD`, which this reads from the environment and never prints, stores in a file or puts in the
 * trail (only its hash is stored). Set it in your own `.env` (see `.env.example`). It must satisfy the organisation's shortest-password setting.
 * Every row is written as the system, "demo loader", in the transaction that makes it.
 */
import "dotenv/config";

import { AccountStatus, type PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { writeAudit } from "../src/lib/audit/record";
import { makeAdministratorConflict } from "../src/lib/auth/administration-guard";
import { recordSignInEvent } from "../src/lib/auth/events";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword, passwordFaults } from "../src/lib/auth/password";
import { policyFault } from "../src/lib/auth/policy";
import { loadSecurityPolicy } from "../src/lib/auth/policy-store";
import type { AuditActor } from "../src/lib/auth/types";
import { db } from "../src/lib/db";
import { ORGANISATION_CODE } from "../src/lib/org";
import { DEMO_PREFIX, demoIsLoaded } from "../prisma/demo-sign-in";
import { missingDemoConfigWords } from "../prisma/demo-fresh-config";
import { COMPANY_DEMO_ACCOUNTS } from "../prisma/demo-company";
import { MY_BIDS_DEMO_ACCOUNTS } from "../prisma/demo-my-bids";
import { REGISTRATION_DEMO_ACCOUNTS } from "../prisma/demo-registration";

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

  // The sign-in settings are read, never written here (AC-65). Where one the accounts need is not set, it is named in words and nothing is made.
  const existing = await loadSecurityPolicy(db, org.id);
  const missing = await missingDemoConfigWords(db as unknown as PrismaClient, org);
  const policy = existing ? policyFault(existing) : null;
  if (policy) throw new Error(policy);
  if (existing?.passwordMinLength == null || missing.some((m) => m.startsWith("Sign-in settings not set"))) {
    console.log("No accounts were made. These settings are not set on this database (set them through Configuration, by two people; nothing was written here):");
    for (const line of missing) console.log(`  ${line}`);
    return;
  }
  const minLength = existing.passwordMinLength as number;
  const faults = passwordFaults(password, { loginName: "demo.admin1", minLength });
  if (faults.length > 0) throw new Error(`DEMO_ACCOUNT_PASSWORD will not do: ${faults[0].en}`);

  const made: { loginName: string; person: string; kind: string }[] = [];
  const taken = new Set((await db.staffAccount.findMany({ select: { loginKey: true } })).map((a) => a.loginKey));

  async function makeAccount(personId: string, personName: string, loginName: string, isAdministrator: boolean) {
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const now = new Date();
      // Administration is kept apart from every office (ADR 0034 D9): the demonstration's administrators hold nothing, and this refuses one that does.
      if (isAdministrator) {
        const conflict = await makeAdministratorConflict(tx, personId, now);
        if (conflict) throw new Error(`${personName} cannot be a demonstration administrator. ${conflict.en}`);
      }
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

  // ---- Phase 4a: what the supplier portal needs to be tried, only where it is not already there. Everything is the demonstration's: invented, ASSUMED, and never a customer's.
  // A portal account for the primary contact of two demonstration suppliers, signing in with the same published password.
  const suppliers = [
    { id: `${DEMO_PREFIX}vnd1`, loginName: "demo.supplier1" },
    { id: `${DEMO_PREFIX}vnd7`, loginName: "demo.supplier2" },
  ];
  const supplierTaken = new Set((await db.supplierAccount.findMany({ select: { loginKey: true } })).map((a) => a.loginKey));
  const supplierMade: string[] = [];
  for (const sp of suppliers) {
    if (supplierTaken.has(loginKeyOf(sp.loginName))) continue;
    const contact = await db.supplierContact.findFirst({ where: { supplierId: sp.id, organisationId: org.id, isPrimary: true, retiredOn: null, account: null }, select: { id: true, supplier: { select: { reference: true } } } });
    if (!contact) continue;
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const now = new Date();
      const account = await tx.supplierAccount.create({ data: { organisationId: org.id, contactId: contact.id, supplierId: sp.id, loginName: sp.loginName, loginKey: loginKeyOf(sp.loginName), passwordHash, passwordChangedAt: now, status: AccountStatus.ACTIVE }, select: { id: true } });
      await writeAudit(tx, { organisationId: org.id, entity: "SupplierAccount", entityId: account.id, entityLabel: `${contact.supplier.reference} · Portal account`, reason: "A demonstration portal account, made by the demo accounts command", actor: ACTOR }, "CREATE", diffFields(null, { status: AccountStatus.ACTIVE }));
      await recordSignInEvent(tx, { organisationId: org.id, supplierAccountId: account.id, kind: "ACCOUNT_CREATED", at: now });
    });
    supplierMade.push(`${sp.loginName.padEnd(36)} supplier        ${contact.supplier.reference}`);
  }

  // Phase 4b: the two suppliers the demonstration holds part-way through their own registration (one with a draft, one that has sent it). Their accounts were made waiting for activation, holding the hash of a secret nobody
  // knows; this gives them the demonstration password, and nothing else of theirs is touched.
  // Phase 4c: the applicant asked to resubmit (and the contractor of demo_con13, whose account the contractor demonstration made waiting for activation), given the same.
  for (const sp of [...REGISTRATION_DEMO_ACCOUNTS, ...COMPANY_DEMO_ACCOUNTS, ...MY_BIDS_DEMO_ACCOUNTS, { loginName: "demo.ctr13", supplierId: `${DEMO_PREFIX}ctr13` }]) {
    const waiting = await db.supplierAccount.findFirst({ where: { organisationId: org.id, loginKey: loginKeyOf(sp.loginName), status: AccountStatus.PENDING_ACTIVATION }, select: { id: true, supplier: { select: { reference: true } } } });
    if (!waiting) continue;
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const now = new Date();
      await tx.supplierAccount.update({ where: { id: waiting.id }, data: { passwordHash, passwordChangedAt: now, status: AccountStatus.ACTIVE } });
      await writeAudit(tx, { organisationId: org.id, entity: "SupplierAccount", entityId: waiting.id, entityLabel: `${waiting.supplier.reference} · Portal account`, reason: "A demonstration portal account, given the demonstration password by the demo accounts command", actor: ACTOR }, "UPDATE", diffFields({ status: "Waiting for activation" }, { status: AccountStatus.ACTIVE }));
    });
    supplierMade.push(`${sp.loginName.padEnd(36)} supplier        ${waiting.supplier.reference} (registration part-way)`);
  }

  // Whatever else the demonstration stands on that this database does not have, said in words and not written (AC-65).
  const stillMissing = missing.filter((m) => !m.startsWith("Sign-in settings not set"));
  if (made.length === 0 && supplierMade.length === 0) console.log("Every account the demonstration needs is already there. Nothing was changed.");
  if (made.length > 0) {
    console.log(`Made ${made.length} account${made.length === 1 ? "" : "s"}. Each signs in with the password in DEMO_ACCOUNT_PASSWORD:`);
    for (const m of made) console.log(`  ${m.loginName.padEnd(36)} ${m.kind.padEnd(14)} ${m.person}`);
    console.log("\nOpen http://localhost:3000 (not 127.0.0.1: the session cookie is Secure) and sign in.");
  }
  if (supplierMade.length > 0) {
    console.log(`\nMade ${supplierMade.length} supplier portal account${supplierMade.length === 1 ? "" : "s"} (same password). Suppliers sign in on the PUBLIC copy only: stop the server and start it again with PORTAL_SURFACE=public (npm run dev allows one server per folder), and open it in a private window or another browser profile (the cookie names are host-wide, and a staff cookie is refused on the public copy):`);
    for (const line of supplierMade) console.log(`  ${line}`);
  }
  if (stillMissing.length > 0) {
    console.log("\nThese settings are not set on this database (set them through Configuration, by two people; nothing was written here):");
    for (const line of stillMissing) console.log(`  ${line}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
