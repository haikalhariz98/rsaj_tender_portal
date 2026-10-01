import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { klAt } from "./fixture";
import { windowGate } from "./gate";

/// X-9 (6.5): what the award gate reads — the phase now, and whether a window change is pending.

const ex = (status: "ADVERTISED" | "INVITED" | "APPROVED_FOR_TENDERING", routes: { domain: string; status: string }[] = []) => ({ status, closingAt: klAt("2026-11-17"), approvalInstances: routes.map((r) => ({ ...r, awardId: null })) });
const w = { purchaseFromDay: dayToDate("2026-11-04"), purchaseCloseDay: dayToDate("2026-11-15") };

describe("the award gate's facts", () => {
  it("closed after the closing instant, open before it", () => {
    expect(windowGate(ex("ADVERTISED"), w, new Date("2026-11-17T06:30:00Z"), "Asia/Kuala_Lumpur")).toEqual({ phase: "CLOSED", changePending: false });
    expect(windowGate(ex("INVITED"), w, new Date("2026-11-16T06:30:00Z"), "Asia/Kuala_Lumpur").phase).toBe("CLOSED_FOR_PURCHASE");
  });
  it("a pending window change is seen; one of another domain, or decided, is not", () => {
    expect(windowGate(ex("ADVERTISED", [{ domain: "window_change", status: "PENDING" }]), w, new Date("2026-11-18T00:00:00Z"), "Asia/Kuala_Lumpur").changePending).toBe(true);
    expect(windowGate(ex("ADVERTISED", [{ domain: "window_change", status: "APPROVED" }, { domain: "name_approval", status: "PENDING" }]), w, new Date("2026-11-18T00:00:00Z"), "Asia/Kuala_Lumpur").changePending).toBe(false);
  });
  it("not published is never closed", () => {
    expect(windowGate(ex("APPROVED_FOR_TENDERING"), w, new Date("2026-12-01T00:00:00Z"), "Asia/Kuala_Lumpur").phase).toBe("NOT_PUBLISHED");
  });
});
