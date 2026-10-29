/**
 * The final account (Phase 2 close-out stage C; plan closeout-plan.md CO-8, §4.6; spec §8.8, CPD/SFA(T); 6.13 plan B5 `final/account.ts`).
 * Pure: sen as bigint, days as strings, no clock.
 *
 *   final sum    = the original contract sum + the net of the issued adjustments (FR-FIN-003; never keyed)
 *   less         = previous interim payments + retention released (main, NSC, NS) + the advance repaid (main, NSC)
 *   deduct       = damages net of waivers and credits ± rounding + the deductions (premiums and PERKESO, wages, non-compliance, making-good
 *                  costs, diminution in value, up to three others)
 *   recommended  = final sum − less − deduct
 *
 * What the contractor has been paid is the interims' payments plus the advance. The released retention is inside the interims: an interim's
 * carry-forward pays what was released by its valuation day, so the less block's retention lines are that part of the interims' figure, shown
 * apart, never counted twice. A release after the last interim was paid by nothing, so the final pays it (it is not in the less block).
 *
 * `finalPreviousBasis` (OD-B9) only changes how the blocks print; the recommended payment is the same either way (the property test holds both
 * against what the contractor is owed less what it was paid):
 * - BEFORE_DEDUCTIONS: previous = each interim's carry-forward (before its deductions). The deductions those interims took are already off
 *   what was paid, so the deduct block carries only what no interim took, and the advance line is what is still unrecouped.
 * - AS_PAID: previous = each interim's payment recommended, as paid. The deduct block carries every deduction, those the interims took
 *   included, and the advance line is the whole advance.
 * The plan's and OD-B9's parenthetical put the two readings the other way round; that wording double counts or misses the interims'
 * deductions, and the binding test (both readings, the same recommended) holds only this way (decision recorded in the stage C report).
 */

import { ladRoundingFaults } from "@/lib/lad/rounding";
import type { Sen } from "@/lib/money";
import type { WaterfallRemainder } from "@/lib/payment/types";
import { nominatedPartyFaults, waterfall, type Waterfall } from "@/lib/payment/waterfall";
import type { ContractPartyKind } from "@/lib/supervision/types";

import type { Finding, FinalBasis, FinalBlock, FinalLineKind, KeyedFinalKind } from "./types";

type Tiers = { MAIN: Sen; NSC: Sen; NS: Sen };

/// An issued interim certificate, as the final account reads it (its figures as issued).
export interface FinalInterim {
  certificateId: string;
  number: string | null;
  carryForward: Sen;
  recommended: Sen;
  /// Its damages: gross charged, waived, returned on extension of time (credit), and the rounding.
  lad: { gross: Sen; waived: Sen; credit: Sen; rounding: Sen };
  advance: { MAIN: Sen; NSC: Sen };
  premiums: Sen;
  wages: Sen;
  nonCompliance: Sen;
  others: Sen;
  /// Retention released to its valuation day, which its carry-forward (and the earlier ones') paid.
  released: Tiers;
}

export interface FinalAccountInput {
  basis: FinalBasis;
  originalSum: Sen;
  adjustments: readonly { id: string; net: Sen }[];
  interims: readonly FinalInterim[];
  /// The issued advance payment certificates.
  advances: readonly { id: string; party: "MAIN" | "NSC"; amount: Sen }[];
  /// The damages the final account charges itself: the days no interim charged, the approved waivers it applies, the credits now due.
  ladNow: { gross: Sen; waived: Sen; credit: Sen; waiverIds: readonly string[]; waiverRefs: readonly string[] };
  /// Premiums the employer paid that no certificate recovered yet.
  pending: readonly { id: string; amount: Sen }[];
  keyed: readonly { kind: KeyedFinalKind; label: string; amount: Sen }[];
}

export interface FinalLine {
  block: FinalBlock;
  kind: FinalLineKind;
  amount: Sen;
  label: string;
  sourceIds: string[];
  keyed: boolean;
}

export interface FinalAccount {
  originalSum: Sen;
  netAdjustment: Sen;
  finalSum: Sen;
  less: Sen;
  deduct: Sen;
  recommended: Sen;
  lines: FinalLine[];
  faults: Finding[];
}

