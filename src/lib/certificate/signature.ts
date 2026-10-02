/**
 * Signature blocks in printed order (FR-CRT-004). Pure.
 *
 * The blocks are the pinned revision's (OD-2 A). A block is recorded only once every earlier block is: the
 * Recommending Officer always signs before the Superintending Officer, and a later block is refused before
 * an earlier one. Who may sign a block is its office rule's:
 * - NAMED_OFFICE: a holder of the office on the day, or a live delegate of the whole office where the block
 *   is delegable; a delegate whose delegation gives instruction authority only is refused on a certificate
 *   that certifies money (FR-PAY-017, FR-VAR-021).
 * - SO, SO_REP, RECOMMENDING_OFFICER: the person the contract's supervision resolves for that day (6.13,
 *   FR-SUP-001), on the same terms. With no supervision recorded for the contract, nobody signs it.
 * - CONTRACTOR, WITNESS: a named outsider, on the day they signed the paper; a contractor's refusal is
 *   recorded where the block allows it (FR-VAR-022), and it does not hold up the blocks after it.
 * A block whose `delegable` is not decided refuses everyone: whether a delegate may sign it is the
 * customer's to say, and holding the office is not assumed to answer it.
 */

import { IC_FORMAT, maskIc } from "@/lib/award/mask";

import type { Block, CertificateStatus, Finding, SignedBlock } from "./types";
import { isPersonRule } from "./types";

/// The office's holders and its delegates on the day. `instructionOnly`: the delegation gives instruction
/// authority only (a 6.13 delegation scope); false where nothing says so.
export interface OfficeHolders {
  holderIds: readonly string[];
  delegates: readonly { personId: string; delegationId: string; instructionOnly: boolean }[];
}

export interface SignContext {
  status: CertificateStatus;
  /// The organisation's day of the act.
  today: string;
  /// The Person named for a block of the organisation's own, as on record. Null: none named, or not on record.
  person: { id: string; name: string; isActive: boolean } | null;
  /// Who holds the block's office that day: a NAMED_OFFICE block's office from the roster; an SO, SO_REP or
  /// RECOMMENDING_OFFICER block's from the contract's supervision. Null: the supervision is not recorded.
  holders: OfficeHolders | null;
  /// The certificate certifies money (an instruction-only delegate may not sign it).
  valueBearing: boolean;
}

export interface SignInput {
  blockOrder: number;
  /// An outsider's name as signed (CONTRACTOR, WITNESS). Ignored for a Person's block.
  name: string;
  /// An outsider's identity-card number, if the form takes one. Only the masked number is kept.
  icNumber: string;
  /// The day an outsider signed the paper. A Person's block is dated by the act (today).
  signedOn: string | null;
  refused: boolean;
  refusalNote: string;
  decision: "SUPPORTED" | "NOT_SUPPORTED" | null;
  /// Money as a decimal string, where the decision is supported up to a cap.
  decisionCap: string | null;
}

export interface SignResult {
  faults: Finding[];
  /// The delegation the Person signed under, where they did.
  delegationId: string | null;
  /// The day the block is recorded as signed.
  signedOn: string | null;
}


/// The first block not yet recorded, in printed order. Null: every block is.
export function nextBlock(blocks: readonly Block[], signed: readonly SignedBlock[]): Block | null {
  const done = new Set(signed.map((s) => s.blockOrder));
  return [...blocks].sort((a, b) => a.blockOrder - b.blockOrder).find((b) => !done.has(b.blockOrder)) ?? null;
}

/// Whether every block is recorded.
export const allSigned = (blocks: readonly Block[], signed: readonly SignedBlock[]): boolean => nextBlock(blocks, signed) == null;

const label = (b: Block) => b.labelEn;

