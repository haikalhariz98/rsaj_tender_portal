import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { DAL_FIXTURE } from "./dal-fixture";
import { resolveApproval } from "./resolve";
import type { ResolveQuery } from "./types";
import { toPosix } from "@/lib/scan/files";

/**
 * Spec §6.9.3: the worked routing examples the engine must reproduce, as regression
 * tests (close-out ruling C5, CO-9) on the test-only Appendix B fixture. The section
 * prints fourteen rows; the interim-payment row states two values (RM620,000 and
 * RM80,000), and both are asserted. Each chain is read as a routing sheet reads it:
 * office and act, in order.
 */

/// ADR 0024 Amendment 1 (6.13 Part A step 1): a percentage is the exact ratio of two amounts. Examples 7–9 and 12
/// change their input shape only (12% as 90,000.00 / 750,000.00, …); every expectation is unchanged.
const ratio = (num: string, den: string) => ({ num: parseSen(num), den: parseSen(den) });

const trace = (q: ResolveQuery) => {
  const r = resolveApproval(DAL_FIXTURE, q);
  return { r, chain: r.chain.map((s) => `${s.roleCode}:${s.act}`) };
};
const noErrors = (r: ReturnType<typeof resolveApproval>) => expect(r.warnings.filter((w) => w.level === "err")).toEqual([]);

