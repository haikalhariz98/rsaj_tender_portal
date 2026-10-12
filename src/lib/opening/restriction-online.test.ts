import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { RestrictionReading } from "@/lib/suppliers/restriction-register";
import { onlineRestrictionOf, saleChecks } from "@/lib/window/sale-checks";

import { liveSaleOf, restrictionFinding, saleFinding, type SaleFacts } from "./findings";
import { ALL_PRESENT, CHECKLIST, open } from "./fixture";
import { openingFindingText, RESTRICTION_FINDING_LABEL, restrictionLabel } from "./labels";
import { judgeBid, verdictFaults, type BidForVerdict, type VerdictPolicy } from "./verdict";

/**
 * Ruling 17a at the opening. A renewal on the supplier register waiting for its check reads NOT_ASSESSED: no verdict is recorded (neither carried nor rejected), the words say why, and an unsettled
 * bid is never quietly evidenced. A counter sale is judged exactly as before. The counter reading ignores a purchase.
 */

const bid = (over: Partial<BidForVerdict> = {}): BidForVerdict => ({ saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ...over });
const policy: VerdictPolicy = { completenessEliminates: false, unpurchased: "REPORT" };
const v = (b: BidForVerdict, verdict: "PASS" | "REJECT", reason = "") => verdictFaults({ state: open(), sameOpening: true, bid: b, checklist: CHECKLIST, answers: ALL_PRESENT, policy, verdict, reason }).map((f) => f.code);

