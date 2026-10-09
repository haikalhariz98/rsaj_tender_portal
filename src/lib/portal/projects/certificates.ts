/**
 * The contractor's side of a certificate (Phase 4e; spec section 5.3: "sign or dispute variation and adjustment certificates"; FR-VAR-022: the contractor's refusal is recorded).
 * Pure.
 *
 * A certificate is signed in printed order (FR-CRT-004). The contractor's block is offered from the portal only when the certificate is being signed, the block is a CONTRACTOR
 * block of the pinned form, and it is the next block in order (an earlier block not yet recorded holds it, as it does an officer). The kinds offered are the Variation Order
 * Certificate and the Certificate of Adjustment of Contract Sum, which the requirement names; every other kind's contractor block stays recorded by an officer from the paper. A dispute
 * is the refusal the form allows (`refusalAllowed`), with the reason; where the form does not allow one, the contractor is told to raise it with the S.O. in words.
 *
 * Certified against paid (section 5.3: "certificates issued, and amounts certified against amounts paid"): the issued interim certificates' payment recommended, each against
 * what Finance paid on it. The figures are the contractor's own certificates' (it is a party to each), and the sums are added here, never in a component.
 */

import { addSen, type Sen } from "@/lib/money";

import { NOTE_MAX, type ProjectFinding } from "./types";

export const CONTRACTOR_SIGNS_KINDS = ["VARIATION", "SUM_ADJUSTMENT"] as const;
export const contractorSignsKind = (kind: string): boolean => (CONTRACTOR_SIGNS_KINDS as readonly string[]).includes(kind);

export interface BlockFacts {
  blockOrder: number;
  blockKind: string;
  labelEn: string;
  refusalAllowed: boolean;
}

export interface ContractorBlockInput {
  kind: string;
  status: string;
  /// The pinned revision's blocks; null where the form is not pinned yet (the first signature pins it, and the contractor never signs first).
  blocks: readonly BlockFacts[] | null;
  signedOrders: readonly number[];
}

export type ContractorBlock =
  | { state: "NOT_OFFERED"; why: "KIND" | "NOT_SIGNING" | "NO_BLOCK" | "SIGNED" }
  | { state: "WAITING"; block: BlockFacts; first: string }
  | { state: "READY"; block: BlockFacts };

/// Whether, and which, contractor block the portal offers on a certificate.
export function contractorBlock(i: ContractorBlockInput): ContractorBlock {
  if (!contractorSignsKind(i.kind)) return { state: "NOT_OFFERED", why: "KIND" };
  if (i.status !== "SIGNING") return { state: "NOT_OFFERED", why: "NOT_SIGNING" };
  const block = (i.blocks ?? []).find((b) => b.blockKind === "CONTRACTOR") ?? null;
  if (!block) return { state: "NOT_OFFERED", why: "NO_BLOCK" };
  if (i.signedOrders.includes(block.blockOrder)) return { state: "NOT_OFFERED", why: "SIGNED" };
  const next = [...(i.blocks ?? [])].sort((a, b) => a.blockOrder - b.blockOrder).find((b) => !i.signedOrders.includes(b.blockOrder));
  if (next && next.blockOrder !== block.blockOrder) return { state: "WAITING", block, first: next.labelEn };
  return { state: "READY", block };
}

export interface SignBlockInput extends ContractorBlockInput {
  action: "sign" | "dispute";
  note: string;
}

export function signBlockFaults(i: SignBlockInput): ProjectFinding[] {
  const b = contractorBlock(i);
  if (b.state === "NOT_OFFERED") {
    const code = b.why === "NOT_SIGNING" ? "NOT_SIGNING" : b.why === "SIGNED" ? "BLOCK_SIGNED" : "NO_CONTRACTOR_BLOCK";
    return [{ code, level: "block" }];
  }
  if (b.state === "WAITING") return [{ code: "BLOCK_NOT_NEXT", level: "block", data: { first: b.first } }];
  const out: ProjectFinding[] = [];
  if (i.action === "dispute") {
    if (!b.block.refusalAllowed) out.push({ code: "REFUSAL_NOT_ALLOWED", level: "block" });
    else if (!i.note.trim()) out.push({ code: "REFUSAL_NOTE_REQUIRED", level: "block" });
    else if (i.note.trim().length > NOTE_MAX) out.push({ code: "REFUSAL_NOTE_TOO_LONG", level: "block", data: { max: NOTE_MAX } });
  }
  return out;
}

export interface CertifiedRow {
  certificateId: string;
  sequence: number;
  number: string | null;
  issuedOn: string | null;
  /// The payment recommended on the certificate as issued. Null: the figure was not computed (said, never zero).
  recommended: Sen | null;
  paid: { on: string; amount: Sen; batchNo: string } | null;
}

export interface CertifiedSummary {
  certified: Sen;
  paid: Sen;
  outstanding: Sen;
  /// Certificates whose figure is not on record, so the sums leave them out and the screen says so.
  unfigured: number;
  awaitingPayment: number;
}

export function certifiedAgainstPaid(rows: readonly CertifiedRow[]): CertifiedSummary {
  let certified = 0n;
  let paid = 0n;
  let unfigured = 0;
  let awaiting = 0;
  for (const r of rows) {
    if (r.recommended == null) unfigured++;
    else certified = addSen(certified, r.recommended);
    if (r.paid) paid = addSen(paid, r.paid.amount);
    else awaiting++;
  }
  return { certified, paid, outstanding: certified - paid, unfigured, awaitingPayment: awaiting };
}
