import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { recordFaults, requestBlacklistFaults, requestOpen, withdrawRequestFaults, type RequestFacts } from "./blacklist";
import { supplierFaultText } from "./labels";

/**
 * 6.15a fix R-7: a blacklisting request approved on its route but no longer recordable (say the supplier
 * was blacklisted meanwhile on another ground) stayed open for ever and held the supplier: nothing else
 * could be asked for. It may now be withdrawn, with the reason; a withdrawn request is closed and is never
 * recorded.
 */

const approved: RequestFacts = { kind: "BLACKLIST", route: "APPROVED", approvedOn: "2026-09-25", recorded: false, withdrawn: false };
const ok = { reason: "The supplier was blacklisted on the other request first.", personActive: true };

describe("withdrawing a request (fix R-7)", () => {
  it("an approved request not recorded may be withdrawn, with a reason and an officer", () => {
    expect(withdrawRequestFaults(ok, { today: "2026-10-02", request: approved })).toEqual([]);
    expect(withdrawRequestFaults(ok, { today: "2026-10-02", request: { ...approved, route: "NONE", approvedOn: null } })).toEqual([]);
  });

  it("refused: still on its route, refused, recorded, already withdrawn; no reason; nobody; no time zone", () => {
    const codes = (r: Partial<RequestFacts>, i = ok) => withdrawRequestFaults(i, { today: "2026-10-02", request: { ...approved, ...r } }).map((f) => f.code);
    expect(codes({ route: "PENDING" })).toEqual(["WITHDRAW_ROUTE_PENDING"]);
    expect(codes({ route: "REJECTED" })).toEqual(["WITHDRAW_ROUTE_REFUSED"]);
    expect(codes({ recorded: true })).toEqual(["ALREADY_RECORDED"]);
    expect(codes({ withdrawn: true })).toEqual(["ALREADY_WITHDRAWN"]);
    expect(codes({}, { reason: "  ", personActive: false })).toEqual(["WITHDRAW_REASON_REQUIRED", "PERSON_REQUIRED"]);
    expect(withdrawRequestFaults(ok, { today: null, request: approved }).map((f) => f.code)).toEqual(["TIME_ZONE_UNSET"]);
  });

  it("a withdrawn request no longer holds the supplier open: another may be asked for", () => {
    expect(requestOpen([approved])).toBe(true);
    expect(requestOpen([{ ...approved, withdrawn: true }])).toBe(false);
    const ctx = { today: "2026-10-02", supplierId: "s1", status: "REGISTERED", standing: "ACTIVE", reason: { appliesTo: "BLACKLIST" as const, retiredOn: null } };
    expect(requestBlacklistFaults({ reasonId: "r", personActive: true, sourceAward: null }, { ...ctx, requests: [approved] }).map((f) => f.code)).toEqual(["REQUEST_OPEN"]);
    expect(requestBlacklistFaults({ reasonId: "r", personActive: true, sourceAward: null }, { ...ctx, requests: [{ ...approved, withdrawn: true }] })).toEqual([]);
  });

  it("a withdrawn request is never recorded", () => {
    const r = recordFaults({ effectiveOn: "2026-10-02", personActive: true }, { today: "2026-10-02", request: { ...approved, withdrawn: true }, standing: "ACTIVE", offenceNo: 1, months: 60 });
    expect(r.faults.map((f) => f.code)).toEqual(["REQUEST_WITHDRAWN"]);
    expect(supplierFaultText(r.faults[0])).toBe("This request was withdrawn: it is not recorded. Ask again if it is still wanted.");
  });

  it("the act is audited with its reason, guarded against a concurrent record, and the lists read withdrawn as closed (source)", () => {
    const act = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");
    expect(act).toMatch(/export async function withdrawStandingRequest/);
    expect(act).toMatch(/updateMany\(\{ where: \{ id: req\.id, withdrawnAt: null, event: null \}/);
    expect(act).toMatch(/withdrawn: r\.withdrawnAt != null/);
    expect(readFileSync("src/app/suppliers/page.tsx", "utf8")).toMatch(/!r\.event && !r\.withdrawnAt/);
    expect(readFileSync("src/app/suppliers/[id]/standing-panels.tsx", "utf8")).toMatch(/withdrawn: r\.withdrawnAt != null/);
  });
});
