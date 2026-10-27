import type { IssuedAdjustmentsRead } from "@/lib/adjustment/ppjhk";
import type { Sen } from "@/lib/money";

import { splitSen } from "./split";
import type { CaseFunding, SourceRef } from "./types";

/**
 * SF-03, RP-03, FS-8 to FS-10: the use of proceeds per source, from the portal's own records. Committed, certified and paid are
 * disjoint by construction; approved requisitions are not counted (a pre-encumbrance, and their estimate is SULIT). A figure that
 * cannot be read refuses by name and is never counted as nothing. Pure.
 */

/// A figure read from a contract's records, or the certificate it could not be read from.
export type Read = { ok: true; sen: Sen } | { ok: false; number: string };

export interface ContractMoney {
  contractId: string;
  /// Contract number · title, for the drill-down and the refusals.
  label: string;
  /// ContractStatus.
  status: string;
  /// Its payment route is DELIVERY_ORDER_INVOICE: its claims carry no certified figure (ADR 0045 D7).
  supplyRoute: boolean;
  contractSum: Sen;
  /// From readIssuedAdjustments (FR-PAD-003's one reading).
  adjustments: IssuedAdjustmentsRead;
  /// Σ PAID_FIGURE over its issued certificates of a payable kind.
  certified: Read;
  /// Amendment 15: retentionMain + retentionNsc + retentionNs on its latest issued interim certificate (zero when none is issued).
  retentionHeld: Read;
  /// Finance's certificate payments plus supply payments, each at its latest correction.
  paid: Sen;
  funding: CaseFunding;
}

export interface Figures {
  committed: Sen;
  certified: Sen;
  /// A supply contract counted here: its certified figure is not held.
  certifiedPartial: boolean;
  paid: Sen;
}

export interface Refused {
  contractId: string;
  label: string;
  reason: string;
}

export interface SourceProceeds extends Figures {
  sourceId: string;
  envelope: Sen | null;
  /// Envelope − committed. Null without an envelope; never clamped.
  unallocated: Sen | null;
  contracts: number;
  refused: Refused[];
}

/// One contract's share of one source, for the drill-down. A source's parts sum to its row.
export interface Part {
  contractId: string;
  label: string;
  sourceId: string;
  bp: number;
  committed: Sen;
  certified: Sen;
  paid: Sen;
}

export interface UseOfProceeds {
  bySource: SourceProceeds[];
  notSet: Figures & { contracts: number; refused: Refused[] };
  parts: Part[];
}

const ZERO: Figures = { committed: 0n, certified: 0n, certifiedPartial: false, paid: 0n };

/// FS-8, per contract. A cancelled contract counts nothing (excluded by `proceedsBySource`).
export function contractFigures(c: ContractMoney): { ok: true; figures: Figures } | { ok: false; reason: string } {
  if (c.status === "CANCELLED") return { ok: true, figures: ZERO };
  if (!c.supplyRoute && !c.certified.ok) return { ok: false, reason: `Certificate ${c.certified.number} has no figure frozen with its issue.` };
  const certified = c.supplyRoute || !c.certified.ok ? 0n : c.certified.sen;
  let committed: Sen;
  if (c.status === "TERMINATED") {
    if (c.supplyRoute) committed = c.paid;
    else if (!c.retentionHeld.ok) return { ok: false, reason: `Certificate ${c.retentionHeld.number} has no retention held frozen with its issue.` };
    else committed = certified + c.retentionHeld.sen;
  } else {
    if (!c.adjustments.ok) return { ok: false, reason: c.adjustments.refused.message };
    committed = c.adjustments.issued.reduce((a, x) => a + x.net, c.contractSum);
  }
  return { ok: true, figures: { committed, certified, certifiedPartial: c.supplyRoute, paid: c.paid } };
}

export function proceedsBySource(sources: readonly SourceRef[], contracts: readonly ContractMoney[]): UseOfProceeds {
  const rows = new Map<string, SourceProceeds>(sources.map((s) => [s.id, { sourceId: s.id, envelope: s.envelope, unallocated: null, contracts: 0, refused: [], ...ZERO }]));
  const notSet: UseOfProceeds["notSet"] = { contracts: 0, refused: [], ...ZERO };
  const parts: Part[] = [];
  for (const c of contracts) {
    if (c.status === "CANCELLED") continue;
    const read = contractFigures(c);
    if (c.funding.state === "NOT_SET") {
      notSet.contracts += 1;
      if (!read.ok) notSet.refused.push({ contractId: c.contractId, label: c.label, reason: read.reason });
      else add(notSet, read.figures);
      continue;
    }
    const shares = c.funding.shares;
    const known = shares.every((s) => rows.has(s.sourceId));
    if (!known) throw new Error(`Contract ${c.label} is funded by a source not loaded.`);
    if (!read.ok) {
      for (const s of shares) {
        const row = rows.get(s.sourceId)!;
        row.contracts += 1;
        row.refused.push({ contractId: c.contractId, label: c.label, reason: read.reason });
      }
      continue;
    }
    const committed = splitSen(read.figures.committed, shares, sources);
    const certified = splitSen(read.figures.certified, shares, sources);
    const paid = splitSen(read.figures.paid, shares, sources);
    for (const s of shares) {
      const part = { committed: committed.get(s.sourceId)!, certified: certified.get(s.sourceId)!, certifiedPartial: read.figures.certifiedPartial, paid: paid.get(s.sourceId)! };
      const row = rows.get(s.sourceId)!;
      row.contracts += 1;
      add(row, part);
      parts.push({ contractId: c.contractId, label: c.label, sourceId: s.sourceId, bp: s.bp, committed: part.committed, certified: part.certified, paid: part.paid });
    }
  }
  for (const row of rows.values()) row.unallocated = row.envelope == null ? null : row.envelope - row.committed;
  return { bySource: [...rows.values()], notSet, parts };
}

function add(into: Figures, f: Figures) {
  into.committed += f.committed;
  into.certified += f.certified;
  into.paid += f.paid;
  into.certifiedPartial ||= f.certifiedPartial;
}
