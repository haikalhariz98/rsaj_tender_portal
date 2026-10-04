import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { suspendFaults } from "./reinstate";
import { standing, type StandingEventFacts } from "./standing";

/** 6.15a fix S-4: the Suspend control's refusal names the standing actually in effect, and since when. */

const ev = (o: Partial<StandingEventFacts> & Pick<StandingEventFacts, "id" | "kind">): StandingEventFacts => ({ effectiveOn: "2026-09-24", endsOn: null, offenceNo: null, reasonLabel: "A reason", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: null, ...o });
const ask = { reasonId: "r", effectiveOn: "2026-10-02", personActive: true, flaggedDocumentIds: [] };
const ctx = (events: StandingEventFacts[]) => ({ today: "2026-10-02", status: "REGISTERED", registeredOn: "2026-01-01", reading: standing({ status: "REGISTERED" }, events, [], { autoSuspendOnLapse: null }, "2026-10-02"), reason: { appliesTo: "SUSPEND" as const, retiredOn: null }, documentIds: [] });

describe("the Suspend refusal names the standing (fix S-4)", () => {
  it("blacklisted: says blacklisted, since its day", () => {
    const f = suspendFaults(ask, ctx([ev({ id: "b", kind: "BLACKLIST", offenceNo: 1, endsOn: "2031-09-24" })]));
    expect(f.map((x) => supplierFaultText(x))).toEqual(["The supplier is blacklisted (since 24 Sep 2026): a suspension adds nothing."]);
  });

  it("registration cancelled: says so, never 'blacklisted or cancelled'", () => {
    const f = suspendFaults(ask, ctx([ev({ id: "c", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-09-30" })]));
    expect(f.map((x) => supplierFaultText(x))).toEqual(["The supplier's registration is cancelled (since 30 Sep 2026): a suspension adds nothing."]);
  });
});
