import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SO_DOMAIN } from "@/lib/supervision/so";

import { CONTRACT_TYPE_DOMAINS, contractTypeDomainWords, takesContractType } from "./contract-type-domains";
import { DAL_FIXTURE } from "./dal-fixture";
import { resolveApproval } from "./resolve";
import type { Matrix, Rule } from "./types";

/**
 * BD-613-6 ruling: which matters take a contract type is one list; the matrix's save refuses a type-confined row on
 * any other; and a type-confined row skipped for a caller that passes no type is reported, never skipped quietly.
 * Invented rows, for tests only.
 */

const base = DAL_FIXTURE.rules.find((r) => r.domain === "signing")!;
const row = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({ ...base, domain: SO_DOMAIN, recommenders: [], proposerCode: null, generateCoreChain: false, coreChainReason: "test", minValue: null, maxValue: null, contractValueMin: null, contractValueMax: null, method: null, cond: null, ...r });
const m: Matrix = { ...DAL_FIXTURE, rules: [row({ ruleKey: "ANY", approverCode: "HODIV", labelEn: "Any type" }), row({ ruleKey: "WORKS", contractTypeCode: "WORKS", approverCode: "FD", labelEn: "Works only" })] };

describe("the one list", () => {
  it("holds the S.O.'s matter, whose caller passes the contract type, and words it", () => {
    expect(CONTRACT_TYPE_DOMAINS).toContain(SO_DOMAIN);
    expect(takesContractType(SO_DOMAIN)).toBe(true);
    expect(takesContractType("payment")).toBe(false);
    expect(contractTypeDomainWords()).toBe("Superintending Officer");
  });
  it("the matrix's save checks it (not only the editor)", () => {
    const a = readFileSync(path.join(__dirname, "../../app/configuration/approval-matrix/actions.ts"), "utf8");
    expect(a).toMatch(/if \(v\.contractTypeCode && !takesContractType\(v\.domain\)\) r\.reject\("contractTypeCode"/);
  });
});

describe("a skipped type-confined row is reported", () => {
  it("asked without a type: the row for any type routes, and the skipped row is a warning naming it", () => {
    const r = resolveApproval(m, { domain: SO_DOMAIN, contractValue: 10_000 });
    expect(r.rule?.ruleKey).toBe("ANY");
    const w = r.warnings.filter((x) => x.code === "TYPE_ROW_SKIPPED");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ level: "warn", messageEn: expect.stringMatching(/^“Works only” is confined to one contract type/) });
  });
  it("asked with a type: nothing is skipped, nothing said", () => {
    expect(resolveApproval(m, { domain: SO_DOMAIN, contractValue: 10_000, contractTypeCode: "WORKS" }).rule?.ruleKey).toBe("WORKS");
    expect(resolveApproval(m, { domain: SO_DOMAIN, contractValue: 10_000, contractTypeCode: "SUPPLY" }).warnings.some((x) => x.code === "TYPE_ROW_SKIPPED")).toBe(false);
  });
  it("a type-confined row that would not have matched anyway is not reported", () => {
    const other: Matrix = { ...m, rules: [m.rules[0], row({ ruleKey: "WORKS_TENDER", method: "tender", contractTypeCode: "WORKS", approverCode: "FD" })] };
    expect(resolveApproval(other, { domain: SO_DOMAIN, method: "quotation", contractValue: 10_000 }).warnings.some((x) => x.code === "TYPE_ROW_SKIPPED")).toBe(false);
  });
});
