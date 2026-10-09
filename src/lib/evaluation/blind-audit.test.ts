import { describe, expect, it } from "vitest";

import { SULIT_FIELDS } from "@/lib/sulit-fields";
import { formatMoney, type Sen } from "@/lib/money";
import { asReadFields, openedBidFields } from "@/lib/opening/audit-view";

import { BLIND_FIGURE } from "./blind";
import { BLIND_NAME, BLIND_NAME_FIELDS, BLIND_PRICE_FIELDS, maskChange, maskRow, maskRowsForBlindReader, maskText, rowsMasked, type BlindBid, type BlindScope } from "./blind-audit";

// Decisions log, 2026-10-09, ruling on 1867(3) and 1869: a reader on the evaluation team of a version that holds identities back is shown the trail without them.

const price = 268_400_00n as Sen;
const bids: BlindBid[] = [
  { listingNo: 1, names: ["Maju Jaya Sdn. Bhd.", "MAJU JAYA", "201901012345"], figures: [formatMoney(price), "268400.00"] },
  { listingNo: 2, names: ["Bina Teguh Enterprise", "202001054321"], figures: [formatMoney(31_000_00n as Sen), "31000.00"] },
];
const scope: BlindScope = { exerciseId: "ex1", reference: "TA-2026-007", bids };

describe("maskText", () => {
  it("names a bid by its listing number, whatever the case it was written in", () => {
    expect(maskText("Offer from maju jaya sdn. bhd. received", bids)).toBe("Offer from Bid No. 1 received");
    expect(maskText("Bina Teguh Enterprise and MAJU JAYA", bids)).toBe("Bid No. 2 and Bid No. 1");
  });
  it("takes a price out of free text, formatted or plain", () => {
    expect(maskText(`Negotiated down from ${formatMoney(price)}`, bids)).toBe(`Negotiated down from ${BLIND_FIGURE}`);
    expect(maskText("price 31000.00 quoted", bids)).toBe(`price ${BLIND_FIGURE} quoted`);
  });
  it("replaces a name that holds another name whole", () => {
    expect(maskText("Maju Jaya Sdn. Bhd.", bids)).toBe("Bid No. 1");
  });
  it("leaves text that names nobody, and does not search for strings too short to be a name", () => {
    expect(maskText("Envelope 3 opened", bids)).toBe("Envelope 3 opened");
    expect(maskText("Ab and Bid", [{ listingNo: 9, names: ["Ab"], figures: [] }])).toBe("Ab and Bid");
  });
  it("holds back a text that two bids both claim, rather than guess whose it is", () => {
    const two: BlindBid[] = [
      { listingNo: 1, names: ["Joint Venture 123"], figures: [] },
      { listingNo: 2, names: ["Joint Venture 123"], figures: [] },
    ];
    expect(maskText("Joint Venture 123", two)).toBe(BLIND_NAME);
  });
});

describe("maskChange", () => {
  it("withholds a price field whole, and leaves an empty side empty", () => {
    expect(maskChange({ field: "openingPrice", before: null, after: "RM1.00" }, bids)).toEqual({ field: "openingPrice", before: null, after: BLIND_FIGURE });
  });
  it("shows a bidder field as the bid's number where it is one of the bids, and holds back one that is not", () => {
    expect(maskChange({ field: "bidder", before: null, after: "Maju Jaya Sdn. Bhd." }, bids).after).toBe("Bid No. 1");
    expect(maskChange({ field: "bidder", before: "Someone Else Trading", after: null }, bids).before).toBe(BLIND_NAME);
  });
  it("takes names out of any other field's text", () => {
    expect(maskChange({ field: "reason", before: "x", after: "Bina Teguh Enterprise withdrew" }, bids).after).toBe("Bid No. 2 withdrew");
  });
});

describe("the opening's own rows", () => {
  const opened = openedBidFields({ listingNo: 1, envelope: "Envelope 1", bidder: "Maju Jaya Sdn. Bhd.", registrationClass: "Grade 7", registrationStatus: "Valid", price, period: null, validityDays: 90, alternative: null, parentListingNo: null, sale: "LIVE_SALE", restriction: "NOT_RESTRICTED", at: new Date("2026-10-01T02:00:00Z") }, "Asia/Kuala_Lumpur");
  const changes = Object.entries(opened).map(([field, after]) => ({ field, before: null as string | null, after: after as string | null }));
  const row = { id: "a1", entityId: "ob1", entityLabel: "TA-2026-007 · Offer 1", reason: "", changes };

  it("shows no bidder name and no price, in the fields or the label", () => {
    const shown = JSON.stringify(maskRow(row, bids));
    expect(shown).not.toMatch(/Maju Jaya/i);
    expect(shown).not.toContain(formatMoney(price));
    expect(shown).toContain("Bid No. 1");
  });
  it("masks a correction's before and after, whose names were just corrected", () => {
    const was = asReadFields({ bidder: "Maju Jaya Sdn. Bhd.", registrationClass: "", registrationStatus: "", price, period: null, validityDays: null });
    const next = asReadFields({ bidder: "Bina Teguh Enterprise", registrationClass: "", registrationStatus: "", price: 1_00n as Sen, period: null, validityDays: null });
    const fields = Object.keys(was).map((field) => ({ field, before: (was as Record<string, string | null>)[field], after: (next as Record<string, string | null>)[field] }));
    const shown = JSON.stringify(maskRow({ entityLabel: "TA-2026-007 · Offer 1", reason: "Misread: Maju Jaya", changes: fields }, bids));
    expect(shown).not.toMatch(/Maju Jaya|Bina Teguh/i);
  });
  it("returns a row that held nothing as the same row", () => {
    const plain = { id: "b", entityId: "e", entityLabel: "TA-2026-007 · Opening", reason: "", changes: [{ field: "status", before: "A", after: "B" }] };
    expect(maskRow(plain, bids)).toBe(plain);
  });
});

describe("maskRowsForBlindReader", () => {
  const mine = { id: "1", entityId: "x", entityLabel: "TA-2026-007 · Offer 1 · Maju Jaya", reason: "", changes: [] };
  const other = { id: "2", entityId: "y", entityLabel: "TA-2026-008 · Offer 1 · Maju Jaya", reason: "", changes: [] };
  it("masks the rows of the exercises the reader is blind to and no others", () => {
    const out = maskRowsForBlindReader([mine, other], [scope]);
    expect(out[0].entityLabel).toBe("TA-2026-007 · Offer 1 · Bid No. 1");
    expect(out[1]).toBe(other);
    expect(rowsMasked([mine, other], out)).toBe(1);
  });
  it("returns every row as it was where the reader is blind to none", () => {
    expect(maskRowsForBlindReader([mine, other], [])).toEqual([mine, other]);
  });
});

describe("the field sets keep up with the registry", () => {
  it("names every registered SULIT field that is a bid's price", () => {
    const priced = SULIT_FIELDS.filter((f) => (f.scope === "exercise" || f.scope === "evaluation") && /price|balances/i.test(f.field) && !/estimate/i.test(f.field)).map((f) => f.field);
    for (const f of priced) expect(BLIND_PRICE_FIELDS.has(f), f).toBe(true);
  });
  it("keeps names and prices apart", () => {
    for (const f of BLIND_NAME_FIELDS) expect(BLIND_PRICE_FIELDS.has(f), f).toBe(false);
  });
});
