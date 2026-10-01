import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { klAt } from "./fixture";
import { PHASE_LABEL, TABLE_AVAILABILITY_LABEL } from "./labels";
import { closingConsistent, closingHistory, tableDocumentAvailability, WINDOW_PHASES, windowPhase, type PhaseInput } from "./phase";

/**
 * ADR 0014: the window's phases are derived from the stored instants on every read, never stored.
 * Purchase opens on its first day and closes after the end of its last day in the organisation's
 * zone; the window closes at the closing instant (14:30:00 is closed); cancelled wins.
 */

const TZ = "Asia/Kuala_Lumpur";
const w = (over: Partial<PhaseInput> = {}): PhaseInput => ({
  status: "ADVERTISED",
  purchaseFromDay: dayToDate("2026-11-04"),
  purchaseCloseDay: dayToDate("2026-11-15"),
  closingAt: klAt("2026-11-17"),
  ...over,
});
const at = (iso: string) => new Date(iso);
const phase = (now: string, over: Partial<PhaseInput> = {}, tz: string | null = TZ) => windowPhase(w(over), at(now), tz).phase;

describe("the phases, in order", () => {
  it("not published before the act", () => {
    for (const status of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) expect(phase("2026-11-10T00:00:00Z", { status })).toBe("NOT_PUBLISHED");
  });
  it("published, then open for purchase from the first day in the organisation's zone", () => {
    // 23:59 on the 3rd in KL is 15:59Z on the 3rd; 00:00 on the 4th in KL is 16:00Z on the 3rd.
    expect(phase("2026-11-03T15:59:00Z")).toBe("PUBLISHED");
    expect(phase("2026-11-03T16:00:00Z")).toBe("OPEN_FOR_PURCHASE");
  });
  it("closed for purchase after the end of the last day, still open for submission", () => {
    expect(phase("2026-11-15T15:59:00Z")).toBe("OPEN_FOR_PURCHASE");
    expect(phase("2026-11-15T16:00:00Z")).toBe("CLOSED_FOR_PURCHASE");
    expect(windowPhase(w(), at("2026-11-16T03:00:00Z"), TZ).submissionOpen).toBe(true);
  });
  it("closed at the closing instant: 14:29:59 open, 14:30:00 closed", () => {
    expect(phase("2026-11-17T06:29:59Z")).toBe("CLOSED_FOR_PURCHASE");
    expect(phase("2026-11-17T06:30:00Z")).toBe("CLOSED");
    expect(windowPhase(w(), at("2026-11-17T06:30:00Z"), TZ).submissionOpen).toBe(false);
  });
  it("submission is open in both purchase phases only", () => {
    expect(windowPhase(w(), at("2026-11-05T03:00:00Z"), TZ).submissionOpen).toBe(true);
    expect(windowPhase(w(), at("2026-11-03T03:00:00Z"), TZ).submissionOpen).toBe(false);
  });
  it("cancelled wins over everything", () => {
    expect(phase("2026-11-05T03:00:00Z", { status: "CANCELLED" })).toBe("CANCELLED");
  });
  it("the invited path runs the same phases", () => {
    expect(phase("2026-11-05T03:00:00Z", { status: "INVITED" })).toBe("OPEN_FOR_PURCHASE");
  });
  it("with no zone, a day-based phase is not known (never UTC's day); the closing instant still closes it", () => {
    expect(phase("2026-11-05T03:00:00Z", {}, null)).toBe("UNKNOWN");
    expect(phase("2026-11-18T00:00:00Z", {}, null)).toBe("CLOSED");
  });
  it("every phase has words", () => {
    for (const p of WINDOW_PHASES) expect(PHASE_LABEL[p]).toBeTruthy();
  });
});

describe("FR-DOC-010: the Tender Table Document's availability follows the phase", () => {
  it("from publication to the closing, withdrawn after", () => {
    expect(tableDocumentAvailability("NOT_PUBLISHED")).toBe("NOT_YET");
    for (const p of ["PUBLISHED", "OPEN_FOR_PURCHASE", "CLOSED_FOR_PURCHASE"] as const) expect(tableDocumentAvailability(p)).toBe("AVAILABLE");
    expect(tableDocumentAvailability("CLOSED")).toBe("WITHDRAWN");
    expect(tableDocumentAvailability("CANCELLED")).toBe("WITHDRAWN");
    expect(TABLE_AVAILABILITY_LABEL.WITHDRAWN).toMatch(/Withdrawn/);
  });
});

describe("the closing's history (X-2, FR-ADV-015)", () => {
  const approved = { closingAt: klAt("2026-11-17"), approvedAt: dayToDate("2026-10-01") };
  const ext = { kind: "EXTENSION" as const, toClosingAt: klAt("2026-11-24"), toPurchaseCloseDay: dayToDate("2026-11-20"), appliedAt: at("2026-11-10T02:00:00Z"), reason: "Addendum 1" };
  const pending = { ...ext, toClosingAt: klAt("2026-12-01"), appliedAt: null };
  it("lists the approved dates first, then each applied change; pending and refused ones are not in it", () => {
    const h = closingHistory(approved, [pending, ext]);
    expect(h.map((e) => e.source)).toEqual(["APPROVED", "EXTENSION"]);
    expect(h[0].closingAt).toEqual(klAt("2026-11-17"));
  });
  it("its last entry is the exercise's closing", () => {
    expect(closingConsistent(closingHistory(approved, [ext]), klAt("2026-11-24"))).toBe(true);
    expect(closingConsistent(closingHistory(approved, [ext]), klAt("2026-11-17"))).toBe(false);
    expect(closingConsistent(closingHistory(approved, []), klAt("2026-11-17"))).toBe(true);
  });
  it("applied changes are in the order applied", () => {
    const later = { ...ext, toClosingAt: klAt("2026-12-01"), appliedAt: at("2026-11-20T02:00:00Z") };
    expect(closingHistory(approved, [later, ext]).map((e) => e.closingAt.toISOString())).toEqual([klAt("2026-11-17"), klAt("2026-11-24"), klAt("2026-12-01")].map((d) => d.toISOString()));
  });
});