// The form's own definition, not a threshold: FR-FIN-006 "up to three other permitted deductions", the §8 formula "Σ(3 other deductions)" (ruling 6).
export const MAX_OTHER_FINAL_DEDUCTIONS = 3;
const sum = (xs: readonly Sen[]) => xs.reduce((a, x) => a + x, 0n);
const TIER_WORDS = { MAIN: "main contractor", NSC: "nominated sub-contractors", NS: "nominated suppliers" } as const;

export function finalAccountOf(i: FinalAccountInput): FinalAccount {
  const faults: Finding[] = [];
  const asPaid = i.basis === "AS_PAID";
  const ids = i.interims.map((x) => x.certificateId);
  const netAdjustment = sum(i.adjustments.map((a) => a.net));
  const finalSum = i.originalSum + netAdjustment;
  const last = i.interims.at(-1);
  const released: Tiers = last ? last.released : { MAIN: 0n, NSC: 0n, NS: 0n };
  const paid = sum(i.interims.map((x) => (asPaid ? x.recommended : x.carryForward)));
  const lines: FinalLine[] = [];
  const add = (block: FinalBlock, kind: FinalLineKind, amount: Sen, label: string, sourceIds: string[], keep = false) => {
    if (amount !== 0n || keep) lines.push({ block, kind, amount, label, sourceIds, keyed: false });
  };

  // Less: what was paid before, the released retention shown apart from the interims that paid it.
  add("LESS", "PREVIOUS_INTERIM", paid - released.MAIN - released.NSC - released.NS, asPaid ? "Previous interim payments, as paid" : "Previous interim payments, before their deductions", ids, true);
  for (const t of ["MAIN", "NSC", "NS"] as const) add("LESS", `RETENTION_RELEASED_${t}`, released[t], `Retention released: ${TIER_WORDS[t]}`, last ? [last.certificateId] : []);
  for (const party of ["MAIN", "NSC"] as const) {
    const advances = i.advances.filter((a) => a.party === party);
    const advanced = sum(advances.map((a) => a.amount));
    const recouped = sum(i.interims.map((x) => x.advance[party]));
    add("LESS", `ADVANCE_REPAID_${party}`, asPaid ? advanced : advanced - recouped, asPaid ? `Advance paid: ${TIER_WORDS[party]}` : `Advance not yet recouped: ${TIER_WORDS[party]}`, advances.map((a) => a.id));
  }

  // Deduct: damages and the deductions; under AS_PAID those the interims took as well.
  const taken = (pick: (x: FinalInterim) => Sen) => (asPaid ? sum(i.interims.map(pick)) : 0n);
  const ladGross = taken((x) => x.lad.gross) + i.ladNow.gross;
  const ladWaived = taken((x) => x.lad.waived) + i.ladNow.waived;
  const ladCredit = taken((x) => x.lad.credit) + i.ladNow.credit;
  add("DEDUCT", "LAD", ladGross, "Liquidated damages", asPaid ? ids : []);
  add("DEDUCT", "LAD_WAIVED", -ladWaived, `Liquidated damages waived${i.ladNow.waiverRefs.length ? ` (${i.ladNow.waiverRefs.join(", ")})` : ""}`, [...i.ladNow.waiverIds]);
  add("DEDUCT", "LAD_CREDIT", -ladCredit, "Damages returned on extension of time", []);
  add("DEDUCT", "LAD_ROUNDING", taken((x) => x.lad.rounding), "Liquidated damages: rounding on the interim certificates", ids);
  add("DEDUCT", "PREMIUMS_PERKESO", taken((x) => x.premiums) + sum(i.pending.map((p) => p.amount)), "Insurance premiums and social security paid by the employer", [...(asPaid ? ids : []), ...i.pending.map((p) => p.id)]);
  add("DEDUCT", "WAGES", taken((x) => x.wages), "Workers' wages paid by the employer, on the interim certificates", ids);
  add("DEDUCT", "NON_COMPLIANCE", taken((x) => x.nonCompliance), "Costs of non-compliance, on the interim certificates", ids);
  add("DEDUCT", "OTHER", taken((x) => x.others), "Other deductions on the interim certificates", ids);

  // The keyed deductions.
  for (const k of i.keyed) {
    if (k.kind !== "LAD_ROUNDING" && k.amount < 0n) faults.push({ code: "NEGATIVE_DEDUCTION", level: "block", data: { label: k.label } });
    lines.push({ block: "DEDUCT", kind: k.kind, amount: k.amount, label: k.label, sourceIds: [], keyed: true });
  }
  const others = i.keyed.filter((k) => k.kind === "OTHER").length;
  if (others > MAX_OTHER_FINAL_DEDUCTIONS) faults.push({ code: "TOO_MANY_OTHER_DEDUCTIONS", level: "block", data: { max: MAX_OTHER_FINAL_DEDUCTIONS } });
  const roundings = i.keyed.filter((k) => k.kind === "LAD_ROUNDING");
  if (roundings.length > 1) faults.push({ code: "ROUNDING_ONCE", level: "block" });
  // BD-613-47: the rounding sits beside the damages the account charges, net (every interim's taken off them included).
  const ladNet = sum(i.interims.map((x) => x.lad.gross - x.lad.waived - x.lad.credit)) + i.ladNow.gross - i.ladNow.waived - i.ladNow.credit;
  for (const r of roundings) {
    if (ladNet === 0n && sum(i.interims.map((x) => x.lad.gross)) + i.ladNow.gross === 0n) faults.push({ code: "ROUNDING_WITHOUT_LAD", level: "block" });
    else faults.push(...ladRoundingFaults(ladNet, r.amount));
  }

  const less = sum(lines.filter((l) => l.block === "LESS").map((l) => l.amount));
  const deduct = sum(lines.filter((l) => l.block === "DEDUCT").map((l) => l.amount));
  const recommended = finalSum - less - deduct;
  if (recommended < 0n) faults.push({ code: "FINAL_NEGATIVE", level: "block", data: { amount: (-recommended).toString() } });
  return { originalSum: i.originalSum, netAdjustment, finalSum, less, deduct, recommended, lines, faults };
}

