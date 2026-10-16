import { describe, expect, it } from "vitest";

import { whereMatches } from "./where-match";

const row = { status: "ISSUED", commencedOn: null, contract: { status: "ACTIVE" }, awards: [{ status: "DRAFT" }] };

describe("whereMatches, the test reading of a Prisma where", () => {
  it("reads equality, in, notIn and not, with SQL's nulls", () => {
    expect(whereMatches(row, { status: "ISSUED" })).toBe(true);
    expect(whereMatches(row, { status: { in: ["DRAFT", "ISSUED"] } })).toBe(true);
    expect(whereMatches(row, { status: { notIn: ["ISSUED"] } })).toBe(false);
    expect(whereMatches(row, { commencedOn: null })).toBe(true);
    expect(whereMatches(row, { commencedOn: { not: null } })).toBe(false);
    expect(whereMatches(row, { commencedOn: { not: "x" } })).toBe(false);
    expect(whereMatches(row, { commencedOn: { notIn: ["x"] } })).toBe(false);
  });
  it("reads AND, OR and the relation operators", () => {
    expect(whereMatches(row, { OR: [{ status: "DRAFT" }, { contract: { is: { status: "ACTIVE" } } }] })).toBe(true);
    expect(whereMatches(row, { AND: [{ status: "ISSUED" }, { contract: { is: null } }] })).toBe(false);
    expect(whereMatches(row, { contract: { isNot: null } })).toBe(true);
    expect(whereMatches({ ...row, contract: null }, { contract: { isNot: { status: "ACTIVE" } } })).toBe(true);
    expect(whereMatches(row, { awards: { none: { status: "DRAFT" } } })).toBe(false);
    expect(whereMatches(row, { awards: { some: { status: "DRAFT" } } })).toBe(true);
  });
  it("throws on NOT, an unknown operator, or a field the row does not carry", () => {
    expect(() => whereMatches(row, { NOT: { status: "ISSUED" } })).toThrow(/NOT/);
    expect(() => whereMatches(row, { status: { gt: "A" } })).toThrow(/unsupported operator/);
    expect(() => whereMatches(row, { status: { in: ["A"], not: "B" } })).toThrow(/one per field/);
    expect(() => whereMatches(row, { exerciseId: "x" })).toThrow(/does not carry/);
  });
});
