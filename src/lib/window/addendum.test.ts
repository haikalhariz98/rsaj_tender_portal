import { describe, expect, it } from "vitest";

import { addendaForNewPurchaser, addendumWindowFault, deliveryFaults, issueFaults, nextAddendumNumber, notified, recipientsFor } from "./addendum";
import { windowFindingText } from "./labels";

/**
 * FR-ADV-014 (and FR-ADV-012: the register is the list): numbered 1, 2, 3 per exercise as issued
 * (a voided draft takes no number), the signed copy required, never after closing, recipients the
 * register at issue, notified only when every copy is recorded as sent (100%).
 */

const codes = (fs: { code: string; level: string }[], level = "block") => fs.filter((f) => f.level === level).map((f) => f.code);
const ok = { status: "DRAFT", phase: "OPEN_FOR_PURCHASE" as const, title: "Revised drawing 4", whatChanged: "Drawing 4 replaces the earlier issue.", signedCopies: 1, template: { state: "OK" as const, missing: [], unknown: [] }, recipients: 2, today: "2026-11-08" };

describe("numbering", () => {
  it("1, 2, 3 as issued; a voided draft takes no number", () => {
    expect(nextAddendumNumber([])).toBe(1);
    expect(nextAddendumNumber([{ status: "ISSUED", number: 1 }])).toBe(2);
    expect(nextAddendumNumber([{ status: "ISSUED", number: 1 }, { status: "VOID", number: null }, { status: "DRAFT", number: null }])).toBe(2);
    expect(nextAddendumNumber([{ status: "ISSUED", number: 1 }, { status: "ISSUED", number: 2 }])).toBe(3);
  });
});

describe("issuing", () => {
  it("a complete draft during the window issues", () => expect(codes(issueFaults(ok))).toEqual([]));
  it("no signed copy refuses", () => {
    expect(codes(issueFaults({ ...ok, signedCopies: 0 }))).toEqual(["SIGNED_COPY_REQUIRED"]);
    expect(windowFindingText({ code: "SIGNED_COPY_REQUIRED", level: "block" })).toMatch(/Attach the signed addendum/);
  });
  it("after closing refuses; before publication refuses; cancelled refuses", () => {
    expect(codes(issueFaults({ ...ok, phase: "CLOSED" }))).toEqual(["AFTER_CLOSING"]);
    expect(codes(issueFaults({ ...ok, phase: "NOT_PUBLISHED" }))).toEqual(["NOT_PUBLISHED"]);
    expect(codes(issueFaults({ ...ok, phase: "CANCELLED" }))).toEqual(["EXERCISE_CANCELLED"]);
    expect(addendumWindowFault("CLOSED_FOR_PURCHASE")).toBeNull();
  });
  it("only a draft, with its title and what it changes", () => {
    expect(codes(issueFaults({ ...ok, status: "ISSUED" }))).toEqual(["NOT_DRAFT"]);
    expect(codes(issueFaults({ ...ok, title: " ", whatChanged: "" }))).toEqual(["TITLE_REQUIRED", "WHAT_CHANGED_REQUIRED"]);
  });
  it("the template unset, without text, or incomplete refuses", () => {
    expect(codes(issueFaults({ ...ok, template: { state: "NOT_SET", missing: [], unknown: [] } }))).toEqual(["TEMPLATE_NOT_SET"]);
    expect(codes(issueFaults({ ...ok, template: { state: "NO_TEXT", missing: [], unknown: [] } }))).toEqual(["TEMPLATE_TEXT_NOT_SET"]);
    expect(codes(issueFaults({ ...ok, template: { state: "OK", missing: ["addendum.title"], unknown: ["x"] } }))).toEqual(["TEMPLATE_UNKNOWN_FIELD", "TEMPLATE_INCOMPLETE"]);
  });
  it("with no purchasers it still issues, saying there is nobody to notify", () => {
    const fs = issueFaults({ ...ok, recipients: 0 });
    expect(codes(fs)).toEqual([]);
    expect(codes(fs, "info")).toEqual(["NO_RECIPIENTS"]);
  });
});

describe("who receives it", () => {
  it("every party with a live sale at issue, and each invitee with a letter, once", () => {
    const sales = [{ partyId: "a", voidedAt: null }, { partyId: "b", voidedAt: new Date() }, { partyId: "c", voidedAt: null }];
    expect(recipientsFor(sales)).toEqual(["a", "c"]);
    expect(recipientsFor(sales, [{ partyId: "c" }, { partyId: "d" }])).toEqual(["a", "c", "d"]);
  });
  it("a later purchaser receives every issued one with the documents", () => {
    expect(addendaForNewPurchaser([{ id: "1", status: "ISSUED" }, { id: "2", status: "DRAFT" }, { id: "3", status: "VOID" }]).map((a) => a.id)).toEqual(["1"]);
  });
});

describe("notified to 100%", () => {
  it("only when every copy is despatched or given with the documents", () => {
    expect(notified([{ despatchedOn: new Date(), withDocuments: false }, { despatchedOn: null, withDocuments: false }])).toEqual({ state: "OUTSTANDING", done: 1, of: 2 });
    expect(notified([{ despatchedOn: new Date(), withDocuments: false }, { despatchedOn: null, withDocuments: true }])).toEqual({ state: "COMPLETE", done: 2, of: 2 });
    expect(notified([])).toEqual({ state: "NO_RECIPIENTS", done: 0, of: 0 });
  });
  it("a delivery records how and when, never in the future, acknowledged no earlier than sent", () => {
    expect(deliveryFaults({ method: "REGISTERED_POST", despatchedOn: "2026-11-08", acknowledgedOn: "2026-11-09" }, "2026-11-09")).toEqual([]);
    expect(deliveryFaults({ method: null, despatchedOn: "2026-11-08", acknowledgedOn: null }, "2026-11-09").map((f) => f.code)).toEqual(["METHOD_REQUIRED"]);
    expect(deliveryFaults({ method: "BY_HAND", despatchedOn: "2026-11-10", acknowledgedOn: null }, "2026-11-09").map((f) => f.code)).toEqual(["DESPATCH_IN_FUTURE"]);
    expect(deliveryFaults({ method: "BY_HAND", despatchedOn: "2026-11-08", acknowledgedOn: "2026-11-07" }, "2026-11-09").map((f) => f.code)).toEqual(["ACK_BEFORE_DESPATCH"]);
    expect(deliveryFaults({ method: "BY_HAND", despatchedOn: null, acknowledgedOn: null, withDocuments: true }, "2026-11-09").map((f) => f.code)).toEqual(["WITH_DOCUMENTS"]);
  });
});
