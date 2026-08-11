import type { Assignment, Office, Person } from "./types";
import type { Roster } from "./roster";

/**
 * A synthetic roster for testing.
 *
 * Not any real organisation's officers or offices. Every entry exercises one
 * behaviour: a plain holding, a vacancy, an office held twice at one scope, an office
 * held per department, a leaver still assigned, and an assignment naming an office
 * that does not exist.
 */

const person = (id: string, name: string, isActive = true): Person => ({
  id,
  staffNo: id.toUpperCase(),
  name,
  email: null,
  jobTitle: null,
  isActive,
});

const office = (code: string, sortOrder: number): Office => ({
  id: `office-${code}`,
  code,
  nameEn: code,
  nameMs: code,
  isCommittee: false,
  escalatesToCode: null,
  selfApprovalEscalatesToCode: null,
  sortOrder,
});

const assign = (
  id: string,
  personId: string,
  roleCode: string,
  from: string,
  to: string | null = null,
  scope: string | null = null,
): Assignment => ({
  id,
  personId,
  roleCode,
  scope,
  effectiveFrom: new Date(from),
  effectiveTo: to == null ? null : new Date(to),
});

export const PEOPLE: Person[] = [
  person("p1", "Holder One"),
  person("p2", "Holder Two"),
  person("p3", "Departed Officer", false),
  person("p4", "Scoped North"),
  person("p5", "Scoped South"),
];

export const OFFICES: Office[] = [
  office("SINGLE", 1),
  office("CONTESTED", 2),
  office("VACANT", 3),
  office("SCOPED", 4),
  office("LEFT", 5),
];

export const ASSIGNMENTS: Assignment[] = [
  assign("a1", "p1", "SINGLE", "2020-01-01"),

  // Two people at one scope over the same days.
  assign("a2", "p1", "CONTESTED", "2020-01-01"),
  assign("a3", "p2", "CONTESTED", "2020-01-01"),

  // The same office held per department is not a clash.
  assign("a4", "p4", "SCOPED", "2020-01-01", null, "north"),
  assign("a5", "p5", "SCOPED", "2020-01-01", null, "south"),

  // A leaver who was never unassigned.
  assign("a6", "p3", "LEFT", "2020-01-01"),

  // An assignment to an office nobody defined.
  assign("a7", "p2", "NO_SUCH_OFFICE", "2020-01-01"),

  // Ended before the date the tests ask about.
  assign("a8", "p2", "SINGLE", "2019-01-01", "2020-01-01"),
];

export const ROSTER: Roster = {
  people: PEOPLE,
  offices: OFFICES,
  assignments: ASSIGNMENTS,
};
