import { describe, expect, it } from "vitest";

import { lossSendable, lossStateOf, lossValuable, periodAgreeable, periodSendable, periodStateOf, type LossRow, type PeriodRow } from "./card-rules";

/** Close-out stage A review: what the Time tab's loss-and-expense and contract period cards offer, as pure rules. */

const route = (id: string, status: string) => ({ id, status });
const matter = (o: Partial<NonNullable<LossRow["matter"]>> = {}) => ({ kind: "LOSS_EXPENSE", reference: "CM/1", closedAt: null, approvedRouteId: null, routes: [], ...o });

describe("loss and expense", () => {
  it("reads its state, its approval being the matter's approval of record", () => {
    expect(lossStateOf({ matterId: null, valued: null, matter: null })).toBe("Recorded");
    expect(lossStateOf({ matterId: null, valued: "1.00", matter: null })).toBe("Valued");
    expect(lossStateOf({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "PENDING")] }) })).toBe("Awaiting approval");
    expect(lossStateOf({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "APPROVED")], approvedRouteId: "r1" }) })).toBe("Approved");
    // An approved route not written as the approval of record is not approved.
    expect(lossStateOf({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "APPROVED")] }) })).toBe("Refused");
    expect(lossStateOf({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "REJECTED")] }) })).toBe("Refused");
    expect(lossStateOf({ matterId: "m", valued: "1.00", matter: matter({ closedAt: new Date() }) })).toBe("Closed");
  });
  it("is valued before it is sent, and sent once valued, again after a refusal, never while waiting or once approved", () => {
    expect(lossValuable({ matterId: null, valued: null, matter: null })).toBe(true);
    expect(lossValuable({ matterId: "m", valued: "1.00", matter: matter() })).toBe(false);
    expect(lossSendable({ matterId: null, valued: null, matter: null })).toBe(false);
    expect(lossSendable({ matterId: null, valued: "1.00", matter: null })).toBe(true);
    expect(lossSendable({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "REJECTED")] }) })).toBe(true);
    expect(lossSendable({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "PENDING")] }) })).toBe(false);
    expect(lossSendable({ matterId: "m", valued: "1.00", matter: matter({ routes: [route("r1", "APPROVED")], approvedRouteId: "r1" }) })).toBe(false);
  });
});

describe("the contract period", () => {
  const p = (o: Partial<PeriodRow> & { status?: string } = {}): PeriodRow => ({ m: matter({ kind: "PERIOD_EXTENSION", routes: o.status ? [route("r1", o.status)] : [] }), approved: false, x: { agreements: [] }, ...o });
  it("reads its state: the live agreement first, then its matter", () => {
    expect(periodStateOf(p())).toBe("Recorded");
    expect(periodStateOf(p({ status: "PENDING" }))).toBe("Awaiting approval");
    expect(periodStateOf(p({ approved: true }))).toBe("Approved");
    expect(periodStateOf(p({ approved: true, x: { agreements: [{ certificate: { status: "VOID" } }, { certificate: { status: "SIGNING" } }] } }))).toBe("Agreement raised");
    expect(periodStateOf(p({ approved: true, x: { agreements: [{ certificate: { status: "ISSUED" } }] } }))).toBe("Agreed");
  });
  it("is sent while not approved and not waiting, and agreed once approved with no live agreement", () => {
    expect(periodSendable(p())).toBe(true);
    expect(periodSendable(p({ status: "PENDING" }))).toBe(false);
    expect(periodSendable(p({ approved: true }))).toBe(false);
    expect(periodAgreeable(p({ approved: true }))).toBe(true);
    expect(periodAgreeable(p({ approved: true, x: { agreements: [{ certificate: { status: "DRAFT" } }] } }))).toBe(false);
    expect(periodAgreeable(p({ approved: true, x: { agreements: [{ certificate: { status: "VOID" } }] } }))).toBe(true);
  });
});