describe("§6.9.3 worked routing examples", () => {
  it("1. Requisition, estimated value RM420,000 → HoD P → HoDiv R → FD MR → CEO A (§3.1.4.1)", () => {
    const { r, chain } = trace({ domain: "requisition", value: 420_000 });
    noErrors(r);
    expect(chain).toEqual(["HOD:P", "HODIV:R", "FD:MR", "CEO:A"]);
    expect(r.chain.find((s) => s.roleCode === "FD")?.nonDelegable).toBe(true);
  });

  it("2. Open quotation appointment, RM180,000 → the §2.2.1 chain → Quotation Committee MR (non-delegable, a committee decision) → CEO A (§3.1.4.2 item 2)", () => {
    const { r, chain } = trace({ domain: "appointment", method: "open_selective", value: 180_000 });
    noErrors(r);
    expect(chain).toEqual(["HOD:P", "HODIV:JP", "FD:R", "QC:MR", "CEO:A"]);
    const qc = r.chain.find((s) => s.roleCode === "QC")!;
    expect(qc).toMatchObject({ committeeCode: "QC", nonDelegable: true });
  });

  it("3. Open tender appointment, RM8,400,000 → Tender Board Committee A; no Chairman or Board row at any value (§3.1.4.2 item 2)", () => {
    const { r, chain } = trace({ domain: "appointment", method: "open_selective", value: 8_400_000 });
    noErrors(r);
    expect(chain).toEqual(["TBC:A"]);
    expect(chain.some((s) => s.startsWith("CM:") || s.startsWith("BOD:"))).toBe(false);
  });

  it("4. Direct purchase, RM4,200,000 → Tender Board Committee MR → Chairman A (§3.1.4.2 item 1)", () => {
    const { r, chain } = trace({ domain: "appointment", method: "direct", value: 4_200_000 });
    noErrors(r);
    expect(chain).toEqual(["TBC:MR", "CM:A"]);
  });

  it("5. Direct purchase, RM6,000,000 → HoD P → HoDiv JR → Tender Board Committee MR → Board of Directors A (§3.1.4.2 item 1)", () => {
    const { r, chain } = trace({ domain: "appointment", method: "direct", value: 6_000_000 });
    noErrors(r);
    expect(chain).toEqual(["HOD:P", "HODIV:JR", "TBC:MR", "BOD:A"]);
  });

  it("6. Letter of Acceptance signature, contract value RM2,100,000 → C&P R → FD A, as Superintending Officer (§3.1.4.4 item 5b)", () => {
    const { r, chain } = trace({ domain: "signing", method: "tender", contractValue: 2_100_000 });
    noErrors(r);
    expect(chain).toEqual(["CP:R", "FD:A"]);
    expect(r.rule?.clause).toBe("§3.1.4.4 item 5b");
  });

  it("7. VO of 12% on a RM750,000 tender contract → VOC MR (non-delegable) → CEO A: contract above RM300K up to RM1M, VO above 10% up to 15% (§3.1.4.4 item 7c(ii))", () => {
    const { r, chain } = trace({ domain: "vo", method: "tender", pctRatio: ratio("90000.00", "750000.00"), contractValue: 750_000 });
    noErrors(r);
    expect(chain).toEqual(["VOC:MR", "CEO:A"]);
    expect(r.rule?.clause).toBe("§3.1.4.4 item 7c(ii)");
    expect(r.chain[0].nonDelegable).toBe(true);
  });

  it("8. VO of 12% on a RM2,400,000 tender contract → CEO A: the same percentage, a different cell (§3.1.4.4 item 7b(ii))", () => {
    const { r, chain } = trace({ domain: "vo", method: "tender", pctRatio: ratio("288000.00", "2400000.00"), contractValue: 2_400_000 });
    noErrors(r);
    expect(chain).toEqual(["VOC:MR", "CEO:A"]);
    expect(r.rule?.clause).toBe("§3.1.4.4 item 7b(ii)");
  });

  it("9. VO of 12% on a RM180,000 quotation contract → Head of Division A, and no MR at that band (§3.1.4.3 item 5c)", () => {
    const { r, chain } = trace({ domain: "vo", method: "quotation", pctRatio: ratio("21600.00", "180000.00"), contractValue: 180_000 });
    noErrors(r);
    expect(chain).toEqual(["HODIV:A"]);
    expect(chain.some((s) => s.startsWith("VOC:"))).toBe(false);
  });

  it("10. Interim payment of RM620,000 on a RM9,000,000 contract → CEO A; at RM80,000 on the same contract → Head of Division A (§3.1.4.4 item 16)", () => {
    const high = trace({ domain: "payment", method: "tender", value: 620_000, contractValue: 9_000_000 });
    noErrors(high.r);
    expect(high.chain).toEqual(["CEO:A"]);
    // The spec's §6.9.3 text: item 16a above RM500,000, item 16c up to RM100,000.
    expect(high.r.rule?.clause).toBe("§3.1.4.4 item 16a");
    const low = trace({ domain: "payment", method: "tender", value: 80_000, contractValue: 9_000_000 });
    noErrors(low.r);
    expect(low.chain).toEqual(["HODIV:A"]);
    expect(low.r.rule?.clause).toBe("§3.1.4.4 item 16c");
  });

  it("11. Extension of time with financial impact not caused by an authority requirement → VOC MR → Tender Board Committee A (§3.1.4.4 item 10a(i))", () => {
    const { r, chain } = trace({ domain: "eot", method: "tender", cond: "financial_not_authority" });
    noErrors(r);
    expect(chain).toEqual(["VOC:MR", "TBC:A"]);
  });

  it("12. Waiver of 40% of an LAD amount, tender regime → Tender Board Committee A; at 25% → CEO A — a percentage of the LAD, not the contract sum (§3.1.4.4 item 12)", () => {
    const above = trace({ domain: "lad_waiver", method: "tender", pctRatio: ratio("3232.56", "8081.40"), contractValue: 9_000_000 });
    noErrors(above.r);
    expect(above.chain).toEqual(["TBC:A"]);
    const within = trace({ domain: "lad_waiver", method: "tender", pctRatio: ratio("2020.35", "8081.40"), contractValue: 9_000_000 });
    noErrors(within.r);
    expect(within.chain).toEqual(["CEO:A"]);
  });

  it("13. Termination, tender regime → C&P P → HoDiv R → CEO A, as the DAL has it (§3.1.4.4 item 13; SK008 §7.5.1 conflicts — D2)", () => {
    const { r, chain } = trace({ domain: "termination", method: "tender", value: 1_000_000 });
    noErrors(r);
    expect(chain).toEqual(["CP:P", "HODIV:R", "CEO:A"]);
  });

  it("14. Advance payment, any value, tender regime → C&P P → HoDiv R → CEO A; no value band, and no row at all in the quotation regime (§3.1.4.4 item 15)", () => {
    for (const value of [1, 50_000, 25_000_000]) {
      const { r, chain } = trace({ domain: "advance_payment", method: "tender", value });
      noErrors(r);
      expect(chain).toEqual(["CP:P", "HODIV:R", "CEO:A"]);
    }
    const quotation = resolveApproval(DAL_FIXTURE, { domain: "advance_payment", method: "quotation", value: 50_000 });
    expect(quotation.rule).toBeNull();
    expect(quotation.warnings.map((w) => w.code)).toEqual(["NO_RULE"]);
  });
});

