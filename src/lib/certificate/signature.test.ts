import { describe, expect, it } from "vitest";

import { INTERIM_BLOCKS, block } from "./fixture";
import { allSigned, maskedIc, nextBlock, signFaults, type SignContext, type SignInput } from "./signature";
import type { SignedBlock } from "./types";

/**
 * FR-CRT-004: signatures in printed order, each block by the office its rule names. The spec's example:
 * the Recommending Officer always signs before the Superintending Officer; out of order is refused.
 */

const TODAY = "2026-09-30";
const ro = { id: "p-ro", name: "Recommending Officer A", isActive: true };
const so = { id: "p-so", name: "Superintending Officer B", isActive: true };
const holders = (ids: string[], delegates: { personId: string; delegationId: string; instructionOnly: boolean }[] = []) => ({ holderIds: ids, delegates });
const ctx = (over: Partial<SignContext> = {}): SignContext => ({ status: "SIGNING", today: TODAY, person: ro, holders: holders([ro.id]), valueBearing: true, ...over });
const input = (blockOrder: number, over: Partial<SignInput> = {}): SignInput => ({ blockOrder, name: "", icNumber: "", signedOn: null, refused: false, refusalNote: "", decision: null, decisionCap: null, ...over });
const signed = (blockOrder: number, over: Partial<SignedBlock> = {}): SignedBlock => ({ blockOrder, personId: null, name: "x", signedOn: "2026-09-29", refused: false, decision: null, ...over });
const codes = (r: { faults: { code: string }[] }) => r.faults.map((f) => f.code);

describe("printed order (FR-CRT-004)", () => {
  it("the Recommending Officer signs first; the Superintending Officer before it is refused", () => {
    const r = signFaults(INTERIM_BLOCKS, [], input(2), ctx({ person: so, holders: holders([so.id]) }));
    expect(codes(r)).toEqual(["OUT_OF_ORDER"]);
    expect(r.faults[0].data).toEqual({ block: "Superintending Officer", first: "Recommending Officer" });
  });
  it("in order, each is accepted and dated the day of the act", () => {
    const r1 = signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx());
    expect(codes(r1)).toEqual([]);
    expect(r1.signedOn).toBe(TODAY);
    const r2 = signFaults(INTERIM_BLOCKS, [signed(1, { personId: ro.id, signedOn: TODAY })], input(2), ctx({ person: so, holders: holders([so.id]) }));
    expect(codes(r2)).toEqual([]);
  });
  it("nextBlock and allSigned follow the printed order, whatever order the blocks arrive in", () => {
    const shuffled = [INTERIM_BLOCKS[2], INTERIM_BLOCKS[0], INTERIM_BLOCKS[3], INTERIM_BLOCKS[1]];
    expect(nextBlock(shuffled, [])?.blockOrder).toBe(1);
    expect(nextBlock(shuffled, [signed(1), signed(2)])?.blockOrder).toBe(3);
    expect(allSigned(shuffled, [signed(1), signed(2), signed(3), signed(4)])).toBe(true);
  });
  it("a block already recorded, or one not on the form, is refused", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, [signed(1)], input(1, { decision: "SUPPORTED" }), ctx()))).toEqual(["ALREADY_SIGNED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(9), ctx()))).toEqual(["UNKNOWN_BLOCK"]);
  });
  it("only while being signed", () => {
    for (const status of ["DRAFT", "IN_ROUTING", "ISSUED", "VOID"] as const) expect(codes(signFaults(INTERIM_BLOCKS, [], input(1), ctx({ status })))).toEqual(["NOT_SIGNING"]);
  });
});

