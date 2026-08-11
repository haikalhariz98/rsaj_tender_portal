import { db } from "@/lib/db";

import type {
  AccountCode,
  CodeFormat,
  CostCentre,
  OrgUnit,
  OrgUnitKind,
  Provenance,
  Site,
} from "./types";

/**
 * Load an organisation's structure.
 *
 * Every revision is loaded, not only those in force today: `activeOn` and
 * `buildStructure` narrow to a date, and a matter re-rendered under the structure
 * that raised it needs the rows that have since been superseded.
 */
/// The loader adds the row id the editors need; the pure types stay free of it.
export type Stored<T> = T & { id: string };

export interface OrganisationData {
  units: Stored<OrgUnit>[];
  costCentres: Stored<CostCentre>[];
  accountCodes: Stored<AccountCode>[];
  sites: Stored<Site>[];
  formats: Stored<CodeFormat>[];
}

const EMPTY: OrganisationData = {
  units: [],
  costCentres: [],
  accountCodes: [],
  sites: [],
  formats: [],
};

export async function loadOrganisationData(
  organisationCode: string,
): Promise<OrganisationData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  // An unconfigured deployment has no structure. Every caller already tells the
  // difference between empty and unset, so this is not an error.
  if (!organisation) return EMPTY;

  const where = { organisationId: organisation.id };
  const orderBy = [{ sortOrder: "asc" as const }, { nameEn: "asc" as const }];

  const [units, costCentres, accountCodes, sites, formats] = await Promise.all([
    db.orgUnit.findMany({ where, orderBy }),
    db.costCentre.findMany({ where, orderBy }),
    db.accountCode.findMany({ where, orderBy }),
    db.site.findMany({ where, orderBy }),
    db.codeFormat.findMany({ where, orderBy: { key: "asc" } }),
  ]);

  return {
    units: units.map((u) => ({
      id: u.id,
      code: u.code,
      nameEn: u.nameEn,
      nameMs: u.nameMs,
      kind: u.kind as OrgUnitKind,
      parentCode: u.parentCode,
      costCentreCode: u.costCentreCode,
      governingSource: u.governingSource,
      provenance: u.provenance as Provenance,
      notes: u.notes,
      sortOrder: u.sortOrder,
      effectiveFrom: u.effectiveFrom,
      effectiveTo: u.effectiveTo,
    })),
    costCentres: costCentres.map((c) => ({
      id: c.id,
      code: c.code,
      nameEn: c.nameEn,
      nameMs: c.nameMs,
      provenance: c.provenance as Provenance,
      notes: c.notes,
      sortOrder: c.sortOrder,
      effectiveFrom: c.effectiveFrom,
      effectiveTo: c.effectiveTo,
    })),
    accountCodes: accountCodes.map((a) => ({
      id: a.id,
      code: a.code,
      nameEn: a.nameEn,
      nameMs: a.nameMs,
      provenance: a.provenance as Provenance,
      notes: a.notes,
      sortOrder: a.sortOrder,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
    })),
    sites: sites.map((s) => ({
      id: s.id,
      code: s.code,
      nameEn: s.nameEn,
      nameMs: s.nameMs,
      address: s.address,
      orgUnitCode: s.orgUnitCode,
      provenance: s.provenance as Provenance,
      notes: s.notes,
      sortOrder: s.sortOrder,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo,
    })),
    formats: formats.map((f) => ({
      id: f.id,
      key: f.key,
      pattern: f.pattern,
      example: f.example,
      description: f.description,
      provenance: f.provenance as Provenance,
    })),
  };
}
