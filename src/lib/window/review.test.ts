import { describe, expect, it } from "vitest";

import { kelasText, NO_CLASS_ON_REGISTER, openingCsv, readText, SCHEDULE_COLUMNS, SUMMARY_COLUMNS, type DownloadOpening } from "@/lib/opening/download";

import { windowFindingText } from "./labels";
import { onlineAuthorityOf, saleChecks } from "./sale-checks";
import { voidSaleFault } from "./sale";

/** The SR-10 and SR-15 wave 3a review: M2 (an online sale is not voided), S7 (the online buyer's standing), M3 (one list of columns). */

describe("M2: a sale made by an online purchase is not voided", () => {
  it("is refused with words that say what is true, whatever the reason given", () => {
    const f = voidSaleFault({ voidedAt: null, purchaseId: "pur1" }, "OPEN_FOR_PURCHASE", "Entered in error");
    expect(f).toMatchObject({ code: "ONLINE_SALE", level: "block" });
    // 17b: the words no longer name "the procurement lead", a role the product does not have. They say the sale stands, it cannot be reversed in the portal yet,
    // the opening still judges standing and eligibility, and a refund follows the organisation's own finance procedure outside the portal.
    const words = windowFindingText(f!);
    expect(words).not.toMatch(/procurement lead/i);
    expect(words).toMatch(/stands/);
    expect(words).toMatch(/cannot be reversed in the portal yet/);
    expect(words).toMatch(/opening still judges the buyer's standing and eligibility/);
    expect(words).toMatch(/finance procedure outside the portal/);
    expect(windowFindingText(f!)).not.toMatch(/ONLINE_SALE/);
  });
  it("a counter sale is voided as before, and an already voided one says so first", () => {
    expect(voidSaleFault({ voidedAt: null, purchaseId: null }, "OPEN_FOR_PURCHASE", "Entered in error")).toBeNull();
    expect(voidSaleFault({ voidedAt: null }, "OPEN_FOR_PURCHASE", "Entered in error")).toBeNull();
    expect(voidSaleFault({ voidedAt: new Date(), purchaseId: "pur1" }, "OPEN_FOR_PURCHASE", "x")).toMatchObject({ code: "ALREADY_VOID" });
  });
});

describe("S7: an online sale shows the buyer's standing and not an officer's sighting", () => {
  const checks = [
    { key: "ON_SALE", state: "PASS", detail: "On sale." },
    { key: "AUTHORITY", state: "PASS", detail: "You are signed in as Aini, a current contact of your company on the supplier register, so you may buy the documents for it." },
  ];
  it("reads the AUTHORITY check the purchase kept, in the words the buyer was shown", () => {
    expect(onlineAuthorityOf(checks)).toEqual({ text: expect.stringContaining("signed in as Aini"), warn: false });
    expect(onlineAuthorityOf([{ key: "AUTHORITY", state: "BLOCK", detail: "No." }])).toEqual({ text: "No.", warn: true });
    expect(onlineAuthorityOf(null)).toBeNull();
    expect(onlineAuthorityOf([{ key: "ON_SALE", state: "PASS", detail: "x" }])).toBeNull();
  });
  it("replaces the 'Authority: not sighted' line, and a counter sale keeps it", () => {
    const base = { authoritySighted: false, certSighted: null, certValidUntil: null, registrationCheck: "CLEAR" as const, suspensionCheck: "CLEAR" as const, registerReadOn: null, noSupplierNamed: false };
    const online = saleChecks({ ...base, onlineAuthority: onlineAuthorityOf(checks) }, null);
    expect(online[0].text).toMatch(/^Buyer's standing \(read online/);
    expect(online.some((c) => /not sighted/.test(c.text))).toBe(false);
    expect(saleChecks(base, null)[0].text).toBe("Authority: not sighted");
  });
});

const LINE_END = new RegExp(String.fromCharCode(13) + "?" + String.fromCharCode(10));

describe("M3: the schedule's columns are one list for the screen, the print and the file", () => {
  const opening: DownloadOpening = {
    title: "Opening 1",
    finalised: true,
    finalisedAt: "12 Oct 2026",
    online: false,
    header: [],
    rows: [{ listingNo: 1, bidderName: "Maju Jaya", registrationClass: "G5", registerClass: "G7", registrationStatus: "Valid", registerStanding: null, statusHeld: false, openingPrice: { state: "GRANTED", value: "RM 100.00" } as never, period: "90 days", alternative: null }],
    benchmark: null,
    summary: { rows: [{ listingNo: 1, bidderName: "Maju Jaya", openingPrice: { state: "GRANTED", value: "RM 100.00" } as never, label: "Lowest" }] },
  };
  it("the schedule file's heading row is the list, in order, with Kelas (register) and Class as read", () => {
    const csv = (openingCsv("schedule", opening) as { csv: string }).csv;
    const c = SCHEDULE_COLUMNS;
    const heading = csv.split(LINE_END).find((l) => l.includes(c.kelas))!;
    expect(heading.replaceAll('"', "").split(",")).toEqual([c.listing, c.bidder, c.kelas, c.classAsRead, c.status, c.price, c.period]);
    expect(c.kelas).toBe("Kelas (register)");
    expect(c.classAsRead).toBe("Class as read");
  });
  it("the Grand Summary file's heading row is its list", () => {
    const csv = (openingCsv("summary", opening) as { csv: string }).csv;
    const c = SUMMARY_COLUMNS;
    const heading = csv.split(LINE_END).find((l) => l.includes(c.label))!;
    expect(heading.replaceAll('"', "").split(",")).toEqual([c.listing, c.bidder, c.kelas, c.price, c.period, c.label]);
  });
  it("Kelas is the register's reading and says so where there is none; the class as read keeps the envelope's", () => {
    expect(kelasText("G7")).toBe("G7");
    expect(kelasText(null)).toBe(NO_CLASS_ON_REGISTER);
    expect(kelasText("  ")).toBe(NO_CLASS_ON_REGISTER);
    expect(readText("")).toBe("—");
    expect(readText("G5")).toBe("G5");
  });
});
