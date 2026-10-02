import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { linkPartyFaults } from "./link";

/** 6.15a fix R-12: two parties on one exercise linked to the same supplier is refused, naming the other party. */

const supplier = { id: "s1", registrationNo: "201001000101", status: "REGISTERED" };
const party = { registrationNo: "201001000101", vendorId: null };

describe("one supplier is one party on an exercise (fix R-12)", () => {
  it("a second party of the exercise is refused, naming the party that holds the supplier", () => {
    const fs = linkPartyFaults(party, supplier, "", [{ name: "Syarikat Teladan Sdn Bhd (as the invitee)", vendorId: "s1" }, { name: "Other", vendorId: null }]);
    expect(fs).toEqual([{ code: "SUPPLIER_ON_OTHER_PARTY", level: "block", data: { party: "Syarikat Teladan Sdn Bhd (as the invitee)" } }]);
    expect(supplierFaultText(fs[0])).toBe("Syarikat Teladan Sdn Bhd (as the invitee) is already linked to that supplier on this exercise: one company is one party on an exercise. Use that party.");
  });

  it("other parties linked to other suppliers, or unlinked, do not stand in the way", () => {
    expect(linkPartyFaults(party, supplier, "", [{ name: "A", vendorId: "s2" }, { name: "B", vendorId: null }])).toEqual([]);
  });

  it("the act reads the exercise's other parties with the exercise locked, and the database backs it with a unique index", () => {
    expect(readFileSync("src/app/suppliers/link-actions.ts", "utf8")).toMatch(/exerciseParty\.findMany\(\{ where: \{ exerciseId: l\.ex\.id, NOT: \{ id: party\.id \} \}/);
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/@@unique\(\[exerciseId, vendorId\]\)/);
    expect(readFileSync("prisma/migrations/20261002210200_exercise_party_one_per_supplier/migration.sql", "utf8")).toMatch(/CREATE UNIQUE INDEX "ExerciseParty_exerciseId_vendorId_key"/);
  });
});
