/**
 * What the public registration form needs to draw itself: the company types and countries the
 * register accepts, the format example for the registration number, the office's notice to
 * applicants, and whether the register is set up to take an application at all.
 *
 * Nothing about any supplier is read: no name, no number, no reference.
 */

import { db } from "@/lib/db";
import { patternFaults, type NumberingReset } from "@/lib/numbering/series";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { SUPPLIER_SERIES_KEY } from "@/lib/suppliers/types";

import { whatIsMissing } from "./apply";
import type { Words } from "./labels";

export interface RegistrationForm {
  /// No organisation is set up: nothing can be said.
  ready: boolean;
  /// What the register still lacks before it can take an application. Empty: it is open.
  missing: Words[];
  entityTypes: { value: string; label: string }[];
  countries: { value: string; label: string }[];
  formatExample: string | null;
  /// The office's own words to an applicant, where it has set them.
  notice: string | null;
}

export async function loadRegistrationForm(): Promise<RegistrationForm> {
  const org = await supplierOrg();
  if (!org) return { ready: false, missing: [], entityTypes: [], countries: [], formatExample: null, notice: null };
  const [cfg, series] = await Promise.all([loadSupplierConfig(org.id), db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: org.id, key: SUPPLIER_SERIES_KEY } }, select: { pattern: true, resetOn: true } })]);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  const entityTypes = list("ENTITY_TYPE");
  const countries = list("COUNTRY");
  const numberingReady = !!series && patternFaults({ pattern: series.pattern, resetOn: series.resetOn as NumberingReset }).length === 0;
  return {
    ready: true,
    missing: whatIsMissing({ today: org.today, entityTypeCodes: entityTypes.map((e) => e.value), countryCodes: countries.map((c) => c.value), numberingReady }),
    entityTypes,
    countries,
    formatExample: cfg.format?.example?.trim() || null,
    notice: cfg.policy?.verificationNoticeEn?.trim() || null,
  };
}
