/**
 * Officers, the offices they hold, and when.
 *
 * A rule routes to an office, never to a person. Only an assignment turns an office
 * into a signatory, and only for the period it covers — re-opening a decision made
 * last year has to find whoever held the office then, not whoever holds it today.
 */

import type { Effective } from "@/lib/effective";

export type { Effective };

export interface Person {
  id: string;
  staffNo: string | null;
  name: string;
  email: string | null;
  jobTitle: string | null;
  /// The same title in Malay, as written on the appointment letter.
  jobTitleMs: string | null;
  department: string | null;
  telephone: string | null;
  /// 6.7 (C-6): the unit the person sits in (an OrgUnit code). Optional on the type: only an opening panel's independence rule reads it.
  orgUnitCode?: string | null;
  /// The office this person is presented as holding in the portal, which is not
  /// necessarily the office the approval matrix routes to.
  portalRoleCode: string | null;
  /// Where they sit in the delegated authority. Blank where nobody has said.
  authorityLevel: string | null;
  /// False while they are away. Cover is a Delegation; this is only the signal.
  isAvailable: boolean;
  /// False for a leaver. A person is never deleted: decisions they voted on must keep
  /// resolving to a name.
  isActive: boolean;
}

/// An office that can hold authority. Matches the code an approval rule routes to.
export interface Office {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string;
  isCommittee: boolean;
  workspace: string;
  authorityLevel: string;
  escalatesToCode: string | null;
  selfApprovalEscalatesToCode: string | null;
  sortOrder: number;
}

export interface Assignment extends Effective {
  id: string;
  personId: string;
  roleCode: string;
  /// Set where the office is held per department rather than organisation-wide.
  scope: string | null;
}

/// An assignment with the person and office resolved, for rendering.
export interface Holding {
  assignment: Assignment;
  person: Person;
  office: Office | null;
}

/**
 * Something about the roster that stops authority resolving, or resolves it twice.
 *
 * Reported, never repaired. Which of two officers really holds an office, or who
 * should hold a vacant one, is a decision the organisation makes.
 */
export type RosterFault =
  | {
      kind: "VACANT";
      roleCode: string;
      /// True where an approval rule actually routes to this office, which is what
      /// turns a vacancy from untidy into blocking.
      routedTo: boolean;
    }
  | {
      kind: "OVERLAP";
      roleCode: string;
      scope: string | null;
      personNames: [string, string];
    }
  | {
      kind: "UNKNOWN_OFFICE";
      roleCode: string;
      personName: string;
    }
  | {
      kind: "INACTIVE_HOLDER";
      roleCode: string;
      personName: string;
    };
