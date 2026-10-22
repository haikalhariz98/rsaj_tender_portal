/**
 * What the public registration form needs to draw itself: the company types, countries (with their dial codes), states and Bumiputera statuses the
 * register accepts, the format example for the registration number, the notice about personal
 * details, the office's note to applicants, the contact rule, and whether the register is set up to take an
 * application at all.
 *
 * Nothing about any supplier or any application is read: no name, no number, no reference.
 */

import type { Tx } from "@/lib/audit/record";
import { formSecret } from "@/lib/auth/form-secret";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadStorePolicy, type DocumentOrg } from "@/lib/documents/service";
import { blobStore, deploymentCeiling } from "@/lib/documents/store";
import { patternFaults, type NumberingReset } from "@/lib/numbering/series";
import { inOrder } from "@/lib/series";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { REGISTRATION_NO_FORMAT_KEY } from "@/lib/suppliers/types";

import { deploymentOrganisation } from "./deployment";
import { PORTAL_APPLICATION_SERIES_KEY, whatIsMissing, type PortalApplicationContext, type PortalLimits, type RegisterReadiness } from "./apply";
import type { Words } from "./labels";
import { registerBodyCeiling } from "./register/ceiling";
import { loadRegistrationSettings, registrationContextFor, type RegistrationSettings } from "./registration/context-store";
import type { RegistrationContext } from "./registration/types";
import { loadUploadSettings, type UploadSettings } from "./registration/upload-settings";

export interface RegistrationForm {
  /// No organisation is set up: nothing can be said.
  ready: boolean;
  /// What the register still lacks before it can take an application. Empty: it is open.
  missing: Words[];
  entityTypes: { value: string; label: string }[];
  /// `callingCode` is the country's dial code, or null where none is set.
  countries: { value: string; label: string; callingCode: string | null }[];
  states: { value: string; label: string }[];
  /// The statuses an applicant may declare. Empty: the claim is not asked.
  bumiputeraStatuses: { value: string; label: string }[];
  /// `SupplierPolicy.contactNeedsEmailAndPhone`: true asks for both, anything else for either. The form says which.
  contactNeedsEmailAndPhone: boolean | null;
  formatExample: string | null;
  /// The office's own words to an applicant, where it has set them.
  notice: string | null;
  /// How personal details are used (PDPA 2010), in the customer's own words. The English text, or the form stays closed.
  personalDataNotice: { en: string } | null;
}

export async function loadRegistrationForm(): Promise<RegistrationForm> {
  // The public registration form serves the deployment's one organisation (ADR 0034 D10): nobody is signed in to name one.
  const deployment = await deploymentOrganisation();
  const org = deployment ? await supplierOrg(deployment.id) : null;
  if (!org) return { ready: false, missing: [], entityTypes: [], countries: [], states: [], bumiputeraStatuses: [], contactNeedsEmailAndPhone: null, formatExample: null, notice: null, personalDataNotice: null };
  const cfg = await loadSupplierConfig(org.id);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY" | "STATE" | "BUMIPUTERA_STATUS") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  const entityTypes = list("ENTITY_TYPE");
  const countries = list("COUNTRY").map((c) => ({ ...c, callingCode: cfg.callingCodeOf(c.value) }));
  const states = list("STATE");
  const bumiputeraStatuses = list("BUMIPUTERA_STATUS");
  const en = cfg.policy?.personalDataNoticeEn?.trim() ?? "";
  return {
    ready: true,
    // The one-submission register's readiness (ADR 0041 D9): the same reader the submit route asks, so the page and the route cannot disagree.
    missing: (await loadRegisterSettings())?.missing ?? [],
    entityTypes,
    countries,
    states,
    bumiputeraStatuses,
    contactNeedsEmailAndPhone: cfg.policy?.contactNeedsEmailAndPhone ?? null,
    formatExample: cfg.format?.example?.trim() || null,
    notice: cfg.policy?.verificationNoticeEn?.trim() || null,
    personalDataNotice: en ? { en } : null,
  };
}

/// The lists step 1 is judged by.
const STEP_ONE_LISTS = ["ENTITY_TYPE", "COUNTRY", "STATE", "BUMIPUTERA_STATUS"] as const;

/**
 * Everything the one-submission register is judged by, read once per request (ADR 0041 D9, plan sections 3.1 and 5): the organisation, step 1's lists and format, steps 2 to 5's
 * configuration, the upload rules, the body ceiling derived from them, the two limits, and what is still missing. The submit route asks it before a byte of the body is read (guard 3b);
 * the page asks it to say whether the register is open. Nothing about any supplier or application is read.
 *
 * Deliberately lighter than `loadSupplierConfig`: a stranger's every post reads it, so it never loads the registration bodies' thousands of codes.
 */
