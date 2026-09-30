/**
 * The contract type (FR-MTD-011, rulings R-10, R-11).
 *
 * The default comes from the deliverable test: each configured type may name the
 * deliverable it is the default for. Mixed scope is classified by the dominant
 * deliverable only where its share of value is strictly above the organisation's
 * threshold — computed exactly, in sen. With no threshold set there is no default for
 * mixed scope: the officer chooses, with a reason and a named Person. Anything other
 * than the derived type is an override, recorded the same way. After award the type is
 * locked (6.11).
 */

import { addSen, formatSen, type Sen } from "@/lib/money";

import type { ClassificationPolicy, ContractTypeRow, ContractTypeState, DeliverableKind, Finding } from "./types";

export type DerivationState = "DERIVED" | "MIXED_NO_DOMINANT" | "THRESHOLD_NOT_SET" | "NO_TYPE_FOR_KIND" | "SEVERAL_TYPES_FOR_KIND" | "NO_SCOPE";

export interface Derivation {
  state: DerivationState;
  code: string | null;
  kind: DeliverableKind | null;
  /// The dominant deliverable's share of value, in percent to four places, as a string.
  sharePct: string | null;
}

const SCALE = 10_000n; // four decimal places, as Decimal(9,4)

/// A percentage written as a decimal string, to four places, exactly.
export function parsePct(s: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(s.trim());
  if (!m) throw new Error(`Not a percentage: ${s}`);
  return BigInt(m[1]) * SCALE + BigInt((m[2] ?? "").padEnd(4, "0"));
}

export function formatPct(scaled: bigint): string {
  return `${scaled / SCALE}.${(scaled % SCALE).toString().padStart(4, "0")}`;
}

export function defaultContractType(
  parts: readonly { kind: DeliverableKind; amount: Sen }[],
  types: readonly ContractTypeRow[],
  policy: ClassificationPolicy,
  on: Date,
): Derivation {
  if (parts.length === 0) return { state: "NO_SCOPE", code: null, kind: null, sharePct: null };
  const byKind = new Map<DeliverableKind, Sen>();
  for (const p of parts) byKind.set(p.kind, (byKind.get(p.kind) ?? 0n) + p.amount);
  const total = addSen(...byKind.values());
  const [kind, dominant] = [...byKind.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0];
  const share = total > 0n ? (dominant * 100n * SCALE) / total : 0n;
  const sharePct = formatPct(share);
  if (byKind.size > 1) {
    if (policy.dominanceSharePct == null) return { state: "THRESHOLD_NOT_SET", code: null, kind, sharePct };
    // Strictly above: dominant / total > threshold / 100, cross-multiplied in integers.
    const above = dominant * 100n * SCALE > parsePct(policy.dominanceSharePct) * total;
    if (!above) return { state: "MIXED_NO_DOMINANT", code: null, kind, sharePct };
  }
  const candidates = types.filter((t) => (t.retiredOn == null || t.retiredOn > on) && t.deliverableKind === kind);
  if (candidates.length === 0) return { state: "NO_TYPE_FOR_KIND", code: null, kind, sharePct };
  if (candidates.length > 1) return { state: "SEVERAL_TYPES_FOR_KIND", code: null, kind, sharePct };
  return { state: "DERIVED", code: candidates[0].code, kind, sharePct };
}

export type ScopeFault = "SCOPE_REQUIRED" | "SCOPE_AMOUNT_INVALID" | "SCOPE_SUM_MISMATCH";

/// The scope split must account for the exercise's value exactly.
export function scopeFaults(parts: readonly { amount: Sen }[], value: Sen): Finding<ScopeFault>[] {
  if (parts.length === 0) return [{ code: "SCOPE_REQUIRED", level: "block" }];
  if (parts.some((p) => p.amount <= 0n)) return [{ code: "SCOPE_AMOUNT_INVALID", level: "block" }];
  const sum = addSen(...parts.map((p) => p.amount));
  return sum === value ? [] : [{ code: "SCOPE_SUM_MISMATCH", level: "block", data: { sum: formatSen(sum), value: formatSen(value) } }];
}

export type TypeFault = "LOCKED" | "TYPE_REQUIRED" | "TYPE_UNKNOWN" | "TYPE_REASON_REQUIRED" | "TYPE_PERSON_REQUIRED";

export interface TypeChoice {
  state: ContractTypeState | null;
  code: string | null;
  faults: Finding<TypeFault>[];
}

/**
 * The type an exercise ends up with. None chosen: the derived one, where there is one.
 * Chosen and different from the derived one (or where nothing was derived): a reason
 * and the Person who decided, recorded on their behalf.
 */
export function contractTypeChoice(
  derivation: Derivation,
  chosen: { code: string | null; reason: string; personId: string | null },
  types: readonly ContractTypeRow[],
  ctx: { lockedAt: Date | null; currentCode: string | null; on: Date },
): TypeChoice {
  const f = (code: TypeFault, data?: Finding["data"]): Finding<TypeFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  const code = chosen.code ?? derivation.code;
  if (ctx.lockedAt && code !== ctx.currentCode) return { state: null, code: ctx.currentCode, faults: [f("LOCKED")] };
  if (!code) return { state: null, code: null, faults: [f("TYPE_REQUIRED", { derivation: derivation.state })] };
  const t = types.find((x) => x.code === code);
  if (!t || (t.retiredOn != null && t.retiredOn <= ctx.on)) return { state: null, code, faults: [f("TYPE_UNKNOWN")] };
  if (derivation.state === "DERIVED" && code === derivation.code) return { state: "DERIVED", code, faults: [] };
  const faults: Finding<TypeFault>[] = [];
  if (!chosen.reason.trim()) faults.push(f("TYPE_REASON_REQUIRED", { derived: derivation.code }));
  if (!chosen.personId) faults.push(f("TYPE_PERSON_REQUIRED"));
  return { state: derivation.state === "DERIVED" ? "OVERRIDDEN" : "CHOSEN", code, faults };
}
