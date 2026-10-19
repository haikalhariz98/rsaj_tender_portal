import type { Tx } from "@/lib/audit/record";
import { storedDay, todayIn } from "@/lib/dates";
import type { SupplierActor } from "@/lib/auth/types";
import type { RegistrationValueKind } from "@/lib/suppliers/types";

import { currentDeclarationText, type StoredDeclarationText } from "./declaration";
import type { DeclarationKind, DocumentTypeConfig, RegistrationContext } from "./types";
import { inOrder } from "@/lib/series";

/**
 * The organisation's configuration, read for a signed-in supplier's registration (Phase 4b): the facts `RegistrationContext` hands the pure rules, and the settings the routes judge an
 * upload by. Reads only, in the caller's client, for the supplier's organisation (the actor's, never a request's). Nothing is cached: a setting the office has just made is the next
 * request's.
 *
 * Not the whole list of registration values: the published lists run to thousands of codes. The context holds the values the draft has chosen and, for each body and kind, whether
 * there is any live value to choose; the page searches the rest on the server.
 */

/// The CodeFormat keys the bank details are checked against. Seed data of the customer's; none ships (no format set: accepted, "format not checked").
export const BANK_ACCOUNT_NO_FORMAT_KEY = "bank_account_no";
export const SWIFT_FORMAT_KEY = "swift_code";

export interface RegistrationSettings {
  org: { id: string; name: string; timeZone: string | null; today: string | null };
  /// What `SupplierPolicy` says of the registration, each null while not set.
  policy: {
    verificationNoticeEn: string | null;
    verificationNoticeMs: string | null;
    helpEmail: string | null;
    helpPhone: string | null;
    uploadMaxFilesPerApplication: number | null;
    uploadMaxBytesPerApplication: bigint | null;
    supplierUploadClassId: string | null;
    supplierBankStatementClassId: string | null;
    onlineDeclarationReplacesPaper: boolean | null;
  };
}

const live = (r: { retiredOn: Date | null }, today: string | null) => r.retiredOn == null || (today != null && storedDay(r.retiredOn) > today);

export function typeConfig(t: { id: string; nameEn: string; nameMs: string | null; hintEn: string | null; hintMs: string | null; bodyId: string | null; valueKinds: string[]; expires: boolean | null; mandatoryAtRegistration: boolean | null; notApplicableAllowed: boolean | null; recordsRate: boolean | null; repeatable: boolean | null; retiredOn: Date | null }, today: string | null): DocumentTypeConfig {
  return {
    id: t.id,
    nameEn: t.nameEn,
    nameMs: t.nameMs,
    hintEn: t.hintEn,
    hintMs: t.hintMs,
    bodyId: t.bodyId,
    valueKinds: t.valueKinds as RegistrationValueKind[],
    expires: t.expires,
    mandatoryAtRegistration: t.mandatoryAtRegistration,
    notApplicableAllowed: t.notApplicableAllowed,
    recordsRate: t.recordsRate,
    repeatable: t.repeatable,
    retired: !live(t, today),
  };
}

export async function loadRegistrationSettings(client: Tx, organisationId: string): Promise<RegistrationSettings | null> {
  const [org, policy] = await inOrder(
    () => client.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, timeZone: true } }),
    () => client.supplierPolicy.findUnique({
      where: { organisationId },
      select: {
        verificationNoticeEn: true,
        verificationNoticeMs: true,
        helpEmail: true,
        helpPhone: true,
        uploadMaxFilesPerApplication: true,
        uploadMaxBytesPerApplication: true,
        supplierUploadClassId: true,
        supplierBankStatementClassId: true,
        onlineDeclarationReplacesPaper: true,
      },
    }));
  if (!org) return null;
  return {
    org: { id: org.id, name: org.name, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) },
    policy: policy ?? {
      verificationNoticeEn: null,
      verificationNoticeMs: null,
      helpEmail: null,
      helpPhone: null,
      uploadMaxFilesPerApplication: null,
      uploadMaxBytesPerApplication: null,
      supplierUploadClassId: null,
      supplierBankStatementClassId: null,
      onlineDeclarationReplacesPaper: null,
    },
  };
}

/**
 * The context the rules judge a draft by. `chosenValueIds` are the registration values the draft carries (the only ones loaded by id); `contactName` is the signed-in contact's name, which
 * a signatory is compared with and flagged against; the supplier's registration number key is what a beneficiary's identity number is compared with.
 */