export function signFaults(blocks: readonly Block[], signed: readonly SignedBlock[], input: SignInput, ctx: SignContext): SignResult {
  const faults: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => faults.push({ code, level: "block", data });
  const out = (delegationId: string | null = null, signedOn: string | null = null): SignResult => ({ faults, delegationId, signedOn });

  if (ctx.status !== "SIGNING") {
    f("NOT_SIGNING", { status: ctx.status });
    return out();
  }
  const block = blocks.find((b) => b.blockOrder === input.blockOrder);
  if (!block) {
    f("UNKNOWN_BLOCK");
    return out();
  }
  if (signed.some((s) => s.blockOrder === block.blockOrder)) {
    f("ALREADY_SIGNED", { block: label(block) });
    return out();
  }
  const next = nextBlock(blocks, signed);
  if (next && next.blockOrder !== block.blockOrder) f("OUT_OF_ORDER", { block: label(block), first: label(next) });
  if (block.delegable == null) f("DELEGABLE_NOT_SET", { block: label(block) });

  // The day the earliest of the remaining blocks may carry: never before a block already recorded.
  const latestEarlier = signed.filter((s) => s.blockOrder < block.blockOrder).map((s) => s.signedOn).sort().at(-1) ?? null;

  // The decision a block carries (DISOKONG / TIDAK DISOKONG), and only there.
  if (block.carriesDecision && !input.refused && input.decision == null) f("DECISION_REQUIRED", { block: label(block) });
  if (!block.carriesDecision && input.decision != null) f("DECISION_NOT_ON_BLOCK", { block: label(block) });
  if (input.decisionCap != null && input.decision !== "SUPPORTED") f("CAP_ONLY_WHEN_SUPPORTED");
  if (input.decisionCap != null && !/^\d+\.\d{2}$/.test(input.decisionCap)) f("CAP_FORMAT");

  if (isPersonRule(block.officeRule)) {
    if (input.refused) f("REFUSAL_NOT_ALLOWED", { block: label(block) });
    const p = ctx.person;
    if (!p) {
      f("PERSON_REQUIRED");
      return out();
    }
    if (!p.isActive) f("INACTIVE", { name: p.name });
    const other = signed.find((s) => s.personId === p.id);
    if (other) {
      const b2 = blocks.find((b) => b.blockOrder === other.blockOrder);
      f("SAME_PERSON", { name: p.name, block: b2 ? label(b2) : "another block" });
    }
    if (!ctx.holders) {
      f("SUPERVISION_NOT_RECORDED", { rule: block.officeRule, block: label(block) });
      return out(null, ctx.today);
    }
    let delegationId: string | null = null;
    if (!ctx.holders.holderIds.includes(p.id)) {
      const via = ctx.holders.delegates.find((d) => d.personId === p.id);
      if (!via) f("NOT_HOLDER", { name: p.name, block: label(block) });
      else if (block.delegable === false) f("NOT_DELEGABLE", { name: p.name, block: label(block) });
      else {
        delegationId = via.delegationId;
        if (ctx.valueBearing && via.instructionOnly) f("INSTRUCTION_ONLY", { name: p.name, block: label(block) });
      }
    }
    if (latestEarlier && latestEarlier > ctx.today) f("BEFORE_EARLIER", { day: latestEarlier });
    return out(delegationId, ctx.today);
  }

  // A named outsider: the contractor's signatory or a witness, on the day they signed the paper.
  if (!input.name.trim()) f("NAME_REQUIRED", { block: label(block) });
  if (input.icNumber.trim() && !IC_FORMAT.test(input.icNumber.trim())) f("IC_FORMAT");
  if (input.refused) {
    if (!block.refusalAllowed) f("REFUSAL_NOT_ALLOWED", { block: label(block) });
    else if (!input.refusalNote.trim()) f("REFUSAL_NOTE_REQUIRED");
  }
  if (!input.signedOn) f("SIGNED_ON_REQUIRED");
  else {
    if (input.signedOn > ctx.today) f("FUTURE_DATE", { day: input.signedOn });
    if (latestEarlier && input.signedOn < latestEarlier) f("BEFORE_EARLIER", { day: latestEarlier });
  }
  return out(null, input.signedOn);
}

/// Only the masked number is kept on a certificate (6.11 R20): `maskIc`, null where none was given.
export const maskedIc = (ic: string): string | null => (ic.trim() ? maskIc(ic) : null);
