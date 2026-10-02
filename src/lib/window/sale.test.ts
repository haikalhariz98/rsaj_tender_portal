import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { manualFeeReceipt, uncollectedReceipts } from "@/lib/integration/fee-receipt";

import { event } from "./fixture";
import { windowFindingText } from "./labels";
import { annotationLines, certExpiresBeforeClosing, isAnnotation, isReceiptDuplicate, RECEIPT_INDEX, saleAnnotation, saleFaults, voidRefusalIsRegisterWide, voidRefusalNote, voidSaleFault, type SaleInput } from "./sale";

/**
 * FR-ADV-009–012, FR-DOC-009 at sale; OD-9 (register checks read "not checked", a warning, never a
 * pass); OD-11 (the finance receipt number consumed, unique, may come later); X-11 (no voiding once
 * closed).
 */

const codes = (fs: { code: string; level: string }[], level?: string) => fs.filter((f) => !level || f.level === level).map((f) => f.code);
const ok: SaleInput = {
  phase: "OPEN_FOR_PURCHASE",
  soldOn: "2026-11-05",
  closingDay: "2026-11-17",
  restricted: false,
  certSighted: null,
  certValidUntil: null,
  authoritySighted: true,
  registrationCheck: "NOT_CHECKED",
  suspensionCheck: "NOT_CHECKED",
  partyId: "p1",
  alreadySold: false,
  events: [],
  mandatoryPermitted: true,
  receiptNo: "OR-1001",
  receiptTaken: false,
  feeSet: true,
  collectedBy: "Siti binti Ali",
  paymentMethod: "Bank draft",
};

describe("a sale that passes", () => {
  it("passes with the register checks warned as not checked, never cleared", () => {
    const fs = saleFaults(ok);
    expect(codes(fs, "block")).toEqual([]);
    expect(codes(fs, "warn")).toEqual(["REGISTRATION_NOT_CHECKED", "SUSPENSION_NOT_CHECKED"]);
    expect(windowFindingText(fs[0])).toMatch(/not checked: the supplier register is not built yet/i);
  });
});

