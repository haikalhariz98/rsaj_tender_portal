/**
 * Reporting lines (FR-APR-010, FR-APR-011): who a person reports to, for a period.
 *
 * Configuration, and it ships EMPTY. No source names a reporting line and nothing derives one from a unit's head, so an organisation that has not entered
 * them has an UNSET line, and every rule that needs a superior says "reporting line not set" and does nothing, rather than guess. Three states, never two:
 *
 * - NOT_SET: no line is recorded for the person on the day;
 * - TOP: a line is recorded and says nobody is above them (a recorded fact, not an absence);
 * - SUPERIOR: a line is recorded and names the person's immediate superior.
 *
 * "Set" is a property of the organisation's data as well: `anyLineRecorded` is false until someone enters the first, and the screens say so in words.
 *
 * Pure.
 */

import { inForceOn, periodsOverlap, type Effective } from "@/lib/effective";

export interface ReportingLine extends Effective {
  id: string;
  personId: string;
  /// Null: recorded as having nobody above them.
  superiorPersonId: string | null;
}

export type LineState = { kind: "NOT_SET" } | { kind: "TOP" } | { kind: "SUPERIOR"; superiorPersonId: string };

/// The reporting line of a person on a day. A person with two lines in force (which the writer refuses) is read as not set: the data cannot say which.
export function lineOf(lines: readonly ReportingLine[], personId: string, on: Date): LineState {
  const inForce = lines.filter((l) => l.personId === personId && inForceOn(l, on));
  if (inForce.length !== 1) return { kind: "NOT_SET" };
  const only = inForce[0]!;
  return only.superiorPersonId ? { kind: "SUPERIOR", superiorPersonId: only.superiorPersonId } : { kind: "TOP" };
}

/// Whether the organisation has recorded any line at all. False is the shipped state: the rules that need lines then say they are not set.
export const anyLineRecorded = (lines: readonly ReportingLine[]): boolean => lines.length > 0;

/// The immediate superior on a day, or null where there is none to name (not set, or the head of the line).
export function immediateSuperior(lines: readonly ReportingLine[], personId: string, on: Date): string | null {
  const s = lineOf(lines, personId, on);
  return s.kind === "SUPERIOR" ? s.superiorPersonId : null;
}

/// Everyone whose recorded immediate superior is this person on a day.
export function directSubordinates(lines: readonly ReportingLine[], superiorId: string, on: Date): string[] {
  const ids = new Set(lines.filter((l) => l.superiorPersonId === superiorId && inForceOn(l, on)).map((l) => l.personId));
  return [...ids].filter((id) => lineOf(lines, id, on).kind === "SUPERIOR");
}

/// The chain above a person on a day, nearest first, stopping at the head of the line, at a line that is not set, or at a repeat (a loop the writer refuses).
export function chainAbove(lines: readonly ReportingLine[], personId: string, on: Date): { chain: string[]; ends: "TOP" | "NOT_SET" | "LOOP" } {
  const chain: string[] = [];
  const seen = new Set<string>([personId]);
  let current = personId;
  for (;;) {
    const s = lineOf(lines, current, on);
    if (s.kind === "TOP") return { chain, ends: "TOP" };
    if (s.kind === "NOT_SET") return { chain, ends: "NOT_SET" };
    if (seen.has(s.superiorPersonId)) return { chain, ends: "LOOP" };
    seen.add(s.superiorPersonId);
    chain.push(s.superiorPersonId);
    current = s.superiorPersonId;
  }
}

export type LineFault =
  | "SELF"
  | "ENDS_BEFORE_IT_STARTS"
  /// The person already has a line over part of this period.
  | "OVERLAPS_EXISTING"
  /// The superior reports, directly or through others, to the person: A above B above A.
  | "CYCLE";

/**
 * What is wrong with a proposed line. A cycle is looked for on every day the line could change anything: the proposal's own first day and the first day of
 * every other line that begins inside its period. On each such day the chain above the proposed superior must not arrive back at the person.
 */
export function lineFaults(proposed: ReportingLine, existing: readonly ReportingLine[]): LineFault[] {
  const faults: LineFault[] = [];
  if (proposed.superiorPersonId && proposed.superiorPersonId === proposed.personId) faults.push("SELF");
  if (proposed.effectiveTo && proposed.effectiveTo <= proposed.effectiveFrom) faults.push("ENDS_BEFORE_IT_STARTS");
  const others = existing.filter((l) => l.id !== proposed.id);
  if (others.some((l) => l.personId === proposed.personId && periodsOverlap(l, proposed))) faults.push("OVERLAPS_EXISTING");
  if (proposed.superiorPersonId && !faults.includes("SELF")) {
    const withProposal = [...others.filter((l) => !(l.personId === proposed.personId && periodsOverlap(l, proposed))), proposed];
    const days = [proposed.effectiveFrom, ...others.filter((l) => l.effectiveFrom > proposed.effectiveFrom && (proposed.effectiveTo == null || l.effectiveFrom < proposed.effectiveTo)).map((l) => l.effectiveFrom)];
    for (const day of days) {
      if (chainAbove(withProposal, proposed.superiorPersonId, day).chain.includes(proposed.personId)) {
        faults.push("CYCLE");
        break;
      }
    }
  }
  return faults;
}

export const LINE_FAULT_TEXT: Readonly<Record<LineFault, string>> = {
  SELF: "A person cannot report to themselves.",
  ENDS_BEFORE_IT_STARTS: "The line must end after it starts.",
  OVERLAPS_EXISTING: "This person already has a reporting line over part of that period. End it first, or edit it.",
  CYCLE: "That would make the line a loop: the person you chose reports, directly or through others, to this person.",
};

/// How a set of lines reads on a screen that needs a superior. Said once, so every screen uses the same words.
export const REPORTING_LINE_NOT_SET = "Reporting line not set";
export const REPORTING_LINE_NOT_SET_WHY = "No reporting line is recorded, so no one is named as an immediate superior and nothing is moved or promoted on the strength of one. Record the reporting lines under Configuration, Users & roles, Reporting lines.";

/**
 * Who is above the people who hold an office, said in words for an audit row or a notice (FR-APR-010: "names the immediate superior when set").
 * Not set is said as "Reporting line not set": the words that tell a reader nothing was derived from a unit head.
 */
export function superiorsNote(lines: readonly ReportingLine[], holderIds: readonly string[], on: Date, nameOf: (id: string) => string): { text: string; superiorIds: string[] } {
  if (!anyLineRecorded(lines)) return { text: `${REPORTING_LINE_NOT_SET}: no immediate superior is named.`, superiorIds: [] };
  const states = holderIds.map((id) => ({ id, state: lineOf(lines, id, on) }));
  const superiorIds = [...new Set(states.flatMap((s) => (s.state.kind === "SUPERIOR" ? [s.state.superiorPersonId] : [])))];
  const unset = states.filter((s) => s.state.kind === "NOT_SET").map((s) => nameOf(s.id));
  const said: string[] = [];
  if (superiorIds.length > 0) said.push(`Immediate superior on record: ${superiorIds.map(nameOf).join(", ")}.`);
  if (unset.length > 0) said.push(`${REPORTING_LINE_NOT_SET} for ${unset.join(", ")}.`);
  if (said.length === 0) said.push("The reporting line records nobody above the holders of this office.");
  return { text: said.join(" "), superiorIds };
}

/// The choice that records a person as having nobody above them. Not an empty box: "nobody above" is a recorded fact, distinct from "not set".
export const NO_SUPERIOR_CHOICE = "__none__";