// ------------------------------------------------------------------ before the raise (§4.6's table)

export interface FinalPreconditionFacts {
  cpcIssued: boolean;
  /// The CPC's frozen DLP applies (null: no CPC issued).
  dlpApplies: boolean | null;
  cmgdIssued: boolean;
  /// Certificates of the contract in DRAFT, IN_ROUTING or SIGNING, named.
  inProgress: readonly string[];
  valuationOpen: boolean;
  /// Claims not determined, or approved and not certified, named.
  eotOpen: readonly string[];
  /// Loss-and-expense claims unvalued or undecided, named (FR-FIN-001).
  lossExpenseOpen: readonly string[];
  basis: FinalBasis | null;
  /// Approved waivers not yet applied, and the switch that applies them.
  waiversUnapplied: number;
  waiverSetting: string | null;
  /// Approved waivers whose damages moved since they were sent (they would never be applied after the final), named.
  waiversMoved: readonly string[];
  live: { number: string | null } | null;
  /// Ruling 4 (code review of close-out stage C): the latest interim's nominated tiers, and the kinds of the contract's live parties
  /// (NOMINATED_PARTY_NOT_RECORDED: a tier with value and none of its kind recorded).
  tierValue: { NSC: Sen; NS: Sen };
  liveKinds: readonly string[];
  /// Ruling 8 (code review of close-out stage C): variations not on an issued adjustment, named (`variationsOpenOf`).
  variationsOpen: readonly string[];
}

export function finalPreconditionFaults(f: FinalPreconditionFacts): Finding[] {
  const out: Finding[] = [];
  const b = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (f.live) b("FINAL_LIVE", { number: f.live.number });
  if (!f.cpcIssued) b("CPC_NOT_ISSUED");
  else if (f.dlpApplies !== false && !f.cmgdIssued) b("MAKING_GOOD_NOT_ISSUED_FINAL");
  if (f.inProgress.length) b("CERTIFICATES_IN_PROGRESS", { items: f.inProgress.join("; ") });
  if (f.valuationOpen) b("VALUATION_OPEN");
  if (f.eotOpen.length) b("EOT_OPEN", { items: f.eotOpen.join("; ") });
  if (f.lossExpenseOpen.length) b("LOSS_EXPENSE_NOT_VALUED", { items: f.lossExpenseOpen.join("; ") });
  if (!f.basis) b("FINAL_BASIS_NOT_SET");
  if (f.waiversUnapplied > 0 && !f.waiverSetting) b("WAIVER_SETTING_NOT_SET");
  if (f.waiversMoved.length) b("WAIVER_MOVED", { items: f.waiversMoved.join("; ") });
  out.push(...nominatedPartyFaults(f.tierValue, f.liveKinds));
  out.push(...variationsNotAdjusted(f.variationsOpen));
  return out;
}