describe("each refusal", () => {
  it("outside the purchase phase: before it opens, and after the cut-off", () => {
    for (const phase of ["NOT_PUBLISHED", "PUBLISHED", "CLOSED_FOR_PURCHASE", "CLOSED", "CANCELLED"] as const) expect(codes(saleFaults({ ...ok, phase }), "block")).toEqual(["SALE_CLOSED"]);
  });
  it("restricted: certificate not shown, or with no expiry, or expired on the sale day", () => {
    expect(codes(saleFaults({ ...ok, restricted: true, certSighted: "NOT_SHOWN" }), "block")).toEqual(["CERT_NOT_SHOWN"]);
    expect(codes(saleFaults({ ...ok, restricted: true, certSighted: null }), "block")).toEqual(["CERT_NOT_SHOWN"]);
    expect(codes(saleFaults({ ...ok, restricted: true, certSighted: "ORIGINAL" }), "block")).toEqual(["CERT_EXPIRY_NOT_RECORDED"]);
    expect(codes(saleFaults({ ...ok, restricted: true, certSighted: "CERTIFIED_COPY", certValidUntil: "2026-11-04" }), "block")).toEqual(["CERT_EXPIRED"]);
  });
  it("restricted: valid on the sale day but expiring before the closing is warned", () => {
    const fs = saleFaults({ ...ok, restricted: true, certSighted: "ORIGINAL", certValidUntil: "2026-11-10" });
    expect(codes(fs, "block")).toEqual([]);
    expect(codes(fs, "warn")).toContain("CERT_EXPIRES_BEFORE_CLOSING");
    // Valid until the sale day itself passes.
    expect(codes(saleFaults({ ...ok, restricted: true, certSighted: "ORIGINAL", certValidUntil: "2026-11-05" }), "block")).toEqual([]);
  });
  it("the register re-judges a certificate against the closing as it stands: an extension past its day warns, valid on the closing day itself does not", () => {
    expect(certExpiresBeforeClosing("2026-11-10", "2026-11-17")).toBe(true);
    expect(certExpiresBeforeClosing("2026-11-10", "2026-11-10")).toBe(false);
    expect(certExpiresBeforeClosing("2026-11-17", "2026-11-17")).toBe(false);
    expect(certExpiresBeforeClosing("2026-11-17", "2026-11-24")).toBe(true);
    expect(certExpiresBeforeClosing(null, "2026-11-24")).toBe(false);
    expect(certExpiresBeforeClosing("2026-11-17", null)).toBe(false);
  });
  it("not restricted: the certificate is not asked", () => {
    expect(codes(saleFaults({ ...ok, certSighted: "NOT_SHOWN" }), "block")).toEqual([]);
  });
  it("the restriction unanswered refuses", () => expect(codes(saleFaults({ ...ok, restricted: null }), "block")).toEqual(["RESTRICTION_NOT_ANSWERED"]));
  it("the proof of authority not sighted, or not answered, refuses", () => {
    expect(codes(saleFaults({ ...ok, authoritySighted: null }), "block")).toEqual(["AUTHORITY_NOT_SIGHTED"]);
    expect(codes(saleFaults({ ...ok, authoritySighted: false }), "block")).toEqual(["AUTHORITY_NOT_SIGHTED"]);
  });
  it("a held mandatory event the party missed refuses; one not yet held refuses", () => {
    expect(codes(saleFaults({ ...ok, events: [event({ mandatory: true, heldOn: "2026-11-04", attendeePartyIds: ["p9"] })] }), "block")).toEqual(["ATTENDANCE_REQUIRED"]);
    expect(codes(saleFaults({ ...ok, events: [event({ mandatory: true })] }), "block")).toEqual(["EVENT_NOT_HELD"]);
    expect(codes(saleFaults({ ...ok, events: [event({ mandatory: true, heldOn: "2026-11-04", attendeePartyIds: ["p1"] })] }), "block")).toEqual([]);
  });
  it("a check the officer knows failed refuses", () => {
    expect(codes(saleFaults({ ...ok, registrationCheck: "FAILED" }), "block")).toEqual(["REGISTRATION_FAILED"]);
    expect(codes(saleFaults({ ...ok, suspensionCheck: "FAILED" }), "block")).toEqual(["SUSPENDED"]);
  });
  it("already sold refuses", () => expect(codes(saleFaults({ ...ok, alreadySold: true }), "block")).toEqual(["ALREADY_SOLD"]));
  it("a receipt number already taken refuses; none yet warns (reconciliation)", () => {
    expect(codes(saleFaults({ ...ok, receiptTaken: true }), "block")).toEqual(["RECEIPT_DUPLICATE"]);
    expect(codes(saleFaults({ ...ok, receiptNo: null }), "warn")).toContain("RECEIPT_NOT_RECORDED");
  });
  it("no fee, no collector, no payment method refuse", () => {
    expect(codes(saleFaults({ ...ok, feeSet: false, collectedBy: " ", paymentMethod: "" }), "block")).toEqual(["FEE_NOT_SET", "COLLECTOR_REQUIRED", "PAYMENT_METHOD_REQUIRED"]);
  });
  it("no organisation day refuses", () => expect(codes(saleFaults({ ...ok, soldOn: null }), "block")).toEqual(["TIME_ZONE_UNSET"]));
});

