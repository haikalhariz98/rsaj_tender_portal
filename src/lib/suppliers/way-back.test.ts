import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { recordCancellationFaults, withdrawCancellationFaults } from "./cancellation";
import { supplierFaultText } from "./labels";
import { applicationKindFaults, approveFaults, openApplicationFaults, submitFaults, type BlacklistInEffect, type CancellationInEffect, type FileFacts } from "./review";
import { cancellationEnded, standing, type StandingEventFacts } from "./standing";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * M-1 (code review on Run 0; the lead's decision, BD-613-108 for the product owner to confirm): a genuine registration
 * cancellation can end. ADR 0019 Amendment 1 promises "the supplier registers again"; until now nothing delivered it.
 * - A supplier whose registration is CANCELLED may open a NEW application (the way back).
 * - Approving it resets registeredOn to the day approved.
 * - standing() treats a cancellation as ended when registeredOn is after its effectiveOn.
 * - RENEWAL and UPGRADE are refused while the supplier is CANCELLED, naming the exit, in English and Malay; asked when an
 *   application opens and again when it is approved, so one opened before the cancellation is not approved under it.
 * - A new registration approved on the very day the cancellation took effect would not be after it, so approval refuses
 *   that day, naming the first day it can be approved (CANCELLED_APPROVE_FROM).
 *
 * Worked example: Syarikat Contoh, registered 15 Jan 2025, has its registration cancelled by the works board (WB/2026/118)
 * from 1 Oct 2026. On 2 Oct its renewal is refused ("…The way back is a new registration…"); a new application is opened
 * and, its file in order, approved on 5 Oct: registeredOn becomes 5 Oct 2026, after 1 Oct, so it reads Active again,
 * noting "The registration cancelled from 01 Oct 2026 ended when the supplier registered again on 05 Oct 2026."
 */

const base = { endsOn: null, offenceNo: null, reinstatesEventId: null, liftsEventId: null, withdrawn: false, flaggedDocumentIds: [], reasonLabel: "" } as const;
const cancelled: StandingEventFacts = { ...base, id: "c1", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-10-01", cancelledBy: { body: "the works board", reference: "WB/2026/118" } };
const read = (registeredOn: string | null, events: StandingEventFacts[], on = "2026-10-05") => standing({ status: "REGISTERED", registeredOn }, events, [], { autoSuspendOnLapse: null }, on);
const inEffect = (e: StandingEventFacts | null): CancellationInEffect | null => (e ? { effectiveOn: e.effectiveOn, cancelledBy: e.cancelledBy } : null);
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

const file = (o: Partial<FileFacts> = {}): FileFacts => ({
  status: "RECEIVED",
  lapsedRecordedAt: null,
  resubmitBy: null,
  routePending: false,
  declarationSignedOn: "2026-10-02",
  declarationScanned: true,
  mandatory: [{ label: "Works board certificate", state: "VALID" }],
  mandatoryNotSet: [],
  typesConfigured: 1,
  blacklist: null,
  kind: "NEW",
  supplierStatus: "REGISTERED",
  cancellation: inEffect(cancelled),
  ...o,
});

describe("the standing rule: a cancellation ends when the supplier registers again", () => {
  it("cancellationEnded: strictly after; the same day is not; no day known never ends it", () => {
    expect(cancellationEnded("2026-10-02", "2026-10-01")).toBe(true);
    expect(cancellationEnded("2026-10-01", "2026-10-01")).toBe(false);
    expect(cancellationEnded("2025-01-15", "2026-10-01")).toBe(false);
    expect(cancellationEnded(null, "2026-10-01")).toBe(false);
  });
  it("the worked example: cancelled while registered from 15 Jan 2025; Active again once registered on 5 Oct, saying so", () => {
    expect(read("2025-01-15", [cancelled]).standing).toBe("CANCELLED");
    const after = read("2026-10-05", [cancelled]);
    expect(after.standing).toBe("ACTIVE");
    expect(after.cancellation).toBeNull();
    expect(after.notes).toEqual([{ code: "CANCELLATION_ENDED", level: "info", data: { since: "2026-10-01", registeredOn: "2026-10-05" } }]);
    expect(supplierFaultText(after.notes[0])).toBe("The registration cancelled from 01 Oct 2026 ended when the supplier registered again on 05 Oct 2026.");
  });
  it("boundary: registered on the very day it took effect, the cancellation still stands", () => {
    expect(read("2026-10-01", [cancelled]).standing).toBe("CANCELLED");
  });
  it("cancelled again after registering again: the later cancellation stands, and a new one may be recorded only then", () => {
    const again: StandingEventFacts = { ...cancelled, id: "c2", effectiveOn: "2026-10-07" };
    expect(read("2026-10-05", [cancelled, again], "2026-10-08").cancellation?.id).toBe("c2");
    // Before the second is recorded, the ended first does not refuse it; and it cannot predate the new registration.
    const ctx = { today: "2026-10-08", status: "REGISTERED", registeredOn: "2026-10-05", reading: read("2026-10-05", [cancelled], "2026-10-08"), bodyConfigured: true };
    expect(recordCancellationFaults({ bodyId: "wb", reference: "WB/2026/200", effectiveOn: "2026-10-07", personActive: true }, ctx)).toEqual([]);
    expect(codes(recordCancellationFaults({ bodyId: "wb", reference: "WB/2026/200", effectiveOn: "2026-10-04", personActive: true }, ctx))).toEqual(["EFFECTIVE_BEFORE_REGISTRATION"]);
  });
  it("a blacklisting is not ended by registering again (only the cancellation is)", () => {
    const b: StandingEventFacts = { ...base, id: "b", kind: "BLACKLIST", effectiveOn: "2026-09-24", offenceNo: 2, reasonLabel: "False declaration", cancelledBy: null };
    expect(read("2026-10-05", [b, cancelled]).standing).toBe("BLACKLISTED");
    expect(read("2026-10-05", [b, cancelled]).cancellation).toBeNull();
  });
});

describe("which application a cancelled supplier may have (the way back)", () => {
  const c = inEffect(cancelled);
  it("cancelled: a new application opens; a renewal or upgrade is refused, naming the exit (EN and MS)", () => {
    expect(applicationKindFaults("NEW", "REGISTERED", c)).toEqual([]);
    expect(openApplicationFaults("NEW", "REGISTERED", false, null, c)).toEqual([]);
    for (const kind of ["RENEWAL", "UPGRADE"] as const) {
      const fs = openApplicationFaults(kind, "REGISTERED", false, null, c);
      expect(fs).toEqual([{ code: "CANCELLED_NEW_APPLICATION_ONLY", level: "block", data: { kind, since: "2026-10-01", body: "the works board", reference: "WB/2026/118" } }]);
      expect(supplierFaultText(fs[0])).toBe("The supplier's registration is cancelled (since 01 Oct 2026 by the works board (WB/2026/118)): a renewal or an upgrade is not opened or approved while it stands. The way back is a new registration: open a first registration (a new application), which, once approved, ends the cancellation.");
    }
  });
  it("not cancelled: as before (a registered supplier renews or upgrades; one not registered opens a first registration)", () => {
    expect(codes(applicationKindFaults("NEW", "REGISTERED", null))).toEqual(["KIND_NOT_FOR_STATUS"]);
    expect(applicationKindFaults("RENEWAL", "REGISTERED", null)).toEqual([]);
    for (const st of ["APPLICANT", "REJECTED"] as const) {
      expect(applicationKindFaults("NEW", st, null)).toEqual([]);
      expect(codes(applicationKindFaults("RENEWAL", st, null))).toEqual(["KIND_NOT_FOR_STATUS"]);
    }
  });
});

describe("approving a new registration for a cancelled supplier", () => {
  it("on the day the cancellation took effect: refused, naming the first day it can be approved (EN and MS)", () => {
    const fs = approveFaults(file(), "2026-10-01");
    expect(fs).toEqual([{ code: "CANCELLED_APPROVE_FROM", level: "block", data: { since: "2026-10-01", body: "the works board", reference: "WB/2026/118", from: "2026-10-02" } }]);
    expect(supplierFaultText(fs[0])).toBe("The registration was cancelled from 01 Oct 2026: a new registration ends it only from a later day, so it is approved from 02 Oct 2026.");
  });
  it("the day after: approved; and the standing then reads it as ended (registeredOn the day approved)", () => {
    expect(approveFaults(file(), "2026-10-02")).toEqual([]);
    expect(read("2026-10-02", [cancelled], "2026-10-02").standing).toBe("ACTIVE");
  });
  it("sending it for decision asks the same", () => {
    expect(codes(submitFaults(file(), "2026-10-01"))).toEqual(["CANCELLED_APPROVE_FROM"]);
    expect(submitFaults(file(), "2026-10-05")).toEqual([]);
  });
});

describe("both orders with a withdrawal", () => {
  it("cancelled → a new application opened → the cancellation withdrawn as recorded in error: the new one is not approved (the supplier is registered: renew or upgrade)", () => {
    expect(openApplicationFaults("NEW", "REGISTERED", false, null, inEffect(cancelled))).toEqual([]);
    expect(withdrawCancellationFaults({ reason: "Another company's notice", personActive: true }, { today: "2026-10-03", event: { kind: "REGISTRATION_CANCELLED", withdrawn: false } })).toEqual([]);
    const after = read("2025-01-15", [{ ...cancelled, withdrawn: true }], "2026-10-03");
    expect(after.standing).toBe("ACTIVE");
    expect(after.notes).toEqual([]);
    const fs = approveFaults(file({ cancellation: inEffect(after.cancellation) }), "2026-10-03");
    expect(fs).toEqual([{ code: "KIND_NOT_FOR_STATUS", level: "block", data: { kind: "NEW" } }]);
    expect(supplierFaultText(fs[0])).toBe("The supplier is registered: open a renewal or an upgrade.");
  });
  it("a renewal opened → the registration cancelled → the renewal refused at approval → the cancellation withdrawn: approved again", () => {
    expect(openApplicationFaults("RENEWAL", "REGISTERED", false, null, null)).toEqual([]);
    expect(codes(approveFaults(file({ kind: "RENEWAL" }), "2026-10-03"))).toEqual(["CANCELLED_NEW_APPLICATION_ONLY"]);
    const after = read("2025-01-15", [{ ...cancelled, withdrawn: true }], "2026-10-03");
    expect(approveFaults(file({ kind: "RENEWAL", cancellation: inEffect(after.cancellation) }), "2026-10-03")).toEqual([]);
  });
  it("a withdrawn cancellation is never 'ended': registering again says nothing of it", () => {
    expect(read("2026-10-05", [{ ...cancelled, withdrawn: true }]).notes).toEqual([]);
  });
});

// Run 1a (ADR 0019 Amendment 2, BD-613-108 (c), (d), (f)): the three parts of the confirmed mechanism that had no test of
// their own are pinned here, so each claim in the amendment cites one.
describe("ADR 0019 Amendment 2: the rest of the way back", () => {
  const blacklist: BlacklistInEffect = { effectiveOn: "2026-09-24", endsOn: null, reasonLabel: "False declaration in a bid" };
  it("(c) cancelled and blacklisted: a new application opens, but sending and approving it are refused for the blacklisting", () => {
    expect(openApplicationFaults("NEW", "REGISTERED", false, blacklist, inEffect(cancelled))).toEqual([]);
    expect(codes(approveFaults(file({ blacklist: blacklist }), "2026-10-05"))).toEqual(["BLACKLISTED_NOT_APPROVED"]);
    expect(codes(submitFaults(file({ blacklist: blacklist }), "2026-10-05"))).toEqual(["BLACKLISTED_NOT_APPROVED"]);
  });
  it("(d) an ended cancellation stays on the record, marked ended, and may still be withdrawn as recorded in error", () => {
    const ended = read("2026-10-05", [cancelled]);
    expect(ended.notes.map((n) => n.code)).toEqual(["CANCELLATION_ENDED"]);
    expect(withdrawCancellationFaults({ reason: "Another company's notice", personActive: true }, { today: "2026-10-06", event: { kind: "REGISTRATION_CANCELLED", withdrawn: false } })).toEqual([]);
    // Withdrawn, it is read as never in effect: no longer "ended" either.
    expect(read("2026-10-05", [{ ...cancelled, withdrawn: true }]).notes).toEqual([]);
    // The Recorded card offers the withdrawal on any live cancellation, ended or not.
    const panel = readFileSync("src/app/suppliers/[id]/standing-panels.tsx", "utf8");
    expect(panel).toMatch(/cancellationEndedWords\(storedDay\(e\.effectiveOn\), day\(s\.registeredOn\)\)/);
    expect(panel).toMatch(/<WithdrawCancellationDrawer eventId=\{e\.id\}/);
  });
  it("(f) the approval moves registeredOn to the day approved and the audit keeps the day it was", () => {
    const acts = readFileSync("src/app/suppliers/actions.ts", "utf8");
    expect(acts).toMatch(/diffFields\(\{ status: [^}]*, registeredOn: day\(before\.registeredOn\) \}, \{ status: "Registered", registeredOn: today,/);
  });
});

describe("the acts (source)", () => {
  const acts = readFileSync("src/app/suppliers/actions.ts", "utf8");
  it("a first registration's approval sets the registration day whether or not the supplier was registered (M-1)", () => {
    expect(acts).toMatch(/if \(a\.kind === "NEW"\) \{\n\s+const before = await tx\.supplier\.findUniqueOrThrow/);
    expect(acts).toMatch(/data: \{ status: "REGISTERED", registeredOn: dayToDate\(today\) \}/);
    expect(acts).not.toMatch(/a\.kind === "NEW" && l\.supplier\.status !== "REGISTERED"/);
  });
  it("the file judged at approval carries the kind, the status and the cancellation in effect on the locked rows", () => {
    expect(acts).toMatch(/kind: a\.kind as ApplicationKind, supplierStatus: l\.supplier\.status as SupplierStatus, cancellation: st\?\.reading\.cancellation \?\? null/);
  });
});
