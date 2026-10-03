import { describe, expect, it } from "vitest";

import { snapshotFaults, totalsFrom } from "@/lib/certificate/snapshot";
import { parseSen } from "@/lib/money";

import { AdjustmentNetMissing, adjustmentFaults, adjustmentFigures, adjustmentSnapshot, issuedAdjustmentsFrom, issuedNet, readIssuedAdjustments, type AdjustmentLineIn } from "./ppjhk";

/**
 * The Certificate of Adjustment of Contract Sum (§8.8, FR-PAD-001–003, 005). The spec's worked example: section 1.1
 * additions 98,623.66, omissions 40,849.99 → nett 57,773.67; revised = 3,380,000.00 + 0 prior + 57,773.67 =
 * 3,437,773.67. A finance reader can check each line.
 */

const S = parseSen;
const line = (x: Partial<AdjustmentLineIn>): AdjustmentLineIn => ({ section: "VARIATION", trigger: "VARIATION", reference: "VO/1", description: "Variation", direction: "ADDITION", amount: S("1.00"), basis: "", orderId: "o1", ...x });
const WORKED = [line({ reference: "VO/1", amount: S("98623.66"), orderId: "o1" }), line({ reference: "VO/2", direction: "OMISSION", amount: S("40849.99"), orderId: "o2" })];
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("§8.8 worked example", () => {
  it("Nett 1.1 = 98,623.66 − 40,849.99 = 57,773.67; revised = 3,380,000.00 + 0 + 57,773.67 = 3,437,773.67", () => {
    const f = adjustmentFigures(S("3380000.00"), [], WORKED);
    expect(f).toMatchObject({ add11: S("98623.66"), omit11: S("40849.99"), net11: S("57773.67"), net12: 0n, net13: S("57773.67"), prior: 0n, revised: S("3437773.67") });
  });
  it("1.3 = 1.1 + 1.2, with prior issued adjustments in the reconciliation", () => {
    const f = adjustmentFigures(S("1077508.60"), [S("37800.00")], [...WORKED, line({ section: "OTHER", trigger: "PRICE_FLUCTUATION", reference: "PF/1", direction: "OMISSION", amount: S("1000.00"), basis: "Index method agreed at tender", orderId: null })]);
    expect(f).toMatchObject({ net12: S("-1000.00"), net13: S("56773.67"), prior: S("37800.00"), revised: S("1172082.27") });
  });
  it("the certificate's figures balance as the core recomputes them, and say the sum in words", () => {
    const { snapshot } = adjustmentSnapshot("2026-07-01", S("3380000.00"), [], WORKED);
    expect(snapshotFaults(snapshot)).toEqual([]);
    const t = totalsFrom(snapshot, new Map(snapshot.lines.map((l) => [l.key, l.value])));
    expect([t.get("net11"), t.get("net12"), t.get("net13"), t.get("revisedSum")]).toEqual(["57773.67", "0.00", "57773.67", "3437773.67"]);
    const words = snapshot.lines.find((l) => l.key === "revisedInWords")!;
    expect(words.value).toBe("Ringgit Malaysia three million four hundred and thirty-seven thousand seven hundred and seventy-three and sen sixty-seven only");
    expect(words.valueMs).toBe("Ringgit Malaysia tiga juta empat ratus tiga puluh tujuh ribu tujuh ratus tujuh puluh tiga dan sen enam puluh tujuh sahaja");
    expect(snapshot.lines.find((l) => l.key === "direction")).toMatchObject({ value: "Addition", valueMs: "Penambahan" });
  });
  it("the net an issued certificate moved the sum by reads back from its issue snapshot", () => {
    expect(issuedNet({ figures: { totals: [{ key: "net13", value: "-1000.00" }] } })).toBe(S("-1000.00"));
    expect(issuedNet(null)).toBeNull();
  });
});

