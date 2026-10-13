import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { submitFaults } from "@/lib/bids/online/submission";
import { holdsBidStanding } from "@/lib/portal/bids/purchase";
import { onlineSubmissionAllowed } from "@/lib/sealing/switch";

import { saleStands, voidedAtOpening } from "./standing";

/**
 * Ruling 17c and 20m (ADR 0036 D8; build plan step 5): one predicate for whether a sale stands for a bid, read by the purchase (`holdsBidStanding`), the opening
 * (`saleFactsOf`, through `voidedAtOpening`) and the online submission's door (`submitFaults`, which takes its answer). The invitee check stays the purchase's own.
 */

type Sale = { voidedAt: Date | null; paymentChannel: "COUNTER" | "SIMULATED"; financeReceiptNo: string | null };
const SALES: (Sale | null)[] = [null];
for (const voidedAt of [null, new Date("2026-11-01T00:00:00Z")]) for (const paymentChannel of ["COUNTER", "SIMULATED"] as const) for (const financeReceiptNo of [null, "R-1"]) SALES.push({ voidedAt, paymentChannel, financeReceiptNo });

const door = (stands: boolean, invited: { invitedPath: boolean; onInviteeList: boolean } = { invitedPath: false, onInviteeList: false }) =>
  submitFaults({
    channel: "ONLINE", online: onlineSubmissionAllowed("LIVE", { demoAllowed: false, liveAllowed: true }, "SUBMIT"), published: true, cancelled: false, keyLive: true,
    saleStands: stands, ...invited, stamp: new Date("2026-11-10T01:00:00Z"), closing: new Date("2026-11-10T04:00:00Z"), mainOpeningStartedAt: null,
    liveMainInTime: false, kind: "BID", replaces: null, parent: "NONE_NAMED", alternativesPermitted: true,
    files: [{ mine: true, state: "DRAFT", packPartId: "p1" }], rules: [{ packPartId: "p1", label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000", openingCheck: true }],
    submissionsBySupplier: 0,
  }).faults;

describe("a sale stands for a bid (17c)", () => {
  it("when there is one, not voided, and, paid on the simulator, only while the deployment allows it; the finance receipt does not decide", () => {
    expect(saleStands(null, true)).toBe(false);
    expect(saleStands({ voidedAt: null, paymentChannel: "COUNTER" }, false)).toBe(true);
    expect(saleStands({ voidedAt: new Date(), paymentChannel: "COUNTER" }, true)).toBe(false);
    expect(saleStands({ voidedAt: null, paymentChannel: "SIMULATED" }, true)).toBe(true);
    expect(saleStands({ voidedAt: null, paymentChannel: "SIMULATED" }, false)).toBe(false);
  });

  it("the purchase, the opening and the door give the same answer for every sale, voided or not, either channel, receipt or not, simulator allowed or not", () => {
    for (const sale of SALES) {
      for (const simulatorAllowed of [true, false]) {
        const stands = saleStands(sale, simulatorAllowed);
        expect(holdsBidStanding({ sale, simulatorAllowed }), JSON.stringify({ sale, simulatorAllowed })).toBe(stands);
        if (sale) expect(voidedAtOpening(sale, simulatorAllowed)).toBe(!stands);
        expect(door(stands).includes("NO_LIVE_SALE")).toBe(!stands);
      }
    }
  });

  it("the readers call the one predicate and keep no copy of it", () => {
    const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    const purchase = src("src/lib/portal/bids/purchase.ts");
    const repo = src("src/lib/opening/repo.ts");
    expect(purchase).toMatch(/standsHere = \([^)]*\)[^=]*=> \(saleStands\(/);
    expect(purchase).toMatch(/return saleStands\(i\.sale, i\.simulatorAllowed\);/);
    expect(repo).toMatch(/voided: voidedAtOpening\(s, simulatorAllowedByDeployment\(\)\)/);
    for (const [name, text] of [["purchase.ts", purchase], ["repo.ts", repo]] as const) expect(text, name).not.toMatch(/paymentChannel\s*[!=]==\s*"SIMULATED"\s*&&\s*!/);
  });
});

describe("the invitee check stays the purchase's own, and the door matches it (20m)", () => {
  it("on the invited path a supplier not on the list is refused in words; on the advertised path the list is not read", () => {
    expect(door(true, { invitedPath: true, onInviteeList: false })).toEqual(["NOT_ON_INVITEE_LIST"]);
    expect(door(true, { invitedPath: true, onInviteeList: true })).toEqual([]);
    expect(door(true, { invitedPath: false, onInviteeList: false })).toEqual([]);
  });

  it("the purchase still refuses a non-invitee itself (checks.ts, INVITED)", () => {
    const checks = readFileSync(path.join(process.cwd(), "src/lib/portal/bids/checks.ts"), "utf8");
    expect(checks).toMatch(/key: "INVITED", state: "BLOCK"/);
  });
});