describe("17a: a restriction not assessed holds the verdict", () => {
  it("is neither a ground nor a pass: it is a blocking 'not set' entry, so a PASS is refused and a REJECT is refused too", () => {
    const j = judgeBid(bid({ restrictionFinding: "NOT_ASSESSED" }), CHECKLIST, ALL_PRESENT, policy);
    expect(j.grounds).toEqual([]);
    expect(j.notSet.map((f) => f.code)).toEqual(["RESTRICTION_NOT_ASSESSED"]);
    expect(v(bid({ restrictionFinding: "NOT_ASSESSED" }), "PASS")).toEqual(["RESTRICTION_NOT_ASSESSED"]);
    expect(v(bid({ restrictionFinding: "NOT_ASSESSED" }), "REJECT", "Not sure.")).toEqual(["RESTRICTION_NOT_ASSESSED"]);
  });
  it("ends when the register settles it: evidenced is carried, not evidenced is eliminatory, so the opening can finish", () => {
    expect(v(bid({ restrictionFinding: "EVIDENCED" }), "PASS")).toEqual([]);
    expect(v(bid({ restrictionFinding: "NOT_EVIDENCED" }), "PASS")).toEqual(["PASS_NOT_EVIDENCED"]);
    expect(v(bid({ restrictionFinding: "NOT_EVIDENCED" }), "REJECT", "Not on the register.")).toEqual([]);
  });
  it("says why in words and carries no code", () => {
    const w = openingFindingText({ code: "RESTRICTION_NOT_ASSESSED", level: "block" });
    expect(w).toMatch(/waiting for an officer to verify/);
    expect(w).toMatch(/read again each time you act on this offer/);
    expect(w).not.toMatch(/RESTRICTION_NOT_ASSESSED|NOT_ASSESSED/);
  });
  it("the configuration gaps are blocking faults in words naming the setting", () => {
    for (const code of ["RESTRICTION_EVIDENCE_TYPE_NOT_SET", "RESTRICTION_CLOSING_DAY_RULE_NOT_SET"]) {
      const w = openingFindingText({ code, level: "block" });
      expect(w).toMatch(/Configuration, Suppliers/);
      expect(w).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
});

describe("17a: the finding's words say the register, never a sighting", () => {
  const reading = { source: "SUPPLIER_REGISTER", finding: "EVIDENCED" } as unknown as RestrictionReading;
  it("a register reading is labelled verified on, or not evidenced on, the supplier register", () => {
    expect(restrictionLabel("EVIDENCED", reading)).toBe("Restriction verified on the supplier register");
    expect(restrictionLabel("NOT_EVIDENCED", reading)).toBe("Restriction not evidenced on the supplier register");
    expect(restrictionLabel("NOT_ASSESSED", reading)).toMatch(/waiting to be verified/);
  });
  it("a counter sale (no register reading) keeps its labels", () => {
    expect(restrictionLabel("EVIDENCED", null)).toBe(RESTRICTION_FINDING_LABEL.EVIDENCED);
    expect(restrictionLabel("NOT_EVIDENCED", null)).toBe(RESTRICTION_FINDING_LABEL.NOT_EVIDENCED);
    expect(RESTRICTION_FINDING_LABEL.NOT_ASSESSED).toBe("Restriction not assessed");
  });
});

describe("17a: the counter's reading is unchanged, and an online sale is told apart by its purchase", () => {
  const counterSale: SaleFacts = { partyId: "p1", voided: false, certSighted: "ORIGINAL", certValidUntil: "2026-12-31" };
  const onlineSale: SaleFacts = { partyId: "p2", voided: false, certSighted: null, certValidUntil: null, purchaseSupplierId: "s2" };
  it("a counter sale is judged on its sighted certificate", () => {
    expect(restrictionFinding(true, counterSale, "2026-11-30")).toEqual({ finding: "EVIDENCED" });
    expect(restrictionFinding(true, { ...counterSale, certValidUntil: "2026-11-01" }, "2026-11-30")).toEqual({ finding: "NOT_EVIDENCED" });
  });
  it("the sale facts name the purchase's supplier, which the opening reads the register by, not the party the officer picked", () => {
    expect(liveSaleOf("p2", [counterSale, onlineSale])?.purchaseSupplierId).toBe("s2");
    expect(liveSaleOf("p1", [counterSale, onlineSale])?.purchaseSupplierId).toBeUndefined();
    expect(saleFinding("p2", [onlineSale], "ADVERTISED", new Set())).toBe("LIVE_SALE");
  });
  it("openEnvelope reads the register after the exercise side is locked and before the offer is written, only for a sale from a purchase", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function openEnvelope("), src.indexOf("export async function recordAlternative("));
    expect(body).toMatch(/snap\.restrictedTender === true && liveSale\?\.purchaseSupplierId \? await registerRestrictionOf\(/);
    expect(body.indexOf("inOpening(")).toBeLessThan(body.indexOf("registerRestrictionOf("));
    expect(body.indexOf("registerRestrictionOf(")).toBeLessThan(body.indexOf("tx.openedBid.create"));
    expect(body).toMatch(/restrictionReading: readingJson\(restrictionReading\)/);
  });
  it("the verdict, the checklist answer, the initial and the correction each read a restriction not assessed again before they judge", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const parts: [string, string][] = [
      ["export async function recordInitial(", "export async function recordChecklistAnswer("],
      ["export async function recordChecklistAnswer(", "/// The method's unpurchased-bid rule"],
      ["export async function recordVerdict(", "/// OD-10: correct a keying slip"],
      ["export async function correctAsRead(", "// ------------------------------------------------------------------ the schedule's paper"],
    ];
    for (const [from, to] of parts) {
      const body = src.slice(src.indexOf(from), src.indexOf(to));
      // Review of 17a (finding 2): the retake takes the opening itself (so it can see that it is finalised) and runs only after the act has been judged able to proceed.
      expect(body, from).toMatch(/retakeRestriction\(tx, actor, l, c, o, bid, now\)/);
      expect(body.indexOf("blocking("), from).toBeGreaterThan(-1);
      expect(body.indexOf("blocking("), from).toBeLessThan(body.indexOf("retakeRestriction("));
    }
    // The verdict judges on the finding just read, not the one it loaded.
    const verdict = src.slice(src.indexOf("export async function recordVerdict("), src.indexOf("/// OD-10: correct a keying slip"));
    expect(verdict).toMatch(/restrictionFinding: retaken\.finding/);
  });
  it("an alternative carries its main offer's reading, and a retake reads every offer of the same bidder", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    expect(src).toMatch(/restrictionReading: main\.restrictionReading as Prisma\.InputJsonValue/);
    const retake = readFileSync("src/app/sourcing/[id]/opening/restriction.ts", "utf8");
    expect(retake).toMatch(/o\.bids\.filter\(\(x\) => x\.partyId === bid\.partyId && x\.restrictionFinding === "NOT_ASSESSED"\)/);
    // Review of 17a (finding 5): the alternative's audit carries the reading's words, as the offer's own does.
    const alt = src.slice(src.indexOf("export async function recordAlternative("), src.indexOf("// ------------------------------------------------------------------ initials"));
    expect(alt).toMatch(/restrictionLabel\(main\.restrictionFinding, main\.restrictionReading\)/);
    expect(alt).toMatch(/restrictionReadingWords\(main\.restrictionReading\)/);
  });
});

describe("17a: the sale register shows the register's reading in place of a sighted certificate", () => {
  const kept = [
    { key: "ON_SALE", state: "PASS", detail: "On sale." },
    { key: "RESTRICTION", state: "PASS", detail: "The notice restricts who may tender. Verified on the supplier register: your document STA-1, valid until 31 Dec 2027." },
  ];
  const base = { authoritySighted: false, certSighted: null, certValidUntil: null, registrationCheck: "CLEAR" as const, suspensionCheck: "CLEAR" as const, registerReadOn: "2026-10-12", noSupplierNamed: false };
  it("reads the RESTRICTION check the purchase kept, in the words the buyer was shown", () => {
    expect(onlineRestrictionOf(kept)).toEqual({ text: expect.stringMatching(/Verified on the supplier register: your document STA-1/), warn: false });
    expect(onlineRestrictionOf([{ key: "RESTRICTION", state: "WARN", detail: "x" }])?.warn).toBe(true);
    expect(onlineRestrictionOf(null)).toBeNull();
    expect(onlineRestrictionOf([{ key: "ON_SALE", state: "PASS", detail: "x" }])).toBeNull();
  });
  it("shows 'verified on the supplier register' and no sighted-certificate line", () => {
    const rows = saleChecks({ ...base, onlineRestriction: onlineRestrictionOf(kept) }, "2026-11-30");
    const restriction = rows.find((r) => r.text.startsWith("Restriction"));
    expect(restriction?.text).toMatch(/Verified on the supplier register/);
    expect(rows.some((r) => /Status certificate/.test(r.text))).toBe(false);
    expect(rows.map((r) => r.text).join(" ")).not.toMatch(/original sighted/i);
  });
  it("a counter sale still shows its sighted certificate", () => {
    const rows = saleChecks({ ...base, authoritySighted: true, certSighted: "ORIGINAL", certValidUntil: "2027-01-01" }, "2026-11-30");
    expect(rows.some((r) => /Status certificate/.test(r.text))).toBe(true);
  });
});
