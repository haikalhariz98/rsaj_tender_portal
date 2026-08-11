import { db } from "@/lib/db";

import type { ContractType, FundingRoute, Provenance, SourcingMethod } from "./types";

/**
 * Load an organisation's configured vocabulary.
 *
 * Retired entries are loaded rather than filtered out: a screen showing what is in
 * force today and a matter re-rendering the route it was actually run under need the
 * same rows. `activeOn` in `vocabulary.ts` does the narrowing, at a date.
 */
export interface ReferenceData {
  fundingRoutes: FundingRoute[];
  sourcingMethods: SourcingMethod[];
  contractTypes: ContractType[];
}

const EMPTY: ReferenceData = { fundingRoutes: [], sourcingMethods: [], contractTypes: [] };

export async function loadReferenceData(organisationCode: string): Promise<ReferenceData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  // No organisation is not an error here. An unconfigured deployment has an empty
  // vocabulary, and every caller already distinguishes empty from unset.
  if (!organisation) return EMPTY;

  const where = { organisationId: organisation.id };
  const orderBy = [{ sortOrder: "asc" as const }, { nameEn: "asc" as const }];

  const [fundingRoutes, sourcingMethods, contractTypes] = await Promise.all([
    db.fundingRoute.findMany({ where, orderBy }),
    db.sourcingMethod.findMany({ where, orderBy }),
    db.contractType.findMany({ where, orderBy }),
  ]);

  return {
    fundingRoutes: fundingRoutes.map((r) => ({
      code: r.code,
      nameEn: r.nameEn,
      nameMs: r.nameMs,
      organisationProcures: r.organisationProcures,
      routeDecidedExternally: r.routeDecidedExternally,
      supersedesAuthority: r.supersedesAuthority,
      trigger: r.trigger,
      governingSource: r.governingSource,
      provenance: r.provenance as Provenance,
      notes: r.notes,
      sortOrder: r.sortOrder,
      retiredOn: r.retiredOn,
    })),
    sourcingMethods: sourcingMethods.map((m) => ({
      code: m.code,
      nameEn: m.nameEn,
      nameMs: m.nameMs,
      availableInTender: m.availableInTender,
      availableInQuotation: m.availableInQuotation,
      availableBelow: m.availableBelow,
      requiresAdvertisement: m.requiresAdvertisement,
      invitesNamedSuppliers: m.invitesNamedSuppliers,
      requiresFreshSourcing: m.requiresFreshSourcing,
      awardInstrument: m.awardInstrument,
      committeeCode: m.committeeCode,
      authorityMethodKey: m.authorityMethodKey,
      governingSource: m.governingSource,
      provenance: m.provenance as Provenance,
      notes: m.notes,
      sortOrder: m.sortOrder,
      retiredOn: m.retiredOn,
    })),
    contractTypes: contractTypes.map((c) => ({
      code: c.code,
      nameEn: c.nameEn,
      nameMs: c.nameMs,
      governingSource: c.governingSource,
      provenance: c.provenance as Provenance,
      notes: c.notes,
      sortOrder: c.sortOrder,
      retiredOn: c.retiredOn,
    })),
  };
}
