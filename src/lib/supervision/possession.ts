/**
 * Possession of site (FR-SUP-005). Recorded once, on the day the site was given: it writes the POSSESSION
 * baseline version (the Date of Possession, and from it the date for completion) and moves the contract to
 * ACTIVE, the only act that does (6.12 condition). The contract must be fully executed (stamped, FR-CON-011):
 * 6.12's machine reaches ACTIVE only from STAMPED (BD-613-1).
 *
 * The contract type's start-of-work behaviour (FR-MTD-012, BD-612-22, ruled at 6.13 planning), read from the type
 * when possession is recorded and frozen with it:
 * - true: possession is refused until the performance bond and each required policy are verified (the readiness
 *   gate's bond and insurance items, sums insured included), naming what is missing;
 * - false: allowed, and the record shows the type starts without securities;
 * - null: not set, and it blocks, naming the setting. Pure.
 */

import type { Day, Finding } from "./types";

export type PossessionFault = "NOT_STAMPED" | "ALREADY_POSSESSED" | "FUTURE_DATE" | "BEFORE_CONTRACT_DATE" | "START_RULE_NOT_SET" | "SECURITIES_NOT_MET" | "NO_BASELINE_VERSION" | "NO_SO" | "BEFORE_SO";

export interface GateItemFacts {
  key: string;
  state: string;
  detail: readonly string[];
}

export function possessionFaults(i: {
  status: string;
  possessed: boolean;
  versions: number;
  on: Day;
  today: Day;
  /// The Contract Date (named apart so the single-writer scan reads only its writers).
  datedOn: Day | null;
  startRequiresSecurities: boolean | null;
  typeName: string | null;
  /// The first S.O. assignment's effective day (review 1; `soFromOf`): no possession before anyone supervises the
  /// site. Null: no S.O. at all. Required (6.13A residual D2): every caller, the act and the Site tab's preview,
  /// asks, so the drawer is never offered where the act would refuse.
  soFrom: Day | null;
  gate: readonly GateItemFacts[];
}): Finding<PossessionFault>[] {
  const out: Finding<PossessionFault>[] = [];
  const f = (code: PossessionFault, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.possessed) f("ALREADY_POSSESSED");
  else if (i.status !== "STAMPED") f("NOT_STAMPED", { status: i.status });
  if (i.versions === 0) f("NO_BASELINE_VERSION");
  if (i.on > i.today) f("FUTURE_DATE", { day: i.on });
  if (i.datedOn && i.on < i.datedOn) f("BEFORE_CONTRACT_DATE", { day: i.datedOn });
  if (i.soFrom === null) f("NO_SO");
  else if (i.on < i.soFrom) f("BEFORE_SO", { day: i.soFrom });
  if (i.startRequiresSecurities == null) f("START_RULE_NOT_SET", { type: i.typeName });
  else if (i.startRequiresSecurities) {
    for (const key of ["BOND", "INSURANCE"]) {
      const item = i.gate.find((g) => g.key === key);
      if (!item || item.state !== "MET") f("SECURITIES_NOT_MET", { item: key, state: item?.state ?? "NOT_SET" });
    }
  }
  return out;
}

/// The day the first S.O. assignment takes effect (the earliest effective day); null: none.
export function soFromOf(assignments: readonly { effectiveOn: Day }[]): Day | null {
  return assignments.reduce<Day | null>((m, a) => (m == null || a.effectiveOn < m ? a.effectiveOn : m), null);
}

/// What the possession record freezes about its start-of-work rule.
export function startRuleReading(startRequiresSecurities: boolean | null): "SECURITIES_FIRST" | "WITHOUT_SECURITIES" | "NOT_SET" {
  return startRequiresSecurities == null ? "NOT_SET" : startRequiresSecurities ? "SECURITIES_FIRST" : "WITHOUT_SECURITIES";
}
