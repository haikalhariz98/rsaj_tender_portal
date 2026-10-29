/**
 * The payment waterfall (6.13 Part A step 3: FR-PAY-015; §8.4; OD-A4 A as ruled).
 *
 * Where the payment recommended is not enough for everyone, it goes in the stated order: first the nominated
 * sub-contractors and nominated suppliers, together, pro rata within that tier; then the assignees, each in turn up
 * to what its deed makes due; then the contractor, from what is left. The pro-rata share is
 * recommended × (amount due ÷ the tier's total due) (OD-A4 A, ASSUMED, shown: the source's literal wording does not
 * sum to one; a question to the customer). Shares are worked out exactly in sen; the sen a split leaves over go by
 * the organisation's remainder rule (largest remainder, or all to the first party) — unset, a split that leaves
 * any is refused (NOT_SET), never guessed. Pure: sen as bigint, no float.
 */

import type { Sen } from "@/lib/money";

import type { Finding, WaterfallRemainder } from "./types";

export interface WaterfallParty {
  id: string;
  tier: "NOMINATED" | "ASSIGNEE";
  /// The amount due to it on this certificate (B1: totals only, keyed from its valuation or claim).
  due: Sen;
}

export interface Allocation {
  id: string;
  due: Sen;
  paid: Sen;
  /// For a nominated party split pro rata: its exact share as a fraction, for the screen ("pot × due ÷ tier").
  proRata: { num: Sen; den: Sen } | null;
}

export interface Waterfall {
  pot: Sen;
  sufficient: boolean;
  /// The tier's total due, the pro-rata denominator (OD-A4 A).
  nominatedDue: Sen;
  allocations: Allocation[];
  contractor: Sen;
  /// The sen a pro-rata split left over and how they went. Zero: the split was exact.
  remainderSen: Sen;
  faults: Finding[];
}

/**
 * Close-out stage C review, ruling 4: a nominated tier (sub-contractors, suppliers) with value on the certificate and no live party of its kind on
 * the contract would pay that tier's share to the main contractor, since the waterfall splits only among the parties it is given. Refused by name
 * (NOMINATED_PARTY_NOT_RECORDED, naming the tier), on the interim and on the final account alike. `liveKinds`: the kinds of the contract's live parties.
 */
export function nominatedPartyFaults(tierValue: { NSC: Sen; NS: Sen }, liveKinds: readonly string[]): Finding[] {
  const kindOf = { NSC: "NOMINATED_SUBCONTRACTOR", NS: "NOMINATED_SUPPLIER" } as const;
  return (["NSC", "NS"] as const).filter((t) => tierValue[t] > 0n && !liveKinds.includes(kindOf[t])).map((t) => ({ code: "NOMINATED_PARTY_NOT_RECORDED", level: "block", data: { tier: t } }));
}

export function waterfall(pot: Sen, parties: readonly WaterfallParty[], rule: WaterfallRemainder | null): Waterfall {
  const faults: Finding[] = [];
  const nominated = parties.filter((p) => p.tier === "NOMINATED");
  const assignees = parties.filter((p) => p.tier === "ASSIGNEE");
  const nominatedDue = nominated.reduce((a, p) => a + p.due, 0n);
  const totalDue = parties.reduce((a, p) => a + p.due, 0n);
  if (pot < 0n) return { pot, sufficient: false, nominatedDue, allocations: parties.map((p) => ({ id: p.id, due: p.due, paid: 0n, proRata: null })), contractor: 0n, remainderSen: 0n, faults: [{ code: "NOTHING_TO_PAY", level: "block" }] };
  if (parties.some((p) => p.due < 0n)) faults.push({ code: "DUE_NEGATIVE", level: "block" });
  let left = pot;
  const out = new Map<string, Allocation>();
  let remainderSen = 0n;
  if (left >= nominatedDue) {
    for (const p of nominated) out.set(p.id, { id: p.id, due: p.due, paid: p.due, proRata: null });
    left -= nominatedDue;
  } else {
    // Pro rata within the tier: pot × due ÷ Σ due, exactly; the floor first, then the sen left over by the rule.
    const shares = nominated.map((p, order) => ({ p, order, floor: (left * p.due) / nominatedDue, rem: (left * p.due) % nominatedDue }));
    remainderSen = left - shares.reduce((a, s) => a + s.floor, 0n);
    if (remainderSen > 0n && rule == null) faults.push({ code: "REMAINDER_RULE_NOT_SET", level: "block", data: { sen: remainderSen.toString() } });
    const extra = new Map<string, Sen>();
    if (remainderSen > 0n && rule === "FIRST_PARTY") extra.set(shares[0].p.id, remainderSen);
    if (remainderSen > 0n && rule === "LARGEST_REMAINDER") {
      const byRem = [...shares].sort((a, b) => (a.rem === b.rem ? a.order - b.order : a.rem > b.rem ? -1 : 1));
      for (let k = 0n; k < remainderSen; k++) extra.set(byRem[Number(k)].p.id, (extra.get(byRem[Number(k)].p.id) ?? 0n) + 1n);
    }
    for (const s of shares) out.set(s.p.id, { id: s.p.id, due: s.p.due, paid: s.floor + (extra.get(s.p.id) ?? 0n), proRata: { num: s.p.due, den: nominatedDue } });
    left = 0n;
  }
  for (const p of assignees) {
    const paid = left >= p.due ? p.due : left;
    out.set(p.id, { id: p.id, due: p.due, paid, proRata: null });
    left -= paid;
  }
  return { pot, sufficient: pot >= totalDue, nominatedDue, allocations: parties.map((p) => out.get(p.id)!), contractor: left, remainderSen, faults };
}
