/**
 * What the public registration form needs to draw itself: the company types, countries (with their dial codes), states and Bumiputera statuses the
 * register accepts, the format example for the registration number, the notice about personal
 * details, the office's note to applicants, the contact rule, and whether the register is set up to take an
 * application at all.
 *
 * Nothing about any supplier or any application is read: no name, no number, no reference.
 */

import { formSecret } from "@/lib/auth/form-secret";
import { db } from "@/lib/db";
import { patternFaults, type NumberingReset } from "@/lib/numbering/series";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";

import { deploymentOrganisation } from "./deployment";
import { PORTAL_APPLICATION_SERIES_KEY, whatIsMissing } from "./apply";
import type { Words } from "./labels";

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
  /// How personal details are used (PDPA 2010), in the customer's own words. Both languages, or the form stays closed.
  personalDataNotice: { en: string; ms: string } | null;
}

export async function loadRegistrationForm(): Promise<RegistrationForm> {
  // The public registration form serves the deployment's one organisation (ADR 0034 D10): nobody is signed in to name one.
  const deployment = await deploymentOrganisation();
  const org = deployment ? await supplierOrg(deployment.id) : null;
  if (!org) return { ready: false, missing: [], entityTypes: [], countries: [], states: [], bumiputeraStatuses: [], contactNeedsEmailAndPhone: null, formatExample: null, notice: null, personalDataNotice: null };
  const [cfg, series] = await Promise.all([loadSupplierConfig(org.id), db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: org.id, key: PORTAL_APPLICATION_SERIES_KEY } }, select: { pattern: true, resetOn: true } })]);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY" | "STATE" | "BUMIPUTERA_STATUS") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  const entityTypes = list("ENTITY_TYPE");
  const countries = list("COUNTRY").map((c) => ({ ...c, callingCode: cfg.callingCodeOf(c.value) }));
  const states = list("STATE");
  const bumiputeraStatuses = list("BUMIPUTERA_STATUS");
  const numberingReady = !!series && patternFaults({ pattern: series.pattern, resetOn: series.resetOn as NumberingReset }).length === 0;
  const en = cfg.policy?.personalDataNoticeEn?.trim() ?? "";
  const ms = cfg.policy?.personalDataNoticeMs?.trim() ?? "";
  const limitsSet = cfg.policy?.portalDailyLimit != null && cfg.policy?.portalDailyLimitPerNumber != null;
  return {
    ready: true,
    missing: whatIsMissing({ today: org.today, entityTypeCodes: entityTypes.map((e) => e.value), countryCodes: countries.map((c) => c.value), stateCodes: states.map((x) => x.value), numberingReady, noticeSet: !!en && !!ms, limitsSet, formKeySet: formSecret() != null }),
    entityTypes,
    countries,
    states,
    bumiputeraStatuses,
    contactNeedsEmailAndPhone: cfg.policy?.contactNeedsEmailAndPhone ?? null,
    formatExample: cfg.format?.example?.trim() || null,
    notice: cfg.policy?.verificationNoticeEn?.trim() || null,
    personalDataNotice: en && ms ? { en, ms } : null,
  };
}