export async function loadRegistrationContext(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId" | "displayName">, settings: RegistrationSettings, chosenValueIds: readonly string[]): Promise<RegistrationContext> {
  const orgId = actor.organisationId;
  const today = settings.org.today;
  const [supplier, types, bodies, chosen, available, lists, texts, formats] = await inOrder(
    () => client.supplier.findFirst({ where: { id: actor.supplierId, organisationId: orgId }, select: { registrationNoKey: true } }),
    () => client.supplierDocumentType.findMany({ where: { organisationId: orgId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.registrationBody.findMany({ where: { organisationId: orgId }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], select: { id: true, labelEn: true, retiredOn: true } }),
    () => chosenValueIds.length ? client.registrationValue.findMany({ where: { organisationId: orgId, id: { in: [...chosenValueIds] } }, select: { id: true, bodyId: true, kind: true, code: true, nameEn: true, retiredOn: true } }) : Promise.resolve([]),
    // Which body and kind have a live value: one row each, however many thousands of codes they hold.
    () => client.registrationValue.groupBy({ by: ["bodyId", "kind"], where: { organisationId: orgId, OR: [{ retiredOn: null }, ...(today ? [{ retiredOn: { gt: new Date(`${today}T00:00:00Z`) } }] : [])] } }),
    () => client.supplierListValue.findMany({ where: { organisationId: orgId, list: { in: ["BANK", "ACCOUNT_TYPE"] } }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { list: true, code: true, nameEn: true, retiredOn: true } }),
    () => client.declarationText.findMany({ where: { organisationId: orgId }, select: { id: true, kind: true, version: true, bodyEn: true, bodyMs: true, issuedOn: true, retiredOn: true } }),
    () => client.codeFormat.findMany({ where: { organisationId: orgId, key: { in: [BANK_ACCOUNT_NO_FORMAT_KEY, SWIFT_FORMAT_KEY] } }, select: { key: true, pattern: true } }));
  const stored: StoredDeclarationText[] = texts.map((t) => ({ id: t.id, kind: t.kind as DeclarationKind, version: t.version, bodyEn: t.bodyEn, bodyMs: t.bodyMs, issuedOn: storedDay(t.issuedOn), retiredOn: t.retiredOn ? storedDay(t.retiredOn) : null }));
  const entries = (list: "BANK" | "ACCOUNT_TYPE") => lists.filter((l) => l.list === list && live(l, today)).map((l) => ({ code: l.code, nameEn: l.nameEn }));
  const noticeEn = settings.policy.verificationNoticeEn;
  return {
    today,
    types: types.map((t) => typeConfig(t, today)),
    bodies: bodies.filter((b) => live(b, today)).map((b) => ({ id: b.id, nameEn: b.labelEn })),
    values: chosen.map((v) => ({ id: v.id, bodyId: v.bodyId, kind: v.kind as RegistrationValueKind, code: v.code, nameEn: v.nameEn, retired: !live(v, today) })),
    available: available.map((a) => ({ bodyId: a.bodyId, kind: a.kind as RegistrationValueKind })),
    banks: entries("BANK"),
    accountTypes: entries("ACCOUNT_TYPE"),
    texts: { GIRO_AUTHORISATION: currentDeclarationText(stored, "GIRO_AUTHORISATION", today, settings.org.name), FALSE_DECLARATION: currentDeclarationText(stored, "FALSE_DECLARATION", today, settings.org.name) },
    noticeEn: noticeEn && noticeEn.trim() ? noticeEn : null,
    accountNoPattern: formats.find((f) => f.key === BANK_ACCOUNT_NO_FORMAT_KEY)?.pattern ?? null,
    swiftPattern: formats.find((f) => f.key === SWIFT_FORMAT_KEY)?.pattern ?? null,
    supplier: { registrationNoKey: supplier?.registrationNoKey ?? "", contactName: actor.displayName },
  };
}


/// The context for a signed-in supplier, settings and all, in one call: what a save judges the step's rules by.
export async function contextFor(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId" | "displayName">, chosenValueIds: readonly string[]): Promise<RegistrationContext> {
  const settings = await loadRegistrationSettings(client, actor.organisationId);
  if (!settings) throw new Error("The supplier's organisation no longer exists.");
  return loadRegistrationContext(client, actor, settings, chosenValueIds);
}
