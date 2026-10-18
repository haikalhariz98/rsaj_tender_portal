import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { formatDate } from "@/lib/format";

import { awardStanding } from "./award-standing";
import { standing, type StandingEventFacts } from "./standing";

/**
 * 6.15a fix S-3 (against accepted 6.11; BD-615-17 sent back): an award shows its linked supplier's derived
 * standing, and warns where the supplier is barred, naming the standing and since when. The product does
 * not refuse the award: whether a barred supplier may be awarded is a customer policy question with no
 * rule set (carry 615-C5).
 */

const ev = (o: Partial<StandingEventFacts> & Pick<StandingEventFacts, "id" | "kind">): StandingEventFacts => ({ effectiveOn: "2026-09-24", endsOn: null, offenceNo: null, reasonLabel: "False declaration in a bid", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: null, ...o });
const on = "2026-10-02";
const read = (events: StandingEventFacts[], mandatory: { typeLabel: string; state: "VALID" | "EXPIRED" }[] = [], auto: boolean | null = null) => standing({ status: "REGISTERED", registeredOn: null }, events, mandatory, { autoSuspendOnLapse: auto }, on);

describe("the awardee's standing on an award (fix S-3)", () => {
  it("blacklisted: the standing, since when, why and to when, and that the award is not refused", () => {
    const a = awardStanding(read([ev({ id: "b", kind: "BLACKLIST", offenceNo: 1, endsOn: "2031-09-24" })]), formatDate);
    expect(a.words.en).toBe("Blacklisted");
    expect(a.tone).toBe("err");
    expect(a.warning?.en).toBe("Blacklisted since 24 Sep 2026 (False declaration in a bid; last blacklisted day 23 Sep 2031, free from 24 Sep 2031) — an award is not refused by the product: rule not set.");
  });

  it("suspended, suspended on lapse and cancelled each name themselves", () => {
    expect(awardStanding(read([ev({ id: "s", kind: "SUSPEND", reasonLabel: "Documents not in order" })]), formatDate).warning?.en).toBe("Suspended since 24 Sep 2026 (Documents not in order) — an award is not refused by the product: rule not set.");
    expect(awardStanding(read([], [{ typeLabel: "Works board certificate", state: "EXPIRED" }], true), formatDate).warning?.en).toBe("Suspended on lapse: Works board certificate expired — an award is not refused by the product: rule not set.");
    expect(awardStanding(read([ev({ id: "c", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-09-30" })]), formatDate).warning?.en).toBe("Registration cancelled since 30 Sep 2026 — an award is not refused by the product: rule not set.");
  });

  it("active, or active with the lapse rule unset: shown as the register says it, no warning", () => {
    expect(awardStanding(read([]), formatDate)).toEqual({ words: { en: "Active", ms: "Aktif" }, tone: "ok", warning: null });
    const lapse = awardStanding(read([], [{ typeLabel: "Works board certificate", state: "EXPIRED" }], null), formatDate);
    expect(lapse.words.en).toBe("Active — lapse rule not set; a mandatory document has expired");
    expect(lapse.tone).toBe("warn");
    expect(lapse.warning).toBeNull();
  });

  it("boundary: on the free-from day the blacklisting no longer warns", () => {
    const events = [ev({ id: "b", kind: "BLACKLIST", offenceNo: 1, effectiveOn: "2021-10-02", endsOn: "2026-10-02" })];
    expect(awardStanding(standing({ status: "REGISTERED", registeredOn: null }, events, [], { autoSuspendOnLapse: null }, "2026-10-01"), formatDate).warning).not.toBeNull();
    expect(awardStanding(standing({ status: "REGISTERED", registeredOn: null }, events, [], { autoSuspendOnLapse: null }, "2026-10-02"), formatDate).warning).toBeNull();
  });

  it("the award's record, form and route step show it; nothing in the award's acts refuses on it (source)", () => {
    // C-3: the panels moved out of the award page (wave C step C4); award-view.tsx (C5) keeps the standing read, the panels show it.
    const dir = "src/app/projects/[id]/award/";
    const page = readFileSync(dir + "award-view.tsx", "utf8") + readFileSync(dir + "overview-panel.tsx", "utf8") + readFileSync(dir + "approval-panel.tsx", "utf8");
    expect(page).toMatch(/awardStanding\(vendorStanding\.reading, formatDate\)/);
    expect(page).toMatch(/label: "Standing on the register"/);
    expect(page).toMatch(/Before a step is decided: the awardee's supplier is barred on the register/);
    expect(readFileSync("src/app/awards/award-form.tsx", "utf8")).toMatch(/The bidder's supplier is barred on the register/);
    expect(readFileSync("src/app/awards/new/page.tsx", "utf8")).toMatch(/partyRegister\(/);
    const acts = readFileSync("src/app/awards/actions.ts", "utf8");
    expect(acts).not.toMatch(/awardStanding|barred\(/);
  });
});
