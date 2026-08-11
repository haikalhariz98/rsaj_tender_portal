/**
 * The structure every other rule is written against.
 *
 * Effective-dated throughout, because a reorganisation is a revision. A requisition
 * raised under last year's departments must still render under last year's
 * departments; re-parenting it into today's structure would misreport who asked for
 * what, which is precisely the sort of quiet rewriting an audit trail exists to stop.
 */

/// Mirrors the Prisma enums. Repeated so `src/lib/**` stays free of the client.
export type Provenance = "STATED" | "OBSERVED" | "ASSUMED";
export type OrgUnitKind = "COMPANY" | "DIVISION" | "DEPARTMENT" | "SECTION";

/// Everything in this module is in force over a period rather than simply present.
export interface Effective {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface OrgUnit extends Effective {
  code: string;
  nameEn: string;
  nameMs: string | null;
  kind: OrgUnitKind;
  parentCode: string | null;
  costCentreCode: string | null;
  governingSource: string;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
}

export interface CostCentre extends Effective {
  code: string;
  nameEn: string;
  nameMs: string | null;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
}

export interface AccountCode extends Effective {
  code: string;
  nameEn: string;
  nameMs: string | null;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
}

export interface Site extends Effective {
  code: string;
  nameEn: string;
  nameMs: string | null;
  address: string;
  orgUnitCode: string | null;
  provenance: Provenance;
  notes: string;
  sortOrder: number;
}

export interface CodeFormat {
  key: string;
  pattern: string;
  example: string;
  description: string;
  provenance: Provenance;
}

/// A unit with its children resolved, for rendering the structure as a tree.
export interface UnitNode {
  unit: OrgUnit;
  depth: number;
  children: UnitNode[];
}

/**
 * A structure that cannot be drawn as stated.
 *
 * Not an error the system may correct. A unit whose parent expired before it did is
 * a real configuration mistake with a real answer — which the customer knows and the
 * portal does not — so it is reported and the unit is shown detached rather than
 * quietly re-rooted.
 */
export type StructureFault =
  | {
      kind: "DETACHED";
      code: string;
      /// The parent it names, which is not in force on the date asked about.
      parentCode: string;
    }
  | {
      kind: "CYCLE";
      /// The codes that form the loop, in the order they were walked.
      codes: string[];
    };

export interface Structure {
  roots: UnitNode[];
  /// Units that name a parent not in force. Shown, never hidden.
  detached: UnitNode[];
  faults: StructureFault[];
}

/**
 * Whether a code satisfies its configured format.
 *
 * `NO_FORMAT` is deliberately not `OK`. Nobody has said what a cost centre looks
 * like here, so the portal cannot certify that this one is right — the same
 * distinction the quorum assessment draws between met and not set.
 */
export type CodeCheck =
  | { state: "OK" }
  | { state: "NO_FORMAT" }
  | { state: "MALFORMED"; example: string; description: string }
  /// The configured pattern is not a usable regular expression. A customer's typo
  /// must not read as every code being valid, nor bring the screen down.
  | { state: "BAD_PATTERN"; pattern: string };
