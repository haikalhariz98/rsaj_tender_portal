import { randomBytes } from "node:crypto";

import { AccountStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { RequestFacts } from "@/lib/auth/request";
import type { SecurityPolicyValues } from "@/lib/auth/types";

/**
 * Fixtures for the database tests (`npm run test:db`). Everything is made fresh and named at random, so a run does not depend on what an
 * earlier one left in the scratch database, and nothing here is ever a password anyone could use anywhere: each is generated in memory.
 */

export const ORG_CODE = "AUTH_TEST";

export const randomId = () => randomBytes(5).toString("hex");

/// A password made for one test and held only in memory.
export const randomPassword = () => `${randomBytes(15).toString("base64url")}Aa1`;

const octet = () => Math.floor(Math.random() * 250) + 1;
/// A documentation address (RFC 5737 range), different on every call, so one test's failures never count against another's.
export const randomAddress = () => `198.51.${octet()}.${octet()}`;

export const facts = (sourceAddress: string | null = randomAddress()): RequestFacts => ({ sourceAddress, userAgent: "vitest" });

export const SETTINGS: SecurityPolicyValues = {
  staffIdleMinutes: 30,
  staffAbsoluteMinutes: 480,
  supplierIdleMinutes: null,
  supplierAbsoluteMinutes: null,
  maxConcurrentSessions: 3,
  concurrentSessionAction: "REVOKE_OLDEST",
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  addressThrottleAttempts: 10,
  addressThrottleMinutes: 30,
  passwordMinLength: 12,
  resetCodeValidityMinutes: 60,
  paperSignatureRecording: null,
  signInDetailRetentionDays: null,
  sealingPassphraseMinLength: null,
  twoPersonChanges: true,
};

export async function testOrganisation() {
  return db.organisation.upsert({ where: { code: ORG_CODE }, update: {}, create: { code: ORG_CODE, name: "Auth test organisation", timeZone: "Asia/Kuala_Lumpur" } });
}

/// Set the organisation's policy to exactly these values: anything not given is unset.
export async function setPolicy(organisationId: string, values: Partial<SecurityPolicyValues> | null = SETTINGS) {
  if (values === null) {
    await db.securityPolicy.deleteMany({ where: { organisationId } });
    return;
  }
  const full = { ...Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, k === "twoPersonChanges" ? true : null])), ...values } as SecurityPolicyValues;
  await db.securityPolicy.upsert({ where: { organisationId }, create: { organisationId, ...full }, update: full });
}

export async function makePerson(organisationId: string, name = `Test Person ${randomId()}`) {
  return db.person.create({ data: { organisationId, name } });
}

export async function makeAccount(
  organisationId: string,
  opts: { password?: string; loginName?: string; admin?: boolean; status?: "ACTIVE" | "DISABLED" | "PENDING_ACTIVATION"; personActive?: boolean; mustChangePassword?: boolean } = {},
) {
  const password = opts.password ?? randomPassword();
  const loginName = opts.loginName ?? `user.${randomId()}`;
  const person = await db.person.create({ data: { organisationId, name: `Test ${loginName}`, isActive: opts.personActive ?? true } });
  const status = opts.status ?? "ACTIVE";
  const account = await db.staffAccount.create({
    data: {
      organisationId,
      personId: person.id,
      loginName,
      loginKey: loginName.toLowerCase(),
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      isAdministrator: opts.admin ?? false,
      mustChangePassword: opts.mustChangePassword ?? false,
      status,
      ...(status === "DISABLED" ? { disabledAt: new Date(), disabledReason: "test" } : {}),
    },
  });
  return { account, person, password, loginName };
}

/// Sign-in refuses while the organisation has no administrator, so a test that is not about that makes sure there is one.
export async function ensureAdministrator(organisationId: string) {
  const existing = await db.staffAccount.count({ where: { organisationId, isAdministrator: true, status: AccountStatus.ACTIVE } });
  if (existing === 0) await makeAccount(organisationId, { admin: true });
}

export async function eventsOf(accountId: string) {
  return db.signInEvent.findMany({ where: { staffAccountId: accountId }, orderBy: { at: "asc" }, include: { detail: true } });
}

export const kindsOf = async (accountId: string) => (await eventsOf(accountId)).map((e) => e.kind);

// ---------------------------------------------------------------------------------------------- the supplier store (Phase 4a)

/// The settings a supplier's sign-in needs, beside the staff ones: the supplier's own timeouts.
export const SUPPLIER_SETTINGS: SecurityPolicyValues = { ...SETTINGS, supplierIdleMinutes: 20, supplierAbsoluteMinutes: 120 };

/// A supplier with one contact and, unless told not to, that contact's portal account.
export async function makeSupplierAccount(
  organisationId: string,
  opts: { password?: string; loginName?: string; status?: "ACTIVE" | "DISABLED" | "PENDING_ACTIVATION"; retired?: boolean; withAccount?: boolean; supplierId?: string } = {},
) {
  const password = opts.password ?? randomPassword();
  const loginName = opts.loginName ?? `supplier.${randomId()}`;
  const supplier = opts.supplierId
    ? await db.supplier.findUniqueOrThrow({ where: { id: opts.supplierId } })
    : await db.supplier.create({
        data: {
          organisationId,
          reference: `TEST/SUP/${randomId()}`,
          registeredName: `Test Supplier ${randomId()}`,
          registrationNo: randomId(),
          registrationNoKey: randomId().toUpperCase() + randomId().toUpperCase(),
          entityTypeCode: "x",
          countryCode: "x",
          registeredAddress: "1 Test Street",
          companyEmail: "test@example.test",
        },
      });
  const contact = await db.supplierContact.create({ data: { organisationId, supplierId: supplier.id, name: `Contact ${loginName}`, email: `${loginName}@example.test`, isPrimary: !opts.supplierId, retiredOn: opts.retired ? new Date("2026-01-01") : null } });
  const status = opts.status ?? "ACTIVE";
  const account =
    opts.withAccount === false
      ? null
      : await db.supplierAccount.create({
          data: {
            organisationId,
            contactId: contact.id,
            supplierId: supplier.id,
            loginName,
            loginKey: loginName.toLowerCase(),
            passwordHash: await hashPassword(password),
            passwordChangedAt: new Date(),
            status,
            ...(status === "DISABLED" ? { disabledAt: new Date(), disabledReason: "test" } : {}),
          },
        });
  return { supplier, contact, account, password, loginName };
}

export async function supplierEventsOf(accountId: string) {
  return db.signInEvent.findMany({ where: { supplierAccountId: accountId }, orderBy: { at: "asc" }, include: { detail: true } });
}

export const supplierKindsOf = async (accountId: string) => (await supplierEventsOf(accountId)).map((e) => e.kind);
