import { describe, expect, it } from "vitest";

import { signFaults } from "@/lib/certificate/signature";
import type { Block } from "@/lib/certificate/types";

import type { DelegationFacts } from "./authority";
import { isSupervisedRule, supervisedHolders } from "./blocks";

/**
 * BD-613-13: a certificate's S.O. blocks read the contract's supervision. Invented people and offices.
 * The S.O. office is held by p-so (p-act acting in it under a whole-office delegation); p-pri is a Principal
 * Representative whose letter issued on 1 October and was revoked from 20 October; p-spec a specialist.
 */

const so = { holderIds: ["p-so"], delegates: [{ personId: "p-act", delegationId: "d-office", instructionOnly: false }] };
const del = (over: Partial<DelegationFacts>): DelegationFacts => ({ id: "d1", kind: "PRINCIPAL", delegatePersonId: "p-pri", letterIssuedOn: "2026-10-01", revokedOn: "2026-10-20", scope: [], ...over });
const delegations = [del({}), del({ id: "d2", kind: "SPECIALIST", delegatePersonId: "p-spec", revokedOn: null })];

describe("who holds a supervised block", () => {
  it("the S.O.'s block: the office's holders and those acting in it", () => {
    expect(supervisedHolders("SO", so, delegations, "2026-10-05")).toBe(so);
  });
  it("the representative's block: Principal Representatives in force, from the letter's day to the day before revocation", () => {
    expect(supervisedHolders("SO_REP", so, delegations, "2026-09-30")).toBeNull();
    expect(supervisedHolders("SO_REP", so, delegations, "2026-10-01")).toEqual({ holderIds: ["p-pri"], delegates: [] });
    expect(supervisedHolders("SO_REP", so, delegations, "2026-10-19")).toEqual({ holderIds: ["p-pri"], delegates: [] });
    expect(supervisedHolders("SO_REP", so, delegations, "2026-10-20")).toBeNull();
  });
  it("a letter not issued gives no representative; a specialist never signs as the representative", () => {
    expect(supervisedHolders("SO_REP", so, [del({ letterIssuedOn: null })], "2026-10-05")).toBeNull();
    expect(supervisedHolders("SO_REP", so, [delegations[1]], "2026-10-05")).toBeNull();
  });
  it("no S.O. on the day: nobody holds any of them", () => {
    for (const r of ["SO", "SO_REP", "RECOMMENDING_OFFICER"] as const) expect(supervisedHolders(r, null, delegations, "2026-10-05")).toBeNull();
  });
  it("the recommending officer is not resolved yet: nobody is assumed", () => {
    expect(supervisedHolders("RECOMMENDING_OFFICER", so, delegations, "2026-10-05")).toBeNull();
  });
  it("only the three supervised rules", () => {
    expect(["SO", "SO_REP", "RECOMMENDING_OFFICER"].every(isSupervisedRule)).toBe(true);
    expect(["NAMED_OFFICE", "CONTRACTOR", "WITNESS"].some(isSupervisedRule)).toBe(false);
  });
});

describe("the block's signature reads them (6.14 signFaults, unchanged)", () => {
  const block: Block = { blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", labelMs: null, officeRule: "SO", officeCode: null, datesCertificate: true, delegable: true, carriesDecision: false, refusalAllowed: false };
  const input = { blockOrder: 1, name: "", icNumber: "", signedOn: null, refused: false, refusalNote: "", decision: null, decisionCap: null };
  const ctx = (personId: string, holders: ReturnType<typeof supervisedHolders>) => ({ status: "SIGNING" as const, today: "2026-10-05", person: { id: personId, name: personId, isActive: true }, holders, valueBearing: false, openedOn: "2026-10-01", approvedOn: null });
  it("the S.O. signs; someone acting in the whole office signs under delegation; anyone else is refused", () => {
    expect(signFaults([block], [], input, ctx("p-so", supervisedHolders("SO", so, delegations, "2026-10-05"))).faults).toEqual([]);
    expect(signFaults([block], [], input, ctx("p-act", supervisedHolders("SO", so, delegations, "2026-10-05"))).delegationId).toBe("d-office");
    expect(signFaults([block], [], input, ctx("p-pri", supervisedHolders("SO", so, delegations, "2026-10-05"))).faults.map((f) => f.code)).toEqual(["NOT_HOLDER"]);
  });
  it("with no supervision, the block refuses everyone", () => {
    expect(signFaults([block], [], input, ctx("p-so", supervisedHolders("SO", null, [], "2026-10-05"))).faults.map((f) => f.code)).toEqual(["SUPERVISION_NOT_RECORDED"]);
  });
});
