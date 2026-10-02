/**
 * FR-OPN-001, 002 and FR-CTE-011 (C-6): the opening panel. Opening committees are ordinary 6.10
 * committees; the method names the body (`openingCommitteeCode`, null blocks naming the setting).
 * The panel is picked from the seats in force on the opening day, with each member's presence.
 *
 * - The panel's size is the committee's `panelSize`, no default: unset blocks (FR-OPN-002; "two" is a
 *   customer's rule, seeded at go-live). A panel of another size needs an override: the authority it
 *   is assigned under, the reason and the Person recording it, frozen on the opening.
 * - The independence rule (FR-CTE-011, C-6): null assigns the panel with the warning "Independence
 *   rule not set; panel not checked", frozen on the opening; on, a member of the excluded unit (or a
 *   unit under it) is refused, and a member whose unit is not recorded blocks; off, nothing is asked.
 * - Two present members are needed to authorise the opening at all (FR-OPN-003), so a panel with
 *   fewer present cannot open the box.
 * Pure.
 */

import type { Finding } from "./types";

/// A person who holds a seat of the committee on the opening day (resolved by the caller from the seats in force).
export interface SeatHolder {
  personId: string;
  committeeMemberId: string;
  seatLabel: string;
}

export interface PanelPick {
  personId: string;
  name: string;
  present: boolean;
  active: boolean;
  /// The person's unit as recorded on them; null: not recorded.
  orgUnitCode: string | null;
}

export interface PanelPolicy {
  panelSize: number | null;
  exclusionRule: boolean | null;
  excludedUnitCode: string | null;
}

export interface PanelOverride {
  authority: string;
  reason: string;
  personId: string | null;
  personActive: boolean;
}

export type PanelFault =
  | "COMMITTEE_NOT_SET"
  | "COMMITTEE_NOT_FOUND"
  | "PANEL_EMPTY"
  | "PICKED_TWICE"
  | "NOT_ON_COMMITTEE"
  | "PERSON_INACTIVE"
  | "PANEL_SIZE_NOT_SET"
  | "PANEL_SIZE_DIFFERS"
  | "PANEL_SIZE_OVERRIDDEN"
  | "OVERRIDE_AUTHORITY_REQUIRED"
  | "OVERRIDE_REASON_REQUIRED"
  | "OVERRIDE_PERSON_REQUIRED"
  | "FEWER_THAN_TWO_PRESENT"
  | "MEMBER_ABSENT"
  | "EXCLUSION_RULE_NOT_SET"
  | "EXCLUDED_UNIT_NOT_SET"
  | "MEMBER_IN_EXCLUDED_UNIT"
  | "UNIT_NOT_RECORDED";

export function panelFaults(i: {
  /// The method's opening committee code, as frozen or read; null: not set.
  committeeCode: string | null;
  /// The committee it names, where it exists and is not retired.
  committee: { name: string } | null;
  seats: readonly SeatHolder[];
  picked: readonly PanelPick[];
  policy: PanelPolicy;
  /// A panel of another size than the committee's: how it is authorised. Null: none given.
  override: PanelOverride | null;
  /// The unit and every unit above it, for the independence rule (a member of a unit under the excluded one is in it).
  unitPath: (code: string) => readonly string[];
}): Finding<PanelFault>[] {
  const out: Finding<PanelFault>[] = [];
  const f = (code: PanelFault, level: Finding["level"] = "block", data?: Finding["data"]) => out.push({ code, level, ...(data ? { data } : {}) });
  if (!i.committeeCode) return [{ code: "COMMITTEE_NOT_SET", level: "block" }];
  if (!i.committee) return [{ code: "COMMITTEE_NOT_FOUND", level: "block" }];
  if (i.picked.length === 0) return [{ code: "PANEL_EMPTY", level: "block" }];

  const seen = new Set<string>();
  for (const p of i.picked) {
    if (seen.has(p.personId)) f("PICKED_TWICE", "block", { person: p.name });
    seen.add(p.personId);
    if (!i.seats.some((s) => s.personId === p.personId)) f("NOT_ON_COMMITTEE", "block", { person: p.name });
    if (!p.active) f("PERSON_INACTIVE", "block", { person: p.name });
    if (!p.present) f("MEMBER_ABSENT", "warn", { person: p.name });
  }

  // FR-OPN-002: the committee's size, no default; another size only on a recorded override.
  const size = i.policy.panelSize;
  if (size == null) f("PANEL_SIZE_NOT_SET");
  else if (seen.size !== size) {
    const o = i.override;
    const complete = o != null && o.authority.trim() !== "" && o.reason.trim() !== "" && o.personId != null && o.personActive;
    if (!o) f("PANEL_SIZE_DIFFERS", "block", { required: size, picked: seen.size });
    else if (!complete) {
      if (!o.authority.trim()) f("OVERRIDE_AUTHORITY_REQUIRED");
      if (!o.reason.trim()) f("OVERRIDE_REASON_REQUIRED");
      if (!o.personId || !o.personActive) f("OVERRIDE_PERSON_REQUIRED");
    } else f("PANEL_SIZE_OVERRIDDEN", "warn", { required: size, picked: seen.size });
  }

  // FR-OPN-003: two distinct members present, or the box can never be opened.
  if (new Set(i.picked.filter((p) => p.present).map((p) => p.personId)).size < 2) f("FEWER_THAN_TWO_PRESENT");

  // FR-CTE-011 (C-6): the independence rule.
  if (i.policy.exclusionRule == null) f("EXCLUSION_RULE_NOT_SET", "warn");
  else if (i.policy.exclusionRule) {
    const excluded = i.policy.excludedUnitCode;
    if (!excluded) f("EXCLUDED_UNIT_NOT_SET");
    else
      for (const p of i.picked) {
        if (!p.orgUnitCode) f("UNIT_NOT_RECORDED", "block", { person: p.name });
        else if (p.orgUnitCode === excluded || i.unitPath(p.orgUnitCode).includes(excluded)) f("MEMBER_IN_EXCLUDED_UNIT", "block", { person: p.name });
      }
  }
  return out;
}

/// Whether the panel is checked for independence, in words for the frozen snapshot (C-6).
export const independenceState = (rule: boolean | null): "NOT_SET" | "CHECKED" | "NOT_REQUIRED" => (rule == null ? "NOT_SET" : rule ? "CHECKED" : "NOT_REQUIRED");