describe("the Appendix B fixture is for tests only (C5)", () => {
  it("is imported by nothing the product runs or seeds", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? (f === "generated" || f === "migrations" ? [] : walk(p)) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [toPosix(p)] : [];
      });
    const importers = [...walk(join(process.cwd(), "src")), ...walk(join(process.cwd(), "prisma"))].filter((f) => !f.endsWith("dal-fixture.ts") && readFileSync(f, "utf8").includes("dal-fixture"));
    expect(importers).toEqual([]);
  });
});

describe("§6.9.3 examples and the core routing (FR-APR-004, ruling on departure 2)", () => {
  const ruleOf = (key: string) => DAL_FIXTURE.rules.find((r) => r.ruleKey === key)!;

  it("(21) examples 1 and 2 take their chains from the core routing; example 5 is as entered, with its stated reason", () => {
    expect(ruleOf("REQ_ABOVE_300K").generateCoreChain).toBe(true);
    expect(ruleOf("OS_15K_TO_300K").generateCoreChain).toBe(true);
    expect(ruleOf("DP_ABOVE_5M").generateCoreChain).toBe(false);
    expect(ruleOf("DP_ABOVE_5M").coreChainReason).toBe("§3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO");
  });

  it("(20) example 1's chain is generated: the rule itself names neither the Head of Department nor a proposer", () => {
    const rule = ruleOf("REQ_ABOVE_300K");
    expect(rule.proposerCode).toBeNull();
    expect(rule.recommenders.some((x) => x.roleCode === "HOD")).toBe(false);
    const { r } = trace({ domain: "requisition", value: 420_000 });
    expect(r.chain.map((s) => s.origin ?? null)).toEqual(["CORE", "CORE_STRENGTHENED", "CORE_STRENGTHENED", null]);
    expect(r.core?.level?.approverCode).toBe("CEO");
  });

  it("(20) example 2's chain is generated: the Head of Department and FD come from §2.2.1, HoDiv's joint proposal is an act the rule sets", () => {
    const rule = ruleOf("OS_15K_TO_300K");
    expect(rule.proposerCode).toBeNull();
    expect(rule.recommenders.map((x) => x.roleCode)).toEqual(["HODIV", "QC"]);
    const { r } = trace({ domain: "appointment", method: "open_selective", value: 180_000 });
    expect(r.chain.map((s) => s.origin ?? null)).toEqual(["CORE", "CORE_ACT_SET", "CORE", "RULE", null]);
  });

  it("(20) example 5 is recorded as entered, and the fixture states no core row above the CEO", () => {
    const { r } = trace({ domain: "appointment", method: "direct", value: 6_000_000 });
    expect(r.warnings.filter((w) => w.code.startsWith("CORE_")).map((w) => [w.code, w.level])).toEqual([["CORE_AS_ENTERED", "info"]]);
    expect(r.core).toEqual({ flag: false, reason: "§3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO", level: null });
    expect((DAL_FIXTURE.coreRouting ?? []).map((l) => l.approverCode)).toEqual(["HOD", "HODIV", "FD", "CEO"]);
  });

  it("an example left undecided still has no error: it warns that its chain was not checked", () => {
    const { r } = trace({ domain: "termination", method: "tender", value: 1_000_000 });
    expect(r.warnings.filter((w) => w.code === "CORE_NOT_CHECKED").map((w) => w.level)).toEqual(["warn"]);
  });
});
