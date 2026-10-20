/**
 * The configuration a demonstration needs that is not part of any other demonstration step: the sample sign-in settings, the supplier portal's sample words and three permission grants (AC-65). Written only by `npm run demo:load` on a
 * database with no demonstration yet (ruling 12c: no add-on step on a loaded database writes configuration). `npm run demo:accounts` makes accounts only; where something here is missing it
 * says so in words (`missingDemoConfigWords`) and writes nothing.
 *
 * Every value is the demonstration's own, invented and ASSUMED. Nothing in the product defaults to them.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { writeAudit } from "../src/lib/audit/record";
import { fillUnset, policyFault, settingLabels, unsetSettings } from "../src/lib/auth/policy";
import { loadSecurityPolicy } from "../src/lib/auth/policy-store";
import type { AuditActor, SecurityPolicyValues } from "../src/lib/auth/types";
import { storePortalPage } from "../src/lib/organisation/portal-store";
import { DEMO_PREFIX } from "./demo-sign-in";
import { DEMO_ACCOUNT_MANAGER_ROLE, DEMO_DIAL_CODES, STEP_ONE_LISTS, STEP_TWO_TYPES } from "./demo-step-one";

const ACTOR: AuditActor = { kind: "SYSTEM", label: "demo loader" };

/// SAMPLE values for a demonstration. Nothing in the product defaults to them: a customer's own are chosen, never inherited from here.
export const DEMO_POLICY: Partial<SecurityPolicyValues> = {
  staffIdleMinutes: 30,
  staffAbsoluteMinutes: 480,
  supplierIdleMinutes: 30,
  supplierAbsoluteMinutes: 480,
  maxConcurrentSessions: 3,
  concurrentSessionAction: "REVOKE_OLDEST",
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  addressThrottleAttempts: 10,
  addressThrottleMinutes: 30,
  passwordMinLength: 12,
  resetCodeValidityMinutes: 60,
};

/// The grants to the account-manager office, by their key and in words. ASSUMED: RolePermission has no column for where a grant comes from, so the trail's reason says so.
export const DEMO_GRANTS = [
  { permissionKey: "supplierAccounts.manage", label: "Manage supplier accounts", entityLabel: "Permission to manage supplier accounts" },
  { permissionKey: "announcements.publish", label: "Publish announcements to suppliers", entityLabel: "Permission to publish announcements" },
  { permissionKey: "sulit.read.creditorProfile", label: "Read a supplier's bank details", entityLabel: "Permission to read a supplier's bank details" },
] as const;

/// SAMPLE words for the supplier portal's front door (design note 0006, ruling L6). No public address: nothing in the repository serves a public copy at a fixed address, so a seeded one would be
/// a guessed link to nothing, and the demonstration shows the honest "not set" state. No "Bid online": the demonstration's portal still takes bids on paper.
export const DEMO_PORTAL_PAGE = {
  headline: "Supplier portal",
  line: "Register, buy tender documents and follow results online.",
  highlight1: "Register online",
  highlight1Icon: "building",
  highlight2: "Buy documents",
  highlight2Icon: "document",
  highlight3: "See results",
  highlight3Icon: "globe",
} as const;

type Org = { id: string; name: string };

/// The office the demonstration's grants go to: held by someone the demonstration made. Null where nobody does.
async function accountManagerRole(db: PrismaClient, organisationId: string): Promise<{ code: string; name: string } | null> {
  const held = (await db.roleAssignment.count({ where: { roleCode: DEMO_ACCOUNT_MANAGER_ROLE, personId: { startsWith: DEMO_PREFIX } } })) > 0;
  if (!held) return null;
  const role = await db.authorityRole.findFirst({ where: { organisationId, code: DEMO_ACCOUNT_MANAGER_ROLE }, select: { nameEn: true } });
  return { code: DEMO_ACCOUNT_MANAGER_ROLE, name: role?.nameEn ?? "the office that approves supplier registration" };
}

/// A database with no demonstration yet: the sample sign-in settings where unset, and the three grants.
export async function loadDemoSignInAndGrants(db: PrismaClient, org: Org): Promise<void> {
  const existing = await loadSecurityPolicy(db, org.id);
  const { values, filled } = fillUnset(existing, DEMO_POLICY);
  const fault = policyFault(values);
  if (fault) throw new Error(fault);
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
  }
  // The portal's words, only where the organisation has set none: a fresh database, never a loaded one.
  if (!(await db.organisationPortalPage.findUnique({ where: { organisationId: org.id }, select: { id: true } }))) {
    const saved = await storePortalPage(db, { organisationId: org.id, organisationName: org.name, actor: ACTOR }, DEMO_PORTAL_PAGE, "Sample words for the demonstration, written by the demo loader");
    if (!saved.ok) throw new Error(Object.values(saved.errors).join(" "));
  }
  const role = await accountManagerRole(db, org.id);
  if (!role) return;
  for (const g of DEMO_GRANTS) {
    if (await db.rolePermission.findFirst({ where: { organisationId: org.id, permissionKey: g.permissionKey, roleCode: role.code }, select: { id: true } })) continue;
    await db.$transaction(async (tx) => {
      const row = await tx.rolePermission.create({ data: { organisationId: org.id, permissionKey: g.permissionKey, roleCode: role.code, decision: "GRANTED" }, select: { id: true } });
      await writeAudit(tx, { organisationId: org.id, entity: "RolePermission", entityId: row.id, entityLabel: `${g.entityLabel} · ${role.name}`, reason: "A demonstration grant (assumed), made by the demo loader: the organisation decides this for itself", actor: ACTOR }, "CREATE", diffFields(null, { permission: g.label, role: role.name, decision: "Granted" }));
    });
  }
}

/**
 * What the demonstration's accounts and supplier portal stand on that this database does not have, one plain line each, with where to set it. Reads only. Roles are named by their office and
 * permissions by their label, never by their codes.
 */
