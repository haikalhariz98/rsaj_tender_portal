/**
 * The vocabulary the rest of the system routes on.
 *
 * These are the values that reach `ResolveQuery` as bare strings — funding route and
 * sourcing method — given a configured shape so that what each one *implies* travels
 * with it. A code list that only carries labels pushes the decisions back into code,
 * which is what this module exists to prevent.
 */

/// Mirrors the Prisma enum. Repeated here so `src/lib/**` stays free of the client.
export type Provenance = "STATED" | "OBSERVED" | "ASSUMED";

export interface FundingRoute {
  code: string;
  nameEn: string;
  nameMs: string | null;
  organisationProcures: boolean;
  routeDecidedExternally: boolean;
  supersedesAuthority: boolean;
  /// Whether a matter on this route waits for an external body's authority to be
  /// recorded (FR-REQ-005), and what that authority is called.
  requiresExternalAuthorityRef?: boolean;
  externalAuthorityRefLabel?: string | null;
  /// Whether approving a matter on this route commits the organisation's budget. Null: not set.
  approvalCommitsBudget?: boolean | null;
  approvalCommitsBudgetProvenance?: Provenance | null;
  trigger: string;
  governingSource: string;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface SourcingMethod {
  code: string;
  nameEn: string;
  nameMs: string | null;
  availableInTender: boolean;
  availableInQuotation: boolean;
  availableBelow: boolean;
  requiresAdvertisement: boolean;
  invitesNamedSuppliers: boolean;
  requiresFreshSourcing: boolean;
  awardInstrument: string;
  committeeCode: string | null;
  authorityMethodKey: string | null;
  governingSource: string;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface ContractType {
  code: string;
  nameEn: string;
  nameMs: string | null;
  governingSource: string;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
  retiredOn: Date | null;
}

/**
 * What a funding route means for the work that follows.
 *
 * The distinction that matters is not how the money arrives but whether this
 * organisation runs the procurement. Under some routes it appoints nobody, and a
 * system that offered a sourcing exercise anyway would be inviting an officer to
 * run a process that is not theirs to run.
 */
export type FundingPosture =
  /// The organisation procures, and chooses how.
  | "PROCURES"
  /// The organisation procures, but an external body decides the route.
  | "ROUTE_SET_EXTERNALLY"
  /// The organisation does not procure. It records eligibility, inspection and
  /// acceptance against someone else's appointment.
  | "RECORDS_ONLY";

/**
 * Whether a list has been configured at all.
 *
 * An empty list is not a list of zero entries — it is a list nobody has filled in.
 * The same three-state honesty the quorum assessment uses: a screen that renders
 * "no sourcing methods" the same way it renders a deliberate single-method policy
 * overstates what it knows.
 */
export type ListState = "UNSET" | "CONFIGURED";

export interface ListReadiness {
  state: ListState;
  /// Entries in force on the date assessed.
  active: number;
  /// Of those, how many rest on nothing better than a working default.
  assumed: number;
  /// True where at least one active entry is ASSUMED — the list is usable but not
  /// yet signed off.
  needsSignOff: boolean;
}
