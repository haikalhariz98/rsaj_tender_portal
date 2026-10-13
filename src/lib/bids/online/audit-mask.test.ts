import { describe, expect, it } from "vitest";

import { MASKED_ACTOR_WORDS, SEALED_AUDIT_ENTITIES, sealedAuditMask } from "./audit-mask";

describe("the audit mask on online bids (D9, 20c)", () => {
  it.each(SEALED_AUDIT_ENTITIES)("%s: hidden from everyone before the unseal", (entity) => {
    for (const viewer of ["NAMED_OFFICER", "OTHER"] as const) expect(sealedAuditMask({ entity, viewer, unsealed: false, finalised: false })).toEqual({ hideActor: true, hideSupplier: true });
  });

  it.each(SEALED_AUDIT_ENTITIES)("%s: shown to the named officers from the unseal, and to everyone else only from finalising", (entity) => {
    expect(sealedAuditMask({ entity, viewer: "NAMED_OFFICER", unsealed: true, finalised: false })).toEqual({ hideActor: false, hideSupplier: false });
    expect(sealedAuditMask({ entity, viewer: "OTHER", unsealed: true, finalised: false })).toEqual({ hideActor: true, hideSupplier: true });
    expect(sealedAuditMask({ entity, viewer: "OTHER", unsealed: true, finalised: true })).toEqual({ hideActor: false, hideSupplier: false });
    expect(sealedAuditMask({ entity, viewer: "NAMED_OFFICER", unsealed: true, finalised: true })).toEqual({ hideActor: false, hideSupplier: false });
  });

  it("other records are not masked here", () => {
    for (const entity of ["BidEnvelope", "OpenedBid", "SourcingExercise", "DocumentPurchase"]) expect(sealedAuditMask({ entity, viewer: "OTHER", unsealed: false, finalised: false })).toEqual({ hideActor: false, hideSupplier: false });
  });

  it("a masked actor's words name nobody", () => expect(MASKED_ACTOR_WORDS).toMatch(/Withheld/));
});
