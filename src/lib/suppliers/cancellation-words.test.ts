import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { awardStanding } from "./award-standing";
import { cancellationWords, eventReasonWords } from "./labels";
import { standing, type StandingEventFacts } from "./standing";
import { standingEventFacts } from "./standing-repo";

/**
 * BD-613-105(e) (approved with a change) / code review S-3, 6.13 Part B Run 0 fix round: a registration cancelled's reason
 * line names the body and its reference, but the words are not stored. Its reasonSnapshot stays "", and "Cancelled by
 * {body} ({reference})" / "Dibatalkan oleh {body} ({reference})" is composed at read from bodyLabelSnapshot and
 * externalReference (standingEventFacts). The award's standing warning names the body too, in both languages.
 *
 * Worked example: the Demo Companies Registry cancels DEMO/SUP/0001/2026's registration by its notice VERIFY/2026/118
 * from 4 October 2026. The Standing card reads "04 Oct 2026 · Cancelled by the Demo Companies Registry (VERIFY/2026/118)";
 * an award to it warns "Registration cancelled since 04 Oct 2026 (Cancelled by the Demo Companies Registry
 * (VERIFY/2026/118)) — an award is not refused by the product: rule not set."
 */

const day = (d: string) => ({ "2026-10-04": "04 Oct 2026" })[d] ?? d;
const row = (o: Partial<Parameters<typeof standingEventFacts>[0]> = {}): Parameters<typeof standingEventFacts>[0] => ({
  id: "c",
  kind: "REGISTRATION_CANCELLED",
  effectiveOn: new Date("2026-10-04T00:00:00.000Z"),
  endsOn: null,
  offenceNo: null,
  reasonSnapshot: "",
  reinstatesEventId: null,
  liftsEventId: null,
  flaggedDocumentIds: [],
  withdrawnAt: null,
  bodyLabelSnapshot: "the Demo Companies Registry",
  externalReference: "VERIFY/2026/118",
  ...o,
});

describe("a cancellation's reason line, composed at read (BD-613-105(e), S-3)", () => {
  it("in English and Malay, from the body as frozen and the reference", () => {
    expect(cancellationWords({ body: "the Demo Companies Registry", reference: "VERIFY/2026/118" })).toEqual({ en: "Cancelled by the Demo Companies Registry (VERIFY/2026/118)", ms: "Dibatalkan oleh the Demo Companies Registry (VERIFY/2026/118)" });
  });
  it("the stored row carries the body and reference, not words; a Run 0 row's stored English is not read", () => {
    const f = standingEventFacts(row());
    expect(f.cancelledBy).toEqual({ body: "the Demo Companies Registry", reference: "VERIFY/2026/118" });
    expect(f.reasonLabel).toBe("");
    const old = standingEventFacts(row({ reasonSnapshot: "Cancelled by the Demo Companies Registry (VERIFY/2026/118)" }));
    expect(old.reasonLabel).toBe("");
    expect(eventReasonWords(old).ms).toBe("Dibatalkan oleh the Demo Companies Registry (VERIFY/2026/118)");
  });
  it("any other kind keeps its reason as recorded, in either language, and carries no body", () => {
    const s = standingEventFacts(row({ kind: "SUSPEND", reasonSnapshot: "Documents not in order", bodyLabelSnapshot: "", externalReference: "" }));
    expect(s.cancelledBy).toBeNull();
    expect(eventReasonWords(s)).toEqual({ en: "Documents not in order", ms: "Documents not in order" });
  });
  it("withdrawn is always read (required): a withdrawn row says so", () => {
    expect(standingEventFacts(row({ withdrawnAt: new Date() })).withdrawn).toBe(true);
    expect(standingEventFacts(row()).withdrawn).toBe(false);
  });
});

describe("the award's standing warning names the body, in English and Malay (S-3)", () => {
  const ev = (o: Partial<StandingEventFacts> = {}): StandingEventFacts => ({ ...standingEventFacts(row()), ...o });
  it("the worked example", () => {
    const r = standing({ status: "REGISTERED" }, [ev()], [], { autoSuspendOnLapse: null }, "2026-10-04");
    expect(awardStanding(r, day).warning).toEqual({
      en: "Registration cancelled since 04 Oct 2026 (Cancelled by the Demo Companies Registry (VERIFY/2026/118)) — an award is not refused by the product: rule not set.",
      ms: "Pendaftaran dibatalkan sejak 04 Oct 2026 (Dibatalkan oleh the Demo Companies Registry (VERIFY/2026/118)) — anugerah tidak ditolak oleh sistem: peraturan belum ditetapkan.",
    });
  });
});
