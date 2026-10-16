import { describe, expect, it } from "vitest";

import { MASKED_ACTOR_WORDS, maskSealedAuditRows, openingFactsFor, SEALED_AUDIT_ENTITIES, sealedAuditMask, type SealedAuditFacts } from "./audit-mask";

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
  const facts = (f: Partial<SealedAuditFacts> = {}): SealedAuditFacts => ({ started: true, online: true, unsealed: false, finalised: false, namedOfficerPersonIds: ["p-officer"], ...f });
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

  it("a record whose exercise cannot be found is withheld (the mask fails closed; since the security audit's 20u fix the row is not shown at all)", () => {
    expect(shown("OnlineBid", null, "p-officer")).toBeUndefined();
  });

  it("other records pass through untouched, and a History row with no actor gets none added", () => {
    const other = row("BidEnvelope");
    expect(maskSealedAuditRows([other], () => null, null)[0]).toBe(other);
    const noActor = { entity: "OnlineBid", entityId: "r1", changes: row("OnlineBid").changes };
    expect("actorName" in maskSealedAuditRows([noActor], () => facts(), null)[0]).toBe(false);
  });

  // Security audit 2 (20u): before the opening starts the rows of an online bid are not shown to anyone, so the sequence, replacements, withdrawals, uploads and their times stay unread.
  it.each(SEALED_AUDIT_ENTITIES)("%s: before the opening starts the row is withheld from the named officer and from everyone else", (entity) => {
    for (const viewer of ["p-officer", "p-other", null]) expect(maskSealedAuditRows([row(entity)], () => facts({ started: false }), viewer)).toEqual([]);
  });

  it("a row whose exercise cannot be found is withheld altogether (fails closed)", () => {
    expect(maskSealedAuditRows([row("OnlineBid")], () => null, "p-officer")).toEqual([]);
  });

  it("the fields that group one bidder's submissions or size its files are withheld with the supplier's", () => {
    const grouped = { entity: "OnlineBid", entityId: "r1", actorName: "x", changes: [{ field: "Replaces", before: null, after: "b1" }, { field: "Replaced by", before: null, after: "b2" }, { field: "Parent", before: null, after: "b0" }, { field: "Cipher bytes", before: null, after: "9000" }, { field: "Status", before: "a", after: "b" }] };
    expect(maskSealedAuditRows([grouped], () => facts({ unsealed: true }), "p-other")[0].changes).toEqual([{ field: "Status", before: "a", after: "b" }]);
  });
});

describe("the offers an unseal names on an online exercise (20c: only the named officers see who bid until finalising)", () => {
  const offer = { entity: "OpenedBid", entityId: "o1", actorName: "An officer", changes: [{ field: "Bidder", before: null, after: "Acme Sdn Bhd" }, { field: "Listing no", before: null, after: "1" }] };
  const envelope = { entity: "BidEnvelope", entityId: "e1", actorName: "An officer", changes: [{ field: "Status", before: "Received", after: "Opened" }, { field: "Bidder", before: null, after: "Acme Sdn Bhd" }] };
  const facts = (f: Partial<SealedAuditFacts> = {}): SealedAuditFacts => ({ started: true, online: true, unsealed: true, finalised: false, namedOfficerPersonIds: ["p-officer"], ...f });
  it.each([offer, envelope])("$entity: the bidder's name is withheld from anyone not a named officer, whoever they are, until finalising; the actor stays", (r) => {
    for (const viewer of ["p-other", null]) {
      const [out] = maskSealedAuditRows([r], () => facts(), viewer);
      expect(JSON.stringify(out)).not.toContain("Acme");
      expect(out.actorName).toBe("An officer");
    }
    expect(maskSealedAuditRows([r], () => facts(), "p-officer")[0]).toEqual(r);
    expect(maskSealedAuditRows([r], () => facts({ finalised: true }), "p-other")[0]).toEqual(r);
  });
  it("a paper exercise's opened offers and envelopes are not masked: the names are read out at the table", () => {
    for (const r of [offer, envelope]) expect(maskSealedAuditRows([r], () => facts({ online: false }), null)[0]).toBe(r);
  });
});

describe("each late online bid is judged by its own opening (ruling 20ax)", () => {
  const main = { unsealed: true, finalised: true };
  it("an in-time bid is judged by the main opening, a late one never by it", () => {
    expect(openingFactsFor({ main, late: false, supplementary: null })).toEqual(main);
    expect(openingFactsFor({ main: null, late: false, supplementary: { unsealed: true, finalised: true } })).toEqual({ unsealed: false, finalised: false });
    expect(openingFactsFor({ main, late: true, supplementary: null })).toEqual({ unsealed: false, finalised: false });
  });
  it("a late bid is named to the named officers once its supplementary opening is unsealed, and to everyone once it is finalised", () => {
    const unsealed = openingFactsFor({ main, late: true, supplementary: { unsealed: true, finalised: false } });
    expect(unsealed).toEqual({ unsealed: true, finalised: false });
    expect(sealedAuditMask({ entity: "OnlineBid", viewer: "NAMED_OFFICER", ...unsealed })).toEqual({ hideActor: false, hideSupplier: false });
    expect(sealedAuditMask({ entity: "OnlineBid", viewer: "OTHER", ...unsealed })).toEqual({ hideActor: true, hideSupplier: true });
    const finalised = openingFactsFor({ main, late: true, supplementary: { unsealed: true, finalised: true } });
    expect(sealedAuditMask({ entity: "OnlineBid", viewer: "OTHER", ...finalised })).toEqual({ hideActor: false, hideSupplier: false });
  });
  it("a late bid not admitted, or admitted and not yet opened, stays unnamed to everyone, even with the main opening finalised", () => {
    const none = openingFactsFor({ main, late: true, supplementary: null });
    for (const viewer of ["NAMED_OFFICER", "OTHER"] as const) expect(sealedAuditMask({ entity: "OnlineBid", viewer, ...none })).toEqual({ hideActor: true, hideSupplier: true });
    const started = openingFactsFor({ main, late: true, supplementary: { unsealed: false, finalised: false } });
    expect(sealedAuditMask({ entity: "OnlineBidFile", viewer: "NAMED_OFFICER", ...started })).toEqual({ hideActor: true, hideSupplier: true });
  });
});
