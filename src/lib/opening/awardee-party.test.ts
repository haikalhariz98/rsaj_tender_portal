import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { awardAuditCreate, awardAuditPair } from "@/lib/award/audit-view";
import { fieldLabel } from "@/lib/audit/diff";

import { awardeeBidderText, awardeePartyWrite } from "./award-gate";

/**
 * Review R-2 (flagged, 6.11): an award's party is written only where the openings apply and the
 * party was carried to evaluation; on an exercise outside 6.7 a posted party is ignored. Review R-7:
 * the trail names the bidder, never the party's id.
 */

const carried = new Set(["pty2", "pty3"]);

describe("which party an award records (R-2)", () => {
  it("openings apply, a carried party: written", () => expect(awardeePartyWrite({ applies: true, carriedPartyIds: carried }, "pty2")).toBe("pty2"));
  it("openings apply, not carried or none: nothing written (the gate refuses it first)", () => {
    expect(awardeePartyWrite({ applies: true, carriedPartyIds: carried }, "pty9")).toBeUndefined();
    expect(awardeePartyWrite({ applies: true, carriedPartyIds: carried }, null)).toBeUndefined();
  });
  it("openings do not apply (Phase 1, X-9): a posted party is never written, even one the client claims", () => {
    expect(awardeePartyWrite({ applies: false, carriedPartyIds: new Set() }, "pty2")).toBeUndefined();
    expect(awardeePartyWrite({ applies: false, carriedPartyIds: carried }, "pty2")).toBeUndefined();
  });
  it("both award actions write the party through it, never the posted id directly", () => {
    const src = readFileSync("src/app/awards/actions.ts", "utf8");
    expect(src).toMatch(/awardeePartyId: awardeePartyWrite\(opening, awardeePartyId\) \?\? null/);
    expect(src).toMatch(/const partyWrite = opening \? awardeePartyWrite\(opening, awardeePartyId\) : undefined;/);
    expect(src).not.toMatch(/\.\.\.\(partyPosted \? \{ awardeePartyId \} : \{\}\)/);
    expect(src).not.toMatch(/awardeePartyId: opening\.applies \? awardeePartyId : null/);
  });
});

describe("the trail names the bidder (R-7)", () => {
  const list = [{ id: "pty2", name: "Contoh Bina Sdn Bhd", registrationNo: "DEMO-0002-K" }];
  it("by name and registration; one no longer carried says so; none is null", () => {
    expect(awardeeBidderText(list, "pty2")).toBe("Contoh Bina Sdn Bhd (DEMO-0002-K)");
    expect(awardeeBidderText(list, "pty9")).toBe("A bidder no longer carried to evaluation");
    expect(awardeeBidderText(list, null)).toBeNull();
  });
  it("the award's audit view never carries the party's id", () => {
    const create = awardAuditCreate({ id: "a1", awardeePartyId: "pty2", awardeeName: "Contoh Bina" });
    expect(create.map((c) => c.field)).not.toContain("awardeePartyId");
    expect(JSON.stringify(create)).not.toContain("pty2");
    expect(awardAuditPair({ awardeePartyId: "pty2" }, { awardeePartyId: "pty3" })).toEqual([]);
    expect(fieldLabel("awardeeBidder")).toBe("Bidder carried to evaluation");
  });
});

describe("the award's gates are always told the openings (R-7)", () => {
  it("IssueInput and submitFaults' input require `opening` (null where none apply): leaving it out does not compile", async () => {
    type Issue = import("@/lib/award/gate").IssueInput;
    type Submit = Parameters<typeof import("@/lib/award/appointment").submitFaults>[0];
    // A key is required when an object without it is not assignable to it.
    type Required<T, K extends keyof T> = Record<string, never> extends Pick<T, K> ? false : true;
    type Facts = Parameters<typeof import("@/lib/award/evaluate").evaluateAward>[0]["exercise"];
    const required: [Required<Issue, "opening">, Required<Submit, "opening">, Required<Facts, "opening">] = [true, true, true];
    expect(required).toEqual([true, true, true]);
  });
});