/// A variation as the final account reads it (ruling 8): whether it stands approved, is commenced pending a decision, and is on an issued
/// Certificate of Adjustment of Contract Sum.
export interface VariationAdjustFact {
  reference: string;
  approved: boolean;
  commencedPending: boolean;
  adjusted: boolean;
}

/// Ruling 8 (FR-FIN-003): the final sum is the original sum plus the issued adjustments only, and nothing can add a variation after the final
/// issues, so each variation approved and not on an issued adjustment, and each commenced and not yet decided, is named, in order.
export function variationsOpenOf(vs: readonly VariationAdjustFact[]): string[] {
  return vs.flatMap((v) => (v.approved && !v.adjusted ? [`${v.reference} (approved, not on an issued adjustment)`] : v.commencedPending ? [`${v.reference} (commenced, not yet decided)`] : []));
}

/// VARIATIONS_NOT_ADJUSTED, naming each, asked at the raise, at the send and at the issue (empty: none).
export const variationsNotAdjusted = (open: readonly string[]): Finding[] => (open.length ? [{ code: "VARIATIONS_NOT_ADJUSTED", level: "block", data: { items: open.join("; ") } }] : []);

// ------------------------------------------------------------------ before it is sent for approval (§4.6; ruling 17)

export interface FinalRouteFacts {
  /// Each configured close-out document, and whether the pack has an entry for it.
  pack: readonly { label: string; met: boolean }[];
  declarationTakenUp: boolean;
  /// Finance's confirmed total (null: not confirmed), and what Finance's recorded payments on the interim and advance certificates add to.
  financeConfirmed: Sen | null;
  financePaid: Sen;
  /// Stage D's `performanceNotFiled` (null: filed).
  performance: Finding | null;
  /// Ruling 8: variations not on an issued adjustment, read again at the send (`judgedUnder` lists only what the raise read).
  variationsOpen: readonly string[];
  /// Ruling 4: the split's refusals (`finalSplitOf`): a party with no amount due recorded, a tier with none recorded, the waterfall's own.
  split: readonly Finding[];
}

export function finalRouteFaults(f: FinalRouteFacts): Finding[] {
  const out: Finding[] = [];
  const missing = f.pack.filter((x) => !x.met).map((x) => x.label);
  if (missing.length) out.push({ code: "PACK_INCOMPLETE", level: "block", data: { items: missing.join("; ") } });
  if (!f.declarationTakenUp) out.push({ code: "DECLARATION_NOT_TAKEN_UP", level: "block" });
  if (f.financeConfirmed == null) out.push({ code: "FINANCE_NOT_CONFIRMED", level: "block" });
  else if (f.financeConfirmed !== f.financePaid) out.push({ code: "FINANCE_TOTAL_DIFFERS", level: "block", data: { confirmed: f.financeConfirmed.toString(), computed: f.financePaid.toString() } });
  if (f.performance) out.push(f.performance);
  out.push(...variationsNotAdjusted(f.variationsOpen));
  out.push(...f.split);
  return out;
}

// ------------------------------------------------------------------ the split (ruling 4; FR-FIN-011)

/// A live nominated party or assignee of the contract, and what it is due on the final account (null: not recorded yet).
export interface FinalParty {
  id: string;
  name: string;
  kind: ContractPartyKind;
  due: Sen | null;
}

export interface FinalSplit {
  waterfall: Waterfall;
  /// Each party with what it is due and paid, in the parties' order; then the main contractor's share.
  lines: { id: string; name: string; due: Sen; paid: Sen }[];
  contractor: Sen;
  faults: Finding[];
  /// What the split was judged under, frozen into `judgedUnder` (FINAL_BASIS_MOVED covers it): the live parties and the allocations.
  judged: { parties: string[]; split: string };
}

/**
 * Close-out stage C review, ruling 4 (FR-FIN-011; ADR 0025 B1): the final payment split on the existing waterfall (`payment/waterfall.ts`), each live
 * party's keyed total due on the final account, the nominated tier first, then the assignees, then the contractor. Refused, by name: a party with no
 * amount recorded (PARTY_DUE_NOT_RECORDED), a nominated tier with value and none of its kind recorded (NOMINATED_PARTY_NOT_RECORDED), and the
 * waterfall's own (REMAINDER_RULE_NOT_SET where an insufficient split leaves sen and the rule is unset; DUE_NEGATIVE). A payment below nothing is
 * FINAL_NEGATIVE's, so the split reads it as nothing.
 */
