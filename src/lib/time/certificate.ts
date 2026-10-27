/**
 * The EOT certificate's figures (6.13 Part B run 1b design note §6.6): the scope, the previous date for completion, the
 * days granted (and the reasons' computed days, assumed), the new date, and the period not extended where best
 * endeavours were met in part. Pure. No money, and none overridable: the days are the officer's own statement.
 */

import type { ComputedSnapshot, FigureLine } from "@/lib/certificate/snapshot";

import type { Day } from "./types";

export interface EotFigures {
  today: Day;
  scope: "WHOLE" | "SECTION";
  sectionRef: string | null;
  previous: Day;
  granted: number;
  computed: number;
  next: Day;
  unextendedNote: string;
}

export function eotSnapshot(f: EotFigures): ComputedSnapshot {
  const line = (key: string, labelEn: string, type: FigureLine["type"], value: string): FigureLine => ({ key, labelEn, type, value, overridable: false });
  const lines = [
    line("eotScope", "Extended", "TEXT", f.scope === "SECTION" ? `Section ${f.sectionRef}` : "The whole works"),
    line("eotPreviousCompletion", "Previous date for completion", "DATE", f.previous),
    line("eotGrantedDays", "Extension granted (days)", "DAYS", String(f.granted)),
    line("eotComputedDays", "The reasons' extension, computed (days)", "DAYS", String(f.computed)),
    line("eotNewCompletion", "New date for completion", "DATE", f.next),
  ];
  if (f.unextendedNote.trim()) lines.push(line("eotUnextended", "Period not extended", "TEXT", f.unextendedNote.trim()));
  return { version: 1, computedOn: f.today, rule: { en: "The previous date for completion plus the days granted, in calendar days." }, lines, totals: [], routingRatio: null };
}
