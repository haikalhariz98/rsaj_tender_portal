import { describe, expect, it } from "vitest";

import { closureFaults, survivingOf, type ClosureFacts } from "./closure";

/** Plan closeout-plan.md §4.7: each refusal alone; the design guarantee bond never blocks; a supply contract is refused SUPPLY_NOT_BUILT. */

const ready: ClosureFacts = { supply: false, finalIssued: true, finalPaid: true, certificatesInProgress: [], mattersOpen: [], defectsOpen: 0, retentionHeld: 0n, securitiesHeld: [], performance: null };
const codes = (o: Partial<ClosureFacts>) => closureFaults({ ...ready, ...o }).map((f) => f.code);

describe("closureFaults", () => {
  it("passes when every check passes", () => expect(codes({})).toEqual([]));
  it.each<[Partial<ClosureFacts>, string]>([
    [{ finalPaid: false }, "FINAL_NOT_PAID"],
    [{ finalIssued: false, finalPaid: false }, "FINAL_NOT_PAID"],
    [{ certificatesInProgress: ["Interim payment (in progress)"] }, "CERTIFICATES_IN_PROGRESS"],
    [{ mattersOpen: ["EOT/1"] }, "MATTERS_OPEN"],
    [{ defectsOpen: 1 }, "DEFECTS_OPEN"],
    [{ retentionHeld: 1n }, "RETENTION_HELD"],
    [{ securitiesHeld: ["Performance bond PB/1"] }, "SECURITY_NOT_RETURNED"],
    [{ performance: { code: "PERFORMANCE_NOT_FILED", level: "block" } }, "PERFORMANCE_NOT_FILED"],
  ])("refuses %o alone", (o, code) => expect(codes(o)).toEqual([code]));
  it("refuses a supply contract by that alone", () => expect(codes({ supply: true, finalPaid: false, defectsOpen: 3 })).toEqual(["SUPPLY_NOT_BUILT"]));
  it("says whether the final is unissued or unpaid", () => {
    expect(closureFaults({ ...ready, finalIssued: false, finalPaid: false })[0].data).toEqual({ issued: "no" });
    expect(closureFaults({ ...ready, finalPaid: false })[0].data).toEqual({ issued: "yes" });
  });
});

describe("survivingOf", () => {
  it("dates the design guarantee bond's release from practical completion, or says not set", () => {
    expect(survivingOf(["Design guarantee bond DGB/1"], "2026-10-26", 5)).toEqual([{ label: "Design guarantee bond DGB/1", releaseOn: "2031-10-26" }]);
    expect(survivingOf(["Design guarantee bond DGB/1"], "2026-10-26", null)).toEqual([{ label: "Design guarantee bond DGB/1", releaseOn: null }]);
  });
});