describe("voiding a sale (X-11)", () => {
  it("with a reason while the window is open", () => {
    expect(voidSaleFault({ voidedAt: null }, "OPEN_FOR_PURCHASE", "Wrong purchaser")).toBeNull();
    expect(voidSaleFault({ voidedAt: null }, "CLOSED_FOR_PURCHASE", "Wrong purchaser")).toBeNull();
    expect(voidSaleFault({ voidedAt: null }, "OPEN_FOR_PURCHASE", " ")?.code).toBe("REASON_REQUIRED");
  });
  it("refused once the window has closed, or cancelled, or voided", () => {
    expect(voidSaleFault({ voidedAt: null }, "CLOSED", "late")?.code).toBe("WINDOW_CLOSED");
    expect(voidSaleFault({ voidedAt: null }, "CANCELLED", "late")?.code).toBe("EXERCISE_CANCELLED");
    expect(voidSaleFault({ voidedAt: new Date() }, "OPEN_FOR_PURCHASE", "again")?.code).toBe("ALREADY_VOID");
  });
});

describe("voiding is refused for a party holding a bid envelope (65-C2)", () => {
  it("while the window is open, the envelope's holder keeps its sale", () => {
    expect(voidSaleFault({ voidedAt: null }, "OPEN_FOR_PURCHASE", "Wrong purchaser", true)?.code).toBe("ENVELOPE_HELD");
    expect(voidSaleFault({ voidedAt: null }, "OPEN_FOR_PURCHASE", "Wrong purchaser", false)).toBeNull();
  });
  it("it is the sale's own refusal, said under the sale, and named before the window's", () => {
    const f = voidSaleFault({ voidedAt: null }, "CLOSED", "-", true)!;
    expect(f.code).toBe("ENVELOPE_HELD");
    expect(voidRefusalIsRegisterWide(f)).toBe(false);
    expect(windowFindingText(f)).toMatch(/holds a bid envelope/);
  });
});

describe("a disabled Void states its reason on screen (65-C2)", () => {
  it("a window-wide refusal is said once for the register; a refusal about one sale under that sale", () => {
    expect(voidRefusalIsRegisterWide(voidSaleFault({ voidedAt: null }, "CLOSED", "-")!)).toBe(true);
    expect(voidRefusalIsRegisterWide(voidSaleFault({ voidedAt: null }, "CANCELLED", "-")!)).toBe(true);
    expect(voidRefusalIsRegisterWide(voidSaleFault({ voidedAt: new Date() }, "OPEN_FOR_PURCHASE", "-")!)).toBe(false);
  });
  it("the row note names the act before the reason", () => {
    expect(voidRefusalNote("The sale is already voided.")).toBe("Void is not available: The sale is already voided.");
  });
  it("the register shows the reason as text, beside the acts or under the row, not only as a tooltip", () => {
    const list = readFileSync(join(__dirname, "..", "..", "app", "sourcing", "[id]", "window", "sale-list.tsx"), "utf8");
    const section = readFileSync(join(__dirname, "..", "..", "app", "sourcing", "[id]", "window", "sale-section.tsx"), "utf8");
    expect(list).toMatch(/note:[^\n]*voidRefusalNote\(s\.void\.reason\)/);
    expect(section).toMatch(/\["Void a sale", d\.voidAll\]/);
  });
});

describe("the annotation (FR-ADV-011)", () => {
  it("snapshots the purchaser and the closing as stated, with the issuing officer, recorded on their behalf", () => {
    const a = saleAnnotation({ exerciseReference: "SX/1", purchaser: "Alpha Works", address: "1 Jalan Satu", phone: "", fax: "03-1", closingText: "17 Nov 2026 · 14:30", issuedBy: "Officer One", soldOnText: "05 Nov 2026", receiptNo: null });
    expect(isAnnotation(a)).toBe(true);
    expect(annotationLines(a)).toEqual([
      "Exercise: SX/1",
      "Issued to: Alpha Works",
      "Address: 1 Jalan Satu",
      "Telephone: Not recorded",
      "Fax: 03-1",
      "Closing: 17 Nov 2026 · 14:30",
      "Issued by: Officer One, on 05 Nov 2026 (recorded on behalf of, not signed)",
      "Receipt: Not recorded",
    ]);
    expect(isAnnotation({})).toBe(false);
  });
});

