import type { ContractType, FundingRoute, SourcingMethod } from "./types";

/**
 * Synthetic reference data for testing.
 *
 * Deliberately not any real organisation's code lists. The point of these functions
 * is that they apply whatever vocabulary they are handed, and a fixture copied from
 * one customer's policy quietly turns that customer's arrangement into the tests'
 * definition of correct. Each entry here exists to exercise one behaviour.
 */

const funding = (r: Partial<FundingRoute> & Pick<FundingRoute, "code">): FundingRoute => ({
  nameEn: r.code,
  nameMs: null,
  organisationProcures: true,
  routeDecidedExternally: false,
  supersedesAuthority: false,
  trigger: "",
  governingSource: "",
  provenance: "STATED",
  notes: "",
  sortOrder: 0,
  retiredOn: null,
  ...r,
});

const method = (m: Partial<SourcingMethod> & Pick<SourcingMethod, "code">): SourcingMethod => ({
  nameEn: m.code,
  nameMs: null,
  availableInTender: false,
  availableInQuotation: false,
  availableBelow: false,
  requiresAdvertisement: false,
  invitesNamedSuppliers: false,
  requiresFreshSourcing: true,
  awardInstrument: "",
  committeeCode: null,
  authorityMethodKey: null,
  governingSource: "",
  provenance: "STATED",
  notes: "",
  sortOrder: 0,
  retiredOn: null,
  ...m,
});

const contract = (c: Partial<ContractType> & Pick<ContractType, "code">): ContractType => ({
  nameEn: c.code,
  nameMs: null,
  governingSource: "",
  provenance: "STATED",
  notes: "",
  sortOrder: 0,
  retiredOn: null,
  ...c,
});

/// In-house, external-route and records-only, which are the three postures.
export const FUNDING_ROUTES: FundingRoute[] = [
  funding({ code: "inhouse", nameEn: "In-house", sortOrder: 1 }),
  funding({
    code: "external_route",
    nameEn: "Funder sets the route",
    routeDecidedExternally: true,
    sortOrder: 2,
  }),
  funding({
    code: "records_only",
    nameEn: "Supervision only",
    organisationProcures: false,
    supersedesAuthority: true,
    sortOrder: 3,
  }),
  funding({
    code: "overridden",
    nameEn: "Funder's rules prevail",
    supersedesAuthority: true,
    provenance: "ASSUMED",
    sortOrder: 4,
  }),
  funding({
    code: "withdrawn",
    nameEn: "Withdrawn route",
    retiredOn: new Date("2026-01-01"),
    sortOrder: 5,
  }),
];

/// One method per band, one available everywhere, one banded nowhere, one that calls
/// off an existing contract instead of sourcing afresh.
export const SOURCING_METHODS: SourcingMethod[] = [
  method({
    code: "open_high",
    nameEn: "Open, upper band",
    availableInTender: true,
    requiresAdvertisement: true,
    authorityMethodKey: "open",
    sortOrder: 1,
  }),
  method({
    code: "invited_mid",
    nameEn: "Invited, middle band",
    availableInQuotation: true,
    invitesNamedSuppliers: true,
    sortOrder: 2,
  }),
  method({
    code: "direct_any",
    nameEn: "Direct, any value",
    availableInTender: true,
    availableInQuotation: true,
    availableBelow: true,
    sortOrder: 3,
  }),
  method({
    code: "called_off",
    nameEn: "Called off an existing contract",
    availableInTender: true,
    availableInQuotation: true,
    availableBelow: true,
    requiresFreshSourcing: false,
    sortOrder: 4,
  }),
  method({ code: "unbanded", nameEn: "Banded nowhere", provenance: "ASSUMED", sortOrder: 5 }),
];

export const CONTRACT_TYPES: ContractType[] = [
  contract({ code: "works", nameEn: "Works", sortOrder: 1 }),
  contract({ code: "services", nameEn: "Services", provenance: "ASSUMED", sortOrder: 2 }),
];