export function finalSplitOf(recommended: Sen, parties: readonly FinalParty[], tierValue: { NSC: Sen; NS: Sen }, remainder: WaterfallRemainder | null): FinalSplit {
  const faults = nominatedPartyFaults(tierValue, parties.map((p) => p.kind));
  const missing = parties.filter((p) => p.due == null).map((p) => p.name);
  if (missing.length) faults.push({ code: "PARTY_DUE_NOT_RECORDED", level: "block", data: { items: missing.join("; ") } });
  const wf = waterfall(recommended < 0n ? 0n : recommended, parties.map((p) => ({ id: p.id, tier: p.kind === "ASSIGNEE" ? ("ASSIGNEE" as const) : ("NOMINATED" as const), due: p.due ?? 0n })), remainder);
  faults.push(...wf.faults);
  const lines = parties.map((p, n) => ({ id: p.id, name: p.name, due: wf.allocations[n].due, paid: wf.allocations[n].paid }));
  const split = parties.length ? [remainder ?? "NOT_SET", ...lines.map((l) => `${l.id}:${l.due}:${l.paid}`), `contractor:${wf.contractor}`].join("|") : "";
  return { waterfall: wf, lines, contractor: wf.contractor, faults, judged: { parties: parties.map((p) => p.id), split } };
}

// ------------------------------------------------------------------ at issue (FINAL_NOT_ACCEPTED, FINAL_BASIS_MOVED)

/// Close-out stage C review, ruling 1 (FR-FIN-009): the contractor accepts the final account by its block, so a refused CONTRACTOR block refuses the
/// FINAL's issue, naming the block and its day, until it is voided and raised again. Only the FINAL's hook asks this: on every other kind a refusal
/// holds nothing up (FR-VAR-022), which `certificate/signature.ts` keeps.
export function finalAcceptanceFaults(signatures: readonly { blockKind: string; blockLabel: string; refused: boolean; signedOn: string }[]): Finding[] {
  return signatures.filter((x) => x.blockKind === "CONTRACTOR" && x.refused).map((x) => ({ code: "FINAL_NOT_ACCEPTED", level: "block", data: { block: x.blockLabel, day: x.signedOn } }));
}

/// What the final account was judged under, frozen at raise: every record read, and the figures.
export interface FinalJudged {
  version: 1;
  basis: FinalBasis;
  interims: string[];
  advances: string[];
  adjustments: string[];
  releases: string[];
  waivers: string[];
  pending: string[];
  finalSum: string;
  less: string;
  ladNow: string;
  /// Ruling 4: the live parties and the split, written again by each keyed act while a draft (absent on an account raised before them: none).
  parties?: string[];
  split?: string;
}

const MOVED_WORDS: Readonly<Record<keyof Omit<FinalJudged, "version">, string>> = {
  basis: "the previous-payments setting",
  interims: "the interim certificates",
  advances: "the advance payments",
  adjustments: "the adjustments of the contract sum",
  releases: "the retention released",
  waivers: "the waivers applied",
  pending: "the premiums paid by the employer",
  finalSum: "the final sum",
  less: "the less block",
  ladNow: "the damages",
  parties: "the nominated parties and assignees",
  split: "the split of the payment",
};

/// What the raise read (the keyed acts while a draft must not move these; the split's own keys are written again by each act).
export const RAISE_KEYS = ["basis", "interims", "advances", "adjustments", "releases", "waivers", "pending", "finalSum", "less", "ladNow"] as const satisfies readonly (keyof typeof MOVED_WORDS)[];

/// FINAL_BASIS_MOVED, naming what moved between the raise and now (empty: nothing); `keys` narrows it (the keyed acts ask only `RAISE_KEYS`).
export function finalBasisMoved(before: FinalJudged, now: FinalJudged, keys: readonly (keyof typeof MOVED_WORDS)[] = Object.keys(MOVED_WORDS) as (keyof typeof MOVED_WORDS)[]): Finding[] {
  // An account raised before the split was built has no parties and no split: read as none, not as moved.
  const norm = (k: keyof typeof MOVED_WORDS, v: unknown) => (v === undefined && k === "parties" ? [] : v === undefined && k === "split" ? "" : v);
  const same = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
  const moved = keys.filter((k) => !same(norm(k, before[k]), norm(k, now[k]))).map((k) => MOVED_WORDS[k]);
  return moved.length ? [{ code: "FINAL_BASIS_MOVED", level: "block", data: { items: moved.join(", ") } }] : [];
}