export interface RegisterSettings {
  org: DocumentOrg & { name: string };
  settings: RegistrationSettings;
  /// Step 1's configuration, as the public form's rule reads it.
  step1: PortalApplicationContext;
  /// The name a STATE code is shown by, and the dial code a COUNTRY carries: what the stored application is composed with.
  stateName(code: string): string | null;
  callingCode(country: string): string | null;
  /// Steps 2 to 5's configuration, with no value chosen and no applicant named: what readiness is judged by.
  context: RegistrationContext;
  upload: UploadSettings;
  /// The most bytes one application may weigh. Null while a setting it is derived from is unset (and the register is closed).
  ceiling: bigint | null;
  limits: PortalLimits;
  readiness: RegisterReadiness;
  missing: Words[];
}

/// Null: the deployment's organisation is not set up.
export async function loadRegisterSettings(client: Tx = db, env: Record<string, string | undefined> = process.env): Promise<RegisterSettings | null> {
  const deployment = await deploymentOrganisation(client);
  if (!deployment) return null;
  const settings = await loadRegistrationSettings(client, deployment.id);
  if (!settings) return null;
  const orgId = settings.org.id;
  const today = settings.org.today;
  const [lists, format, policy, series, storePolicy, context, upload] = await inOrder(
    () => client.supplierListValue.findMany({ where: { organisationId: orgId, list: { in: [...STEP_ONE_LISTS] } }, orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }], select: { list: true, code: true, nameEn: true, callingCode: true, retiredOn: true } }),
    () => client.codeFormat.findFirst({ where: { organisationId: orgId, key: REGISTRATION_NO_FORMAT_KEY }, select: { pattern: true } }),
    () => client.supplierPolicy.findUnique({ where: { organisationId: orgId }, select: { portalDailyLimit: true, portalDailyLimitPerNumber: true, contactNeedsEmailAndPhone: true } }),
    () => client.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: orgId, key: PORTAL_APPLICATION_SERIES_KEY } }, select: { pattern: true, resetOn: true } }),
    () => loadStorePolicy(orgId, client),
    () => registrationContextFor(client, orgId, settings, [], { registrationNoKey: "", contactName: "" }),
    () => loadUploadSettings(client, orgId, settings));
  const live = (r: { retiredOn: Date | null }) => r.retiredOn == null || (today != null && storedDay(r.retiredOn) > today);
  const codes = (list: (typeof STEP_ONE_LISTS)[number]) => lists.filter((l) => l.list === list && live(l)).map((l) => l.code);
  const step1: PortalApplicationContext = {
    today,
    formatPattern: format?.pattern ?? null,
    entityTypeCodes: codes("ENTITY_TYPE"),
    countryCodes: codes("COUNTRY"),
    stateCodes: codes("STATE"),
    bumiputeraCodes: codes("BUMIPUTERA_STATUS"),
    contactNeedsEmailAndPhone: policy?.contactNeedsEmailAndPhone ?? null,
  };
  const limits: PortalLimits = { daily: policy?.portalDailyLimit ?? null, perNumber: policy?.portalDailyLimitPerNumber ?? null };
  const ceiling = registerBodyCeiling({ capBytes: upload.store.capBytes, maxFiles: upload.document.maxFiles, maxBytes: upload.document.maxBytes });
  const readiness: RegisterReadiness = {
    today,
    entityTypeCodes: step1.entityTypeCodes,
    countryCodes: step1.countryCodes,
    stateCodes: step1.stateCodes,
    numberingReady: !!series && patternFaults({ pattern: series.pattern, resetOn: series.resetOn as NumberingReset }).length === 0,
    noticeSet: context.personalDataNotice != null,
    termsTextSet: context.texts.TERMS_AND_CONDITIONS != null,
    falseDeclarationTextSet: context.texts.FALSE_DECLARATION != null,
    giroTextSet: context.texts.GIRO_AUTHORISATION != null,
    verificationNoticeSet: context.noticeEn != null,
    documentTypesSet: context.types.some((t) => !t.retired),
    banksSet: context.banks.length > 0,
    accountTypesSet: context.accountTypes.length > 0,
    storeRulesSet: upload.store.allowedTypes.length > 0 && storePolicy.maxBytes != null && storePolicy.maxBytes > 0n,
    ceilingSet: !("fault" in deploymentCeiling(env)),
    documentClassSet: upload.document.classId != null,
    statementClassSet: upload.statement.classId != null && upload.statement.classIsSulit === true,
    quotasSet: upload.document.maxFiles != null && upload.document.maxBytes != null,
    limitsSet: limits.daily != null && limits.perNumber != null,
    onlineDeclarationAccepted: settings.policy.onlineDeclarationReplacesPaper === true,
    storeDriverSet: !("fault" in blobStore(env)),
    formKeySet: formSecret(env) != null,
  };
  return {
    org: { id: orgId, code: deployment.code, timeZone: settings.org.timeZone, today, name: settings.org.name },
    settings,
    step1,
    stateName: (code) => lists.find((l) => l.list === "STATE" && l.code === code)?.nameEn ?? null,
    callingCode: (country) => lists.find((l) => l.list === "COUNTRY" && l.code === country)?.callingCode ?? null,
    context,
    upload,
    ceiling,
    limits,
    readiness,
    missing: whatIsMissing(readiness),
  };
}
