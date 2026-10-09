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

/**
 * The kinds of ISSUED certificate the contractor reads on its Certificates tab (4e review fix): the ones addressed to it or served on it. Before issue a certificate is the office's
 * own deliberation (an intention to terminate in routing, a non-completion being signed) and the contractor reads none of it, save the two kinds it signs while they are being
 * signed. Left out even once issued, each for its reason (an open question to the product owner, logged): the letter of delegation (A/1 and B/1 are addressed to the
 * representative, not the contractor), the application for a variation (the office's own request for approval) and the nomination letter (whether it is addressed to the main
 * contractor is not settled by the forms on record). A void certificate was never issued (the core voids only before issue) and is shown only where the contractor signed or
 * refused its block on it, so a block it signed does not vanish without a word.
 */
export const CONTRACTOR_READS_ISSUED_KINDS = [
  "DELEGATION_NOTICE",
  "INTERIM_PAYMENT",
  "ADVANCE_PAYMENT",
  "LAD_WARNING",
  "NON_COMPLETION",
  "SO_INSTRUCTION",
  "VARIATION",
  "SUM_ADJUSTMENT",
  "EOT",
  "CONTRACT_PERIOD_AGREEMENT",
  "PARTIAL_OCCUPATION",
  "PRACTICAL_COMPLETION",
  "SCHEDULE_OF_DEFECTS",
  "MAKING_GOOD_DEFECTS",
  "TERMINATION_INTENT",
  "TERMINATION",
  "TERMINATED_FINAL",
  "FINAL",
] as const;

/// Whether the contractor reads a certificate on its tab: issued and addressed to it, being signed and one of the two kinds it signs, or void after it recorded its block.
export function contractorReadsCertificate(c: { kind: string; status: string; contractorRecorded: boolean }): boolean {
  if (c.status === "ISSUED") return (CONTRACTOR_READS_ISSUED_KINDS as readonly string[]).includes(c.kind);
  if (c.status === "SIGNING") return contractorSignsKind(c.kind);
  if (c.status === "VOID") return contractorSignsKind(c.kind) && c.contractorRecorded;
  return false;
}

/**
 * Whether the contractor may sign from its own portal account at all (4e review fix): its block on the two certificates and the statutory declaration bind the company, and who in
 * a contractor's company may bind it is the customer's policy (`PostAwardPolicy.contractorPortalSigning`). Not decided: refused, and said. Decided against: paper only, said.
 */
export function portalSigningFault(setting: boolean | null | undefined): "PORTAL_SIGNING_NOT_SET" | "PORTAL_SIGNING_OFF" | null {
  if (setting == null) return "PORTAL_SIGNING_NOT_SET";
  return setting ? null : "PORTAL_SIGNING_OFF";
}

/**
 * Who in the contractor's company may sign (decisions log, 2026-10-09, ruling on 1928(3)). The organisation's switch says the portal may sign at all; this says whether THIS contact may bind the
 * company, as an officer has marked it (`SupplierContact.authorisedToSignForContractor`). Not marked: refused and said, as the switch is. Marked no: refused. A wrong signer on a certificate is a
 * correctness failure, and the switch alone would let any contact sign.
 */
export function signerAuthorisationFault(mark: boolean | null | undefined): "SIGNER_NOT_AUTHORISED_NOT_SET" | "SIGNER_NOT_AUTHORISED" | null {
  if (mark == null) return "SIGNER_NOT_AUTHORISED_NOT_SET";
  return mark ? null : "SIGNER_NOT_AUTHORISED";
}

/// Why this contact may not sign from the portal, or null: the organisation's switch first (nobody may), then the contact's own mark.
export function contractorSigningFault(setting: boolean | null | undefined, mark: boolean | null | undefined): ReturnType<typeof portalSigningFault> | ReturnType<typeof signerAuthorisationFault> {
  return portalSigningFault(setting) ?? signerAuthorisationFault(mark);
}

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
  | { state: "NOT_OFFERED"; why: "KIND" | "NOT_SIGNING" | "NO_BLOCK" | "SIGNED" | "LAST" }
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
  // 4e review fix, until the product owner rules on OPEN I: recording the last block issues the certificate (the core's `allSigned`), and an issue from the portal would be
  // written under the contractor's account (the number, the issue snapshot, a revised contract sum, the S.O. resolved again). Where every other block is recorded, the
  // portal does not offer the block: the contractor signs the paper and the office records it, as before.
  if (!(i.blocks ?? []).some((b) => b.blockOrder !== block.blockOrder && !i.signedOrders.includes(b.blockOrder))) return { state: "NOT_OFFERED", why: "LAST" };
  return { state: "READY", block };
}

export interface SignBlockInput extends ContractorBlockInput {
  action: "sign" | "dispute";
  note: string;
}

export function signBlockFaults(i: SignBlockInput): ProjectFinding[] {
  const b = contractorBlock(i);
  if (b.state === "NOT_OFFERED") {
    const code = b.why === "NOT_SIGNING" ? "NOT_SIGNING" : b.why === "SIGNED" ? "BLOCK_SIGNED" : b.why === "LAST" ? "BLOCK_IS_LAST" : "NO_CONTRACTOR_BLOCK";
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
  /// Paid on the certificates whose figure is known: the only payments the outstanding is worked from.
  paid: Sen;
  outstanding: Sen;
  /// Paid on certificates whose figure is not on record: its own figure, never set against the certified sum (it would read as a negative outstanding).
  paidUnfigured: Sen;
  /// Certificates whose figure is not on record, so the sums leave them out and the screen says so.
  unfigured: number;
  awaitingPayment: number;
}

export function certifiedAgainstPaid(rows: readonly CertifiedRow[]): CertifiedSummary {
  let certified = 0n;
  let paid = 0n;
  let paidUnfigured = 0n;
  let unfigured = 0;
  let awaiting = 0;
  for (const r of rows) {
    if (r.recommended == null) unfigured++;
    else certified = addSen(certified, r.recommended);
    if (!r.paid) awaiting++;
    else if (r.recommended == null) paidUnfigured = addSen(paidUnfigured, r.paid.amount);
    else paid = addSen(paid, r.paid.amount);
  }
  return { certified, paid, outstanding: certified - paid, paidUnfigured, unfigured, awaitingPayment: awaiting };
}
