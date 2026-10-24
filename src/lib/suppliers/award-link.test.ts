import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { awardVendorOnParty } from "./link";

/**
 * 6.15a fix M-1 (against accepted 6.11): a new award never took its awardee party's register link, and a
 * draft's changed awardee left the old link behind. The award now takes its party's link when the party is
 * written; an award linked on its own whose new party disagrees is refused, never silently relinked.
 */

describe("an award's register link follows its awardee party (fix M-1)", () => {
  it("create to a linked party: linked to that supplier; to an unlinked party: unlinked", () => {
    expect(awardVendorOnParty(null, "pty2", "vnd1")).toEqual({ vendorId: "vnd1", fault: null });
    expect(awardVendorOnParty(null, "pty3", null)).toEqual({ vendorId: null, fault: null });
  });

  it("no party (openings do not apply): the award keeps its own link, or none", () => {
    expect(awardVendorOnParty(null, null, null)).toEqual({ vendorId: null, fault: null });
    expect(awardVendorOnParty({ awardeePartyId: null, vendorId: "vnd1" }, null, null)).toEqual({ vendorId: "vnd1", fault: null });
  });

  it("change the awardee: the link follows the new party, linked or not", () => {
    expect(awardVendorOnParty({ awardeePartyId: "pty2", vendorId: "vnd1" }, "pty12", "vnd2")).toEqual({ vendorId: "vnd2", fault: null });
    expect(awardVendorOnParty({ awardeePartyId: "pty2", vendorId: "vnd1" }, "pty3", null)).toEqual({ vendorId: null, fault: null });
  });

  it("an award linked on its own, given a party linked elsewhere or not at all: refused (the links would disagree)", () => {
    const r = awardVendorOnParty({ awardeePartyId: null, vendorId: "vnd1" }, "pty12", "vnd2");
    expect(r.fault?.code).toBe("AWARD_LINK_DISAGREES");
    expect(awardVendorOnParty({ awardeePartyId: null, vendorId: "vnd1" }, "pty3", null).fault?.code).toBe("AWARD_LINK_DISAGREES");
    expect(supplierFaultText({ ...r.fault!, data: { awardSupplier: "VND-0001 · Demo Civil", partySupplier: "VND-0002 · Rekaan Maju" } })).toBe("The award is linked on its own to VND-0001 · Demo Civil on the register, and the bidder named is linked to VND-0002 · Rekaan Maju: the links would disagree. Link the bidder to the same supplier from the supplier's record first.");
    // The same supplier on both sides agrees.
    expect(awardVendorOnParty({ awardeePartyId: null, vendorId: "vnd1" }, "pty2", "vnd1")).toEqual({ vendorId: "vnd1", fault: null });
  });

  it("create and edit write vendorId from the rule, audit the link, and refuse a disagreement (source)", () => {
    const acts = readFileSync("src/app/awards/actions.ts", "utf8");
    const create = acts.slice(acts.indexOf("export async function createAward"), acts.indexOf("export async function updateAwardDetails"));
    expect(create).toMatch(/const link = awardVendorOnParty\(null, partyId, party\?\.vendor\?\.id \?\? null\)/);
    expect(create).toContain("vendorId: chosen?.ok ? chosen.vendorId : link.vendorId,");
    expect(create).toMatch(/supplierLink: "Follows the awardee party's link"/);
    const edit = acts.slice(acts.indexOf("export async function updateAwardDetails"), acts.indexOf("export async function updateAwardTerms"));
    expect(edit).toMatch(/awardVendorOnParty\(\{ awardeePartyId: l\.award\.awardeePartyId, vendorId: l\.award\.vendorId \}, partyWrite,/);
    expect(edit).toMatch(/if \(link\?\.fault\) return \{ ok: false, errors: \{ awardeePartyId:/);
    expect(edit).toContain("...(link && !fromRegister ? { vendorId: link.vendorId } : {})");
  });
});
