/**
 * Test fixtures for the opening rules. Invented; never seeded, never loaded by the demo. The closing
 * is the plan's worked example: 17 Nov 2026, 14:30 in Kuala Lumpur (06:30 UTC).
 */

import type { OpeningChecklist } from "./checklist";
import type { OpeningState } from "./state";

export const TZ = "Asia/Kuala_Lumpur";
export const CLOSING = new Date("2026-11-17T06:30:00.000Z");
export const S = 1000;
export const at = (ms: number) => new Date(CLOSING.getTime() + ms);

/// An opening whose box is open and whose sitting is authorised.
export const open = (over: Partial<OpeningState> = {}): OpeningState => ({ kind: "MAIN", cancelled: false, finalised: false, unsealed: true, adjourned: false, sittingAuthorised: true, sittingNo: 1, ...over });

export const PANEL = [
  { personId: "p1", present: true },
  { personId: "p2", present: true },
  { personId: "p3", present: false },
];

export const CHECKLIST: OpeningChecklist = {
  items: [
    { key: "form", label: "Form of tender", source: "PART" },
    { key: "decl", label: "Declaration", source: "PART" },
    { key: "addendum:1", label: "Addendum 1: Clarification", source: "ADDENDUM" },
  ],
  notJudged: [],
  notReturned: ["Conditions of contract"],
};

export const answers = (a: Record<string, "PRESENT" | "ABSENT" | "NOT_APPLICABLE">) => new Map(Object.entries(a));
export const ALL_PRESENT = answers({ form: "PRESENT", decl: "PRESENT", "addendum:1": "PRESENT" });
