import { describe, expect, it } from "vitest";

import { documentInForce, documentState, documentStates } from "./documents";
import { doc, TYPES } from "./fixture";
import { standing } from "./standing";

/**
 * 6.15a fix M-3: on the day, the document in force is the newest verified one whose validity has started.
 * A verified renewal valid only from a later day is carried alongside (`upcoming`) and shown, never in
 * force early. Worked example: the old works certificate expires 30 September 2026; its renewal, verified
 * on 25 September, is valid from 15 October 2026.
 */

const old = doc({ id: "a", typeId: "t_works", validFrom: "2025-10-01", expiresOn: "2026-09-30", verification: "VERIFIED" });
const renewal = doc({ id: "b", typeId: "t_works", supersedesId: "a", lodgedOn: "2026-09-20", validFrom: "2026-10-15", expiresOn: "2027-10-14", verification: "VERIFIED", verifiedOn: "2026-09-25" });

describe("the document in force on a day (fix M-3)", () => {
  it("old still valid, renewal verified but not started: the old one is in force, the renewal carried alongside", () => {
    const s = documentState([old, renewal], "2026-09-28");
    expect(s.state).toBe("VALID");
    expect(s.effective?.id).toBe("a");
    expect(s.upcoming?.id).toBe("b");
    expect(s.pending).toBeNull();
  });

  it("old expired, renewal not yet started: EXPIRED (the lapse rule handles it), the renewal still shown as upcoming", () => {
    const s = documentState([old, renewal], "2026-10-01");
    expect(s).toMatchObject({ state: "EXPIRED", effective: { id: "a" }, upcoming: { id: "b" } });
    // With the lapse rule set, a mandatory type in that state suspends on lapse.
    const mandatory = documentStates([{ ...TYPES.works, mandatoryAtRegistration: true }], [old, renewal], "2026-10-01").map((x) => ({ typeLabel: x.type.label, state: x.state }));
    expect(standing({ status: "REGISTERED", registeredOn: null }, [], mandatory, { autoSuspendOnLapse: true }, "2026-10-01").standing).toBe("SUSPENDED_ON_LAPSE");
  });

  it("boundary: the day before the renewal starts it is still upcoming; on its first day it is in force", () => {
    expect(documentState([old, renewal], "2026-10-14")).toMatchObject({ state: "EXPIRED", upcoming: { id: "b" } });
    expect(documentState([old, renewal], "2026-10-15")).toMatchObject({ state: "VALID", effective: { id: "b" }, upcoming: null });
    expect(documentInForce([old, renewal], "2026-10-15")?.id).toBe("b");
  });

  it("nothing verified has started yet: the newest verified reads not yet valid", () => {
    const first = { ...renewal, supersedesId: null };
    expect(documentState([first], "2026-10-01")).toMatchObject({ state: "NOT_YET_VALID", effective: { id: "b" }, upcoming: null });
  });

  it("a renewal with no 'valid from' takes effect once verified, as before", () => {
    const plain = { ...renewal, validFrom: null };
    expect(documentState([old, plain], "2026-09-28")).toMatchObject({ state: "VALID", effective: { id: "b" }, upcoming: null });
  });

  it("an unverified renewal is never in force and is pending, not upcoming", () => {
    const lodged = { ...renewal, verification: "NOT_CHECKED" as const, verifiedOn: null };
    expect(documentState([old, lodged], "2026-10-20")).toMatchObject({ state: "EXPIRED", effective: { id: "a" }, pending: { id: "b" }, upcoming: null });
  });
});
