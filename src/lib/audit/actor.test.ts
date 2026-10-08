import { describe, expect, it } from "vitest";

import { actorColumns, actorDisplayName } from "./actor";

describe("actorColumns", () => {
  it("writes a row with no actor as it always was: unattributed, with no actor reference", () => {
    expect(actorColumns(undefined)).toEqual({ unattributed: true, actorPersonId: null });
  });

  it("names a staff actor, their session, the offices they held and where they came from", () => {
    const columns = actorColumns({ kind: "STAFF", personId: "p1", sessionId: "s1", offices: [{ roleCode: "HOD", scope: "FIN" }], sourceAddress: "203.0.113.9" });
    expect(columns).toEqual({
      unattributed: false,
      actorKind: "STAFF",
      actorPersonId: "p1",
      actorSessionId: "s1",
      actorOffices: [{ roleCode: "HOD", scope: "FIN" }],
      sourceAddress: "203.0.113.9",
    });
  });

  it("allows a staff actor with no session: the account holder using a one-time code", () => {
    expect(actorColumns({ kind: "STAFF", personId: "p1", sessionId: null, offices: [], sourceAddress: null })).toMatchObject({ actorKind: "STAFF", actorSessionId: null });
  });

  it("names a supplier actor by account, with no person", () => {
    const columns = actorColumns({ kind: "SUPPLIER", supplierAccountId: "a1", sessionId: "s1", sourceAddress: null });
    expect(columns).toMatchObject({ unattributed: false, actorKind: "SUPPLIER", actorSupplierAccountId: "a1" });
    expect(columns).not.toHaveProperty("actorPersonId");
  });

  it("names the system by what ran, and refuses one that says nothing", () => {
    expect(actorColumns({ kind: "SYSTEM", label: "bootstrap command" })).toEqual({ unattributed: false, actorKind: "SYSTEM", actorSystemLabel: "bootstrap command" });
    expect(() => actorColumns({ kind: "SYSTEM", label: "  " })).toThrow();
  });

  it("refuses an actor that would break the database CHECK, here, not in the middle of a write", () => {
    expect(() => actorColumns({ kind: "STAFF", personId: "", sessionId: "s", offices: [], sourceAddress: null })).toThrow();
    expect(() => actorColumns({ kind: "SUPPLIER", supplierAccountId: "", sessionId: "s", sourceAddress: null })).toThrow();
  });
});

describe("who an entry says acted, in words (Phase 4a)", () => {
  it("names a supplier's own act for what it is, and never as a person who is gone", () => {
    expect(actorDisplayName({ actorKind: "SUPPLIER", actorPerson: null, actorSystemLabel: null })).toBe("A supplier's portal account");
    expect(actorDisplayName({ actorKind: "STAFF", actorPerson: { name: "Aziz" } })).toBe("Aziz");
    expect(actorDisplayName({ actorKind: "SYSTEM", actorSystemLabel: "demo loader" })).toBe("System: demo loader");
    expect(actorDisplayName({})).toBeNull();
  });
});
