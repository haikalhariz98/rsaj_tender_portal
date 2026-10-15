import { describe, expect, it } from "vitest";

import { MASKED_ACTOR_WORDS, maskSealedAuditRows, SEALED_AUDIT_ENTITIES, sealedAuditMask, type SealedAuditFacts } from "./audit-mask";

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

describe("the rows a reader is shown (step 12: Configuration › Audit's export and History)", () => {
  const row = (entity: string) => ({ entity, entityId: "r1", actorName: "A supplier's portal account", changes: [{ field: "Status", before: "Submitted", after: "Withdrawn" }, { field: "Supplier", before: null, after: "Acme Sdn Bhd" }, { field: "Withdrawn by", before: null, after: "an account" }] });
  const facts = (f: Partial<SealedAuditFacts> = {}): SealedAuditFacts => ({ unsealed: false, finalised: false, namedOfficerPersonIds: ["p-officer"], ...f });
  const shown = (entity: string, f: SealedAuditFacts | null, viewer: string | null) => maskSealedAuditRows([row(entity)], () => f, viewer)[0];

  it.each(SEALED_AUDIT_ENTITIES)("%s: before the unseal, withheld from the named officer and from everyone else", (entity) => {
    for (const viewer of ["p-officer", "p-other", null]) {
      const r = shown(entity, facts(), viewer);
      expect(r.actorName).toBe(MASKED_ACTOR_WORDS);
      expect(r.changes).toEqual([{ field: "Status", before: "Submitted", after: "Withdrawn" }]);
    }
  });

  it.each(SEALED_AUDIT_ENTITIES)("%s: after the unseal the named officer sees it and others still do not; after finalising everyone does", (entity) => {
    expect(shown(entity, facts({ unsealed: true }), "p-officer")).toEqual(row(entity));
    expect(shown(entity, facts({ unsealed: true }), "p-other").actorName).toBe(MASKED_ACTOR_WORDS);
    expect(shown(entity, facts({ unsealed: true, finalised: true }), "p-other")).toEqual(row(entity));
    expect(shown(entity, facts({ unsealed: true, finalised: true }), null)).toEqual(row(entity));
  });

  it("an officer taken off is not a named officer: only the facts' list names them", () => {
    expect(shown("OnlineBid", facts({ unsealed: true, namedOfficerPersonIds: [] }), "p-officer").actorName).toBe(MASKED_ACTOR_WORDS);
  });

  it("a record whose exercise cannot be found is withheld (the mask fails closed)", () => {
    expect(shown("OnlineBid", null, "p-officer").actorName).toBe(MASKED_ACTOR_WORDS);
  });

  it("other records pass through untouched, and a History row with no actor gets none added", () => {
    const other = row("BidEnvelope");
    expect(maskSealedAuditRows([other], () => null, null)[0]).toBe(other);
    const noActor = { entity: "OnlineBid", entityId: "r1", changes: row("OnlineBid").changes };
    expect("actorName" in maskSealedAuditRows([noActor], () => facts(), null)[0]).toBe(false);
  });
});
