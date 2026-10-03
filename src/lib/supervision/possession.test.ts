import { describe, expect, it } from "vitest";

import { supervisionFaultWords } from "./labels";
import { possessionFaults, startRuleReading } from "./possession";

/**
 * FR-SUP-005 with BD-612-22 (ruled at 6.13 planning): the contract type's start-of-work behaviour.
 * true: refused until the bond and each required policy are verified, naming what is missing;
 * false: allowed, the record saying the type starts without securities; null: NOT_SET, blocks.
 */

const met = [
  { key: "RETURNED", state: "MET", detail: [] },
  { key: "BOND", state: "MET", detail: [] },
  { key: "INSURANCE", state: "MET", detail: [] },
];
const ok = { status: "STAMPED", possessed: false, versions: 2, on: "2026-10-01", today: "2026-10-03", datedOn: "2026-09-30", startRequiresSecurities: true as boolean | null, typeName: "Works", gate: met };
const codes = (x: Parameters<typeof possessionFaults>[0]) => possessionFaults(x).map((f) => f.code);

describe("the start-of-work behaviour", () => {
  it("true, with the bond and insurance met: allowed", () => {
    expect(codes(ok)).toEqual([]);
  });
  it("true, with either not met: refused, naming which", () => {
    const gate = [met[0], { key: "BOND", state: "NOT_MET", detail: ["NOT_VERIFIED"] }, { key: "INSURANCE", state: "NOT_SET", detail: [] }];
    const f = possessionFaults({ ...ok, gate });
    expect(f.map((x) => x.data?.item)).toEqual(["BOND", "INSURANCE"]);
    expect(supervisionFaultWords(f[0]).en).toMatch(/the performance bond is not met/);
    expect(supervisionFaultWords(f[1]).en).toMatch(/the required insurance is not decided/);
  });
  it("false: allowed whatever the securities, and read as 'without securities'", () => {
    expect(codes({ ...ok, startRequiresSecurities: false, gate: [] })).toEqual([]);
    expect(startRuleReading(false)).toBe("WITHOUT_SECURITIES");
  });
  it("null: NOT_SET, blocks, naming the setting", () => {
    expect(codes({ ...ok, startRequiresSecurities: null })).toEqual(["START_RULE_NOT_SET"]);
    expect(supervisionFaultWords(possessionFaults({ ...ok, startRequiresSecurities: null })[0]).en).toMatch(/Works needs its securities before work starts is not set\. Set its start-of-work behaviour under Configuration › Reference data\.$/);
    expect(startRuleReading(null)).toBe("NOT_SET");
  });
});

describe("the act's other refusals", () => {
  it("fully executed (stamped) first; once; not in the future; not before the Contract Date; a baseline version to build on", () => {
    expect(codes({ ...ok, status: "EXECUTED" })).toEqual(["NOT_STAMPED"]);
    expect(codes({ ...ok, possessed: true, status: "ACTIVE" })).toEqual(["ALREADY_POSSESSED"]);
    expect(codes({ ...ok, on: "2026-10-04" })).toEqual(["FUTURE_DATE"]);
    expect(codes({ ...ok, on: "2026-09-29" })).toEqual(["BEFORE_CONTRACT_DATE"]);
    expect(codes({ ...ok, versions: 0 })).toEqual(["NO_BASELINE_VERSION"]);
  });
});