export async function missingDemoConfigWords(db: PrismaClient, org: Org): Promise<string[]> {
  const lines: string[] = [];
  const policy = await loadSecurityPolicy(db, org.id);
  const unset = unsetSettings(policy, "SIGN_IN", "SUPPLIER_SIGN_IN", "SET_PASSWORD", "ISSUE_CODE");
  if (unset.length) lines.push(`Sign-in settings not set: ${settingLabels(unset).join("; ")}. Set them under Configuration, Sign-in settings.`);
  const role = await accountManagerRole(db, org.id);
  if (role) {
    for (const g of DEMO_GRANTS) {
      if (!(await db.rolePermission.findFirst({ where: { organisationId: org.id, permissionKey: g.permissionKey, roleCode: role.code }, select: { id: true } }))) {
        lines.push(`"${g.label}" is not granted to ${role.name}. Grant it under Configuration, Users, Permissions, if that office should have it.`);
      }
    }
  }
  for (const l of STEP_ONE_LISTS) {
    if (!(await db.supplierListValue.findFirst({ where: { organisationId: org.id, list: l.list, code: l.code }, select: { id: true } }))) {
      lines.push(`The ${l.list === "STATE" ? "state" : "Bumiputera status"} "${l.nameEn}" is not on the supplier register's lists. Add it under Configuration, Supplier register.`);
    }
  }
  for (const t of STEP_TWO_TYPES) {
    if (!(await db.supplierDocumentType.findFirst({ where: { organisationId: org.id, code: t.code }, select: { id: true } }))) {
      lines.push(`The supplier document type "${t.nameEn}" is not set up. Add it under Configuration, Supplier register.`);
    }
  }
  for (const [code, callingCode] of Object.entries(DEMO_DIAL_CODES)) {
    const country = await db.supplierListValue.findFirst({ where: { organisationId: org.id, list: "COUNTRY", code }, select: { nameEn: true, callingCode: true } });
    if (country && country.callingCode == null) lines.push(`The dial code ${callingCode} is not set on "${country.nameEn}". Set it under Configuration, Supplier register.`);
  }
  return lines;
}
