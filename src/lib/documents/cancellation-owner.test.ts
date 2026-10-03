import { describe, expect, it } from "vitest";

import { attachFault, ownerState, purposeFits, reliedOn, type OwnerFacts } from "./attach";
import { onDemoSide } from "./demo-wipe-plan";
import { EXIT_TEXT, PURPOSE_LABEL } from "./labels";
import { cancellationOwnerFacts, cancellationOwnerLabel } from "./owner-facts";
import { ATTACHABLE_OWNER_KINDS, ownerHref } from "./targets";
import { OWNER_COLUMN, PURPOSE_CLASSIFICATION, PURPOSE_OWNER } from "./types";

/**
 * 615-C2 (BD-613-91): a registration body's notice cancelling a supplier's registration is attached on the record of
 * the cancellation, through the document store. Open while the record stands; a withdrawn record keeps what it has.
 */
const c = (x: Partial<Extract<OwnerFacts, { kind: "standingEvent" }>> = {}): OwnerFacts => ({ kind: "standingEvent", cancellation: true, withdrawn: false, ...x });

describe("a registration cancelled, as an attachment owner (615-C2)", () => {
  it("takes the body's notice while it stands", () => {
    expect(ownerState("REGISTRATION_CANCELLATION_NOTICE", c())).toEqual({ state: "OPEN" });
    expect(purposeFits("REGISTRATION_CANCELLATION_NOTICE", c())).toBe(true);
    expect(attachFault({ purpose: "REGISTRATION_CANCELLATION_NOTICE", owner: c(), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } })).toEqual([]);
  });
  it("withdrawn as recorded in error, it keeps what it has", () => {
    expect(ownerState("REGISTRATION_CANCELLATION_NOTICE", c({ withdrawn: true }))).toEqual({ state: "FROZEN", exit: "CANCELLATION_WITHDRAWN" });
    expect(EXIT_TEXT.CANCELLATION_WITHDRAWN).toMatch(/withdrawn/);
  });
  it("only a cancellation takes it, and it takes only its own purpose", () => {
    expect(purposeFits("REGISTRATION_CANCELLATION_NOTICE", c({ cancellation: false }))).toBe(false);
    expect(attachFault({ purpose: "SUPPLIER_DOCUMENT", owner: c(), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } }).map((f) => f.code)).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    expect(purposeFits("REGISTRATION_CANCELLATION_NOTICE", { kind: "supplierDocument", renewed: false, verified: false })).toBe(false);
  });
  it("nothing stands on the notice: it may be detached with a reason like any record's paper", () => {
    expect(reliedOn("REGISTRATION_CANCELLATION_NOTICE", c(), 1, "v1")).toBeNull();
  });
  it("is keyed, labelled and linked by the supplier, never an id", () => {
    expect(PURPOSE_OWNER.REGISTRATION_CANCELLATION_NOTICE).toBe("standingEvent");
    expect(OWNER_COLUMN.standingEvent).toBe("standingEventId");
    expect(PURPOSE_CLASSIFICATION.REGISTRATION_CANCELLATION_NOTICE).toBeUndefined();
    expect(ATTACHABLE_OWNER_KINDS).toContain("standingEvent");
    const row = { kind: "REGISTRATION_CANCELLED", withdrawnAt: null, bodyLabelSnapshot: "Demo Works Board", externalReference: "WB/2026/118", supplierId: "sup1", supplier: { reference: "DEMO/V/0007" } };
    expect(cancellationOwnerLabel(row)).toBe("DEMO/V/0007 · Registration cancelled by Demo Works Board (WB/2026/118)");
    expect(cancellationOwnerFacts(row)).toEqual(c());
    expect(cancellationOwnerFacts({ ...row, withdrawnAt: new Date("2026-10-02T03:00:00Z") })).toEqual(c({ withdrawn: true }));
    expect(ownerHref("standingEvent", "ev1", "sup1")).toBe("/suppliers/sup1?tab=standing");
    expect(PURPOSE_LABEL.REGISTRATION_CANCELLATION_NOTICE).toBe("Registration body's notice of cancellation");
  });
  it("goes with its supplier when the demo is wiped", () => {
    const side = { isDemo: (id: string) => id.startsWith("demo_"), removedExerciseIds: new Set<string>(), removedAwardIds: new Set<string>(), removedStandingEventIds: new Set(["made-on-a-demo-supplier"]) };
    const a = (standingEventId: string) => ({ id: "a", purpose: "REGISTRATION_CANCELLATION_NOTICE" as const, meetingId: null, exerciseId: null, awardId: null, delegationId: null, standingEventId });
    expect(onDemoSide(a("demo_vstd9"), side)).toBe(true);
    expect(onDemoSide(a("made-on-a-demo-supplier"), side)).toBe(true);
    expect(onDemoSide(a("a-real-one"), side)).toBe(false);
  });
});
