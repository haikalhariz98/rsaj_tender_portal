import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { citeStepFaults, tableStepFaults, type MatterFact } from "@/lib/variation/tabling";

import { tablingOf } from "./tabling";

/**
 * 6.13 Part B run 1a (ADR 0029 §3, BD-613-73; against accepted Part A): the variation's tabling generalised to any matter
 * tabled from its own record, `tablingOf(matter)`. One rule decides tabling and citing a committee step for a variation
 * and for a contract matter, and gives the committee matter's typed keys. The variation's tabling tests
 * (variation/tabling.test.ts) are unchanged and still pass through the variation's wrappers.
 */

const m = (x: Partial<MatterFact> = {}): MatterFact => ({ withdrawn: false, domain: "eot", committeeCode: "VOC", outcome: "PENDING", ...x });
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("one tabling rule for every matter tabled from its record", () => {
  const variation = (ms: MatterFact[]) => tablingOf({ kind: "VARIATION", id: "v1", reference: "VO/2026/0001" }, ms);
  const matter = (ms: MatterFact[]) => tablingOf({ kind: "CONTRACT", id: "cm1", reference: "CM/2026/0001" }, ms);
  const cases: MatterFact[][] = [[], [m()], [m({ outcome: "DEFERRED" })], [m({ outcome: "CARRIED" })], [m({ outcome: "NOT_CARRIED" })], [m({ withdrawn: true })], [m({ domain: "lad_waiver" })], [m({ committeeCode: "TENDER_BOARD" })]];
  it("a variation and a contract matter answer alike, and as the variation's wrappers do", () => {
    for (const ms of cases) {
      expect(codes(matter(ms).tableFaults("eot", "VOC"))).toEqual(codes(variation(ms).tableFaults("eot", "VOC")));
      expect(codes(matter(ms).citeFaults("eot", "VOC"))).toEqual(codes(variation(ms).citeFaults("eot", "VOC")));
      expect(variation(ms).tableFaults("eot", "VOC")).toEqual(tableStepFaults(ms, "eot", "VOC"));
      expect(variation(ms).citeFaults("eot", "VOC")).toEqual(citeStepFaults(ms, "eot", "VOC"));
    }
  });
  it("tabled once and waiting: refused; decided: cited; nothing tabled: not cited", () => {
    expect(codes(matter([m()]).tableFaults("eot", "VOC"))).toEqual(["ALREADY_TABLED"]);
    expect(codes(matter([]).citeFaults("eot", "VOC"))).toEqual(["NOT_TABLED_YET"]);
    expect(codes(matter([m()]).citeFaults("eot", "VOC"))).toEqual(["NOT_DECIDED_YET"]);
    expect(matter([m({ outcome: "CARRIED" })]).citeFaults("eot", "VOC")).toEqual([]);
  });
  it("the committee matter's typed keys: a VARIATION matter names its variation, a CONTRACT matter its contract matter", () => {
    expect(variation([]).keys).toEqual({ matterKind: "VARIATION", matterRef: "VO/2026/0001", variationId: "v1" });
    expect(matter([]).keys).toEqual({ matterKind: "CONTRACT", matterRef: "CM/2026/0001", contractMatterId: "cm1" });
  });
});

describe("the variation's tabling act goes through it (source)", () => {
  const acts = readFileSync("src/app/projects/[id]/variation-actions.ts", "utf8");
  const body = acts.slice(acts.indexOf("export async function tableVariationMatter("), acts.indexOf("export async function recordCommencement("));
  it("the act asks tablingOf for its faults and writes its keys", () => {
    expect(body).toMatch(/const tabledFrom = tablingOf\(\{ kind: "VARIATION", id: v\.id, reference: v\.reference \}, matterFactsOf\(v\)\);/);
    expect(body).toMatch(/const tf = tabledFrom\.tableFaults\(inst\.domain, step!\.committeeCode!\);/);
    expect(body).toMatch(/committeeDecision\.create\(\{ data: \{ meetingId: s!\.meeting\.id, subject, domain, \.\.\.tabledFrom\.keys, amount, act,/);
  });
  it("no act tables a CONTRACT matter before run 1b", () => {
    for (const f of ["src/app/projects/[id]/variation-actions.ts", "src/app/projects/[id]/payment-actions.ts", "src/app/projects/[id]/supervision-actions.ts", "src/app/committees/actions.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/tablingOf\(\{ kind: "CONTRACT"/);
  });
});