describe("who may sign a block", () => {
  it("someone who does not hold the office, nor a delegation of it, is refused", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ holders: holders(["someone-else"]) })))).toEqual(["NOT_HOLDER"]);
  });
  it("a delegate signs a delegable block, and the delegation is recorded", () => {
    const r = signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ holders: holders(["holder"], [{ personId: ro.id, delegationId: "d1", instructionOnly: false }]) }));
    expect(codes(r)).toEqual([]);
    expect(r.delegationId).toBe("d1");
  });
  it("a block that is not delegable refuses a delegate", () => {
    const r = signFaults(INTERIM_BLOCKS, [signed(1, { personId: "p-x" })], input(2), ctx({ person: so, holders: holders(["holder"], [{ personId: so.id, delegationId: "d2", instructionOnly: false }]) }));
    expect(codes(r)).toEqual(["NOT_DELEGABLE"]);
  });
  it("FR-PAY-017: a delegate with instruction authority only is refused on a certificate that certifies money, accepted on one that does not", () => {
    const via = holders(["holder"], [{ personId: ro.id, delegationId: "d1", instructionOnly: true }]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ holders: via, valueBearing: true })))).toEqual(["INSTRUCTION_ONLY"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ holders: via, valueBearing: false })))).toEqual([]);
  });
  it("a block whose delegation answer is not decided refuses everyone, the holder too", () => {
    const blocks = [block(1, { delegable: null })];
    expect(codes(signFaults(blocks, [], input(1), ctx()))).toEqual(["DELEGABLE_NOT_SET"]);
  });
  it("an S.O. block with no supervision recorded for the contract (6.13 not built) refuses, naming it", () => {
    const blocks = [block(1, { officeRule: "SO", officeCode: null })];
    const r = signFaults(blocks, [], input(1), ctx({ holders: null }));
    expect(codes(r)).toEqual(["SUPERVISION_NOT_RECORDED"]);
  });
  it("an S.O. block accepts only the S.O. resolved for that day", () => {
    const blocks = [block(1, { officeRule: "SO", officeCode: null, delegable: false })];
    expect(codes(signFaults(blocks, [], input(1), ctx({ person: so, holders: holders([so.id]) })))).toEqual([]);
    expect(codes(signFaults(blocks, [], input(1), ctx({ person: ro, holders: holders([so.id]) })))).toEqual(["NOT_HOLDER"]);
  });
  it("one person signs one block", () => {
    const r = signFaults(INTERIM_BLOCKS, [signed(1, { personId: ro.id })], input(2), ctx({ person: ro, holders: holders([ro.id]) }));
    expect(codes(r)).toEqual(["SAME_PERSON"]);
  });
  it("nobody named, or someone inactive", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ person: null })))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED" }), ctx({ person: { ...ro, isActive: false } })))).toEqual(["INACTIVE"]);
  });
});

describe("the recommending block's answer", () => {
  it("is required where the block carries one, refused where it does not", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1), ctx()))).toEqual(["DECISION_REQUIRED"]);
    const r = signFaults(INTERIM_BLOCKS, [signed(1, { personId: "x" })], input(2, { decision: "SUPPORTED" }), ctx({ person: so, holders: holders([so.id]) }));
    expect(codes(r)).toEqual(["DECISION_NOT_ON_BLOCK"]);
  });
  it("a cap only with a supported answer, as money", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "NOT_SUPPORTED", decisionCap: "100.00" }), ctx()))).toEqual(["CAP_ONLY_WHEN_SUPPORTED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED", decisionCap: "100" }), ctx()))).toEqual(["CAP_FORMAT"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED", decisionCap: "100.00" }), ctx()))).toEqual([]);
  });
});

describe("outsiders: the contractor and a witness", () => {
  const two = [signed(1, { personId: ro.id, signedOn: "2026-09-28" }), signed(2, { personId: so.id, signedOn: "2026-09-29" })];
  it("signed on the day they signed the paper, by name", () => {
    const r = signFaults(INTERIM_BLOCKS, two, input(3, { name: "Contractor's signatory", signedOn: "2026-09-30" }), ctx({ person: null }));
    expect(codes(r)).toEqual([]);
    expect(r.signedOn).toBe("2026-09-30");
  });
  it("a name and a day are required; not in the future; not before an earlier block", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, two, input(3), ctx()))).toEqual(["NAME_REQUIRED", "SIGNED_ON_REQUIRED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, two, input(3, { name: "X", signedOn: "2026-10-01" }), ctx()))).toEqual(["FUTURE_DATE"]);
    expect(codes(signFaults(INTERIM_BLOCKS, two, input(3, { name: "X", signedOn: "2026-09-28" }), ctx()))).toEqual(["BEFORE_EARLIER"]);
  });
  it("an identity-card number, where given, is in its shape, and only the mask is kept", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, two, input(3, { name: "X", signedOn: TODAY, icNumber: "12345" }), ctx()))).toEqual(["IC_FORMAT"]);
    expect(maskedIc("900101-14-5678")).toBe("••••••••5678");
    expect(maskedIc("  ")).toBeNull();
  });
  it("FR-VAR-022: a contractor's refusal is recorded where the block allows it, with what was said, and the witness comes next", () => {
    const r = signFaults(INTERIM_BLOCKS, two, input(3, { name: "Contractor", signedOn: TODAY, refused: true, refusalNote: "Letter of 30 Sep refusing the valuation" }), ctx());
    expect(codes(r)).toEqual([]);
    expect(nextBlock(INTERIM_BLOCKS, [...two, signed(3, { refused: true })])?.blockOrder).toBe(4);
    expect(codes(signFaults(INTERIM_BLOCKS, two, input(3, { name: "Contractor", signedOn: TODAY, refused: true }), ctx()))).toEqual(["REFUSAL_NOTE_REQUIRED"]);
  });
  it("a refusal is not recorded on a block that does not allow it", () => {
    const three = [...two, signed(3)];
    expect(codes(signFaults(INTERIM_BLOCKS, three, input(4, { name: "W", signedOn: TODAY, refused: true, refusalNote: "n" }), ctx()))).toEqual(["REFUSAL_NOT_ALLOWED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, [], input(1, { decision: "SUPPORTED", refused: true }), ctx()))).toEqual(["REFUSAL_NOT_ALLOWED"]);
  });
});