describe("what refuses an adjustment (FR-PAD-001, 002, 003, 005)", () => {
  const base = { triggers: ["VARIATION", "PRICE_FLUCTUATION"] as const, lines: WORKED, ordersAdjusted: [], ordersIssued: ["o1", "o2"], inProgress: null, original: S("3380000.00"), prior: [] };
  it("a sound one", () => expect(adjustmentFaults({ ...base, triggers: [...base.triggers] })).toEqual([]));
  it("the contract type's triggers unset refuses, naming the setting; a trigger it does not provide for", () => {
    expect(codes(adjustmentFaults({ ...base, triggers: [] }))).toEqual(["TRIGGERS_NOT_SET"]);
    expect(codes(adjustmentFaults({ ...base, triggers: ["VARIATION"], lines: [line({ section: "OTHER", trigger: "PRICE_FLUCTUATION", reference: "PF/1", basis: "x", orderId: null })] }))).toEqual(["TRIGGER_NOT_ALLOWED"]);
  });
  it("only an issued order, once (never two live adjustments for one order; never twice in one)", () => {
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], ordersIssued: ["o1"] }))).toEqual(["ORDER_NOT_ISSUED"]);
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], ordersAdjusted: ["o2"] }))).toEqual(["ORDER_ALREADY_ADJUSTED"]);
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], lines: [WORKED[0], { ...WORKED[0], reference: "VO/1 again" }] }))).toEqual(["ORDER_ALREADY_ADJUSTED"]);
  });
  it("a 1.2 line needs its basis (FR-PAD-002, 005: the calculation attached); a 1.1 line is a variation's", () => {
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], lines: [line({ section: "OTHER", trigger: "PRICE_FLUCTUATION", reference: "PF/1", basis: " ", orderId: null })] }))).toEqual(["BASIS_REQUIRED"]);
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], lines: [line({ section: "OTHER", trigger: "VARIATION", reference: "X", basis: "b", orderId: null })] }))).toEqual(["SECTION_TRIGGER"]);
  });
  it("one in progress at a time; nothing to adjust; the sum never to nothing", () => {
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], inProgress: "the one in draft" }))).toEqual(["ADJUSTMENT_IN_PROGRESS"]);
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], lines: [] }))).toEqual(["NO_LINES"]);
    expect(codes(adjustmentFaults({ ...base, triggers: [...base.triggers], original: S("100.00"), lines: [line({ direction: "OMISSION", amount: S("100.00") })] }))).toEqual(["REVISED_NOT_POSITIVE"]);
  });
});

describe("run 3 review: the one reading of the issued adjustments refuses a net it cannot read", () => {
  const row = (id: string, status: string, net: string | null, issuedAt: string) => ({ id, certificate: { id: `c-${id}`, number: `N-${id}`, status, issuedAt: new Date(issuedAt), issueSnapshot: net == null ? { figures: { totals: [] } } : { figures: { totals: [{ key: "net13", value: net }] } } } });
  it("issued ones only, oldest first, each with its frozen net", () => {
    const r = issuedAdjustmentsFrom([row("b", "ISSUED", "-100.00", "2026-09-02"), row("a", "ISSUED", "57773.67", "2026-09-01"), row("d", "DRAFT", null, "2026-09-03")]);
    expect(r.map((x) => [x.id, x.net])).toEqual([["a", 5_777_367n], ["b", -10_000n]]);
  });
  it("an issued one with no net frozen is refused by name, never read as nothing", () => {
    expect(() => issuedAdjustmentsFrom([row("x", "ISSUED", null, "2026-09-01")])).toThrow(AdjustmentNetMissing);
    expect(() => issuedAdjustmentsFrom([row("x", "ISSUED", null, "2026-09-01")])).toThrow(/N-x/);
  });
});

describe("run 3 residual M1: a screen's reading refuses by name, without throwing", () => {
  const row = (id: string, net: string | null) => ({ id, certificate: { id: `c-${id}`, number: `N-${id}`, status: "ISSUED", issuedAt: new Date("2026-09-01"), issueSnapshot: { figures: { totals: net == null ? [] : [{ key: "net13", value: net }] } } } });
  it("readable: the same list as the acts read", () => {
    const r = readIssuedAdjustments([row("a", "100.00")]);
    expect(r.ok && r.issued.map((x) => x.net)).toEqual([10_000n]);
  });
  it("unreadable: refused, naming the certificate and its id", () => {
    const r = readIssuedAdjustments([row("a", "100.00"), row("x", null)]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refused.number).toBe("N-x");
      expect(r.refused.certificateId).toBe("c-x");
      expect(r.refused.message).toMatch(/N-x has no net frozen with its issue/);
    }
  });
});