describe("the finance receipt (OD-11)", () => {
  it("is consumed, checked and unique; never minted", () => {
    expect(manualFeeReceipt.check({ number: "OR-1", recordedOn: "2026-11-05" }, { pattern: null, today: "2026-11-05", taken: false })).toEqual([]);
    expect(manualFeeReceipt.check({ number: " ", recordedOn: "2026-11-05" }, { pattern: null, today: "2026-11-05", taken: false })).toEqual(["NUMBER_REQUIRED"]);
    expect(manualFeeReceipt.check({ number: "X", recordedOn: "2026-11-06" }, { pattern: "OR-\\d+", today: "2026-11-05", taken: true })).toEqual(["FORMAT", "FUTURE_DATE", "TAKEN"]);
  });
  it("live sales with no receipt are the reconciliation list, oldest first", () => {
    const s = (id: string, day: string, receipt: string | null, voided = false) => ({ id, soldOn: new Date(day), financeReceiptNo: receipt, voidedAt: voided ? new Date() : null });
    expect(uncollectedReceipts([s("b", "2026-11-06", null), s("a", "2026-11-05", null), s("c", "2026-11-05", "OR-1"), s("d", "2026-11-04", null, true)]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("a receipt number taken on another exercise at the same moment (the unique index)", () => {
  // The shape observed from Prisma 7 + @prisma/adapter-pg (see scope/unique-violation.test.ts).
  const adapterError = (index: string) => ({ code: "P2002", meta: { modelName: "DocumentSale", driverAdapterError: { cause: { originalCode: "23505", originalMessage: `duplicate key value violates unique constraint "${index}"`, constraint: { fields: ['"organisationId"', '"financeReceiptNo"'] } } } } });
  it("the receipt index's violation is the RECEIPT_DUPLICATE refusal, in the adapter's shape and the engine's", () => {
    expect(isReceiptDuplicate(adapterError(RECEIPT_INDEX))).toBe(true);
    expect(isReceiptDuplicate({ code: "P2002", meta: { modelName: "DocumentSale", target: ["organisationId", "financeReceiptNo"] } })).toBe(true);
    expect(windowFindingText({ code: "RECEIPT_DUPLICATE", level: "block" })).toBe("That receipt number is already recorded on another sale.");
  });
  it("any other error is not dressed up as one", () => {
    expect(isReceiptDuplicate(adapterError("DocumentSale_one_live_per_party"))).toBe(false);
    expect(isReceiptDuplicate({ code: "P2002", meta: { modelName: "ExerciseParty", target: ["exerciseId", "registrationNo"] } })).toBe(false);
    expect(isReceiptDuplicate({ code: "P2025", meta: {} })).toBe(false);
    expect(isReceiptDuplicate(new Error("boom"))).toBe(false);
    expect(isReceiptDuplicate(null)).toBe(false);
  });
  it("the index name is the one the migrations create", () => {
    const dir = join(process.cwd(), "prisma/migrations");
    const sql = readdirSync(dir).filter((m) => !m.includes(".")).map((m) => { try { return readFileSync(join(dir, m, "migration.sql"), "utf8"); } catch { return ""; } }).join("\n");
    expect(sql).toContain(`CREATE UNIQUE INDEX "${RECEIPT_INDEX}" ON "DocumentSale"("organisationId", "financeReceiptNo")`);
  });
  it("the sale and the late receipt both map it to their refusal (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/window/register-actions.ts"), "utf8");
    expect(src).toMatch(/export async function recordSale[\s\S]*?return receiptGuarded\(\(\) => inWindow\([\s\S]*?\}\), refuse\(\[\{ code: "RECEIPT_DUPLICATE", level: "block" \}\], "Not sold:"\)\);/);
    expect(src).toMatch(/export async function recordReceipt[\s\S]*?return receiptGuarded\(\(\) => inWindow\([\s\S]*?\}\), \{ ok: false, errors: \{ financeReceiptNo: windowFindingText\(\{ code: "TAKEN", level: "block" \}\) \} \}\);/);
  });
});
