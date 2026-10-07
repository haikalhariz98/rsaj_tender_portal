import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { authorisationFields, signatureFields } from "./audit-view";
import { seatWords } from "./labels";

/**
 * NFR-SIG-001 and the product owner's ruling of 2026-10-07: an opening authorisation and a signature on the schedule record the capacity the member acted in, the opening-panel
 * seat, by its key (the opening's own panel row), and a screen reads its label. A row made before the seat was kept says so and is not backfilled (ADR 0034 D12).
 */

describe("the seat in words", () => {
  it("is the seat label the opening kept at its start", () => {
    expect(seatWords("Chairman")).toBe("seat: Chairman");
    expect(seatWords("  Member  ")).toBe("seat: Member");
  });
  it("says so where the act was recorded before the seat was kept, and invents nothing", () => {
    expect(seatWords(null)).toBe("seat not recorded");
    expect(seatWords(undefined)).toBe("seat not recorded");
    expect(seatWords("  ")).toBe("seat not recorded");
  });
});

describe("the audit row of each act names the seat", () => {
  it("an authorisation", () => {
    const f = authorisationFields({ person: "Aminah", at: new Date("2026-10-05T01:00:00Z"), sittingNo: 1, opensTheBox: false, seat: "Chairman" }, "Asia/Kuching");
    expect(f).toMatchObject({ authorisedBy: "Aminah", inTheSeatOf: "Chairman" });
  });
  it("a signature on the schedule", () => {
    expect(signatureFields({ person: "Aminah", signedOn: "2026-10-05", seat: "Chairman" })).toMatchObject({ signedBy: "Aminah", inTheSeatOf: "Chairman" });
  });
  it("a caller that does not say leaves the field out, so the box's repeated rows are unchanged", () => {
    expect(authorisationFields({ person: "Aminah", at: new Date("2026-10-05T01:00:00Z"), sittingNo: 1, opensTheBox: true }, null)).not.toHaveProperty("inTheSeatOf");
  });
});

describe("the acts keep the seat (source scan)", () => {
  const root = process.cwd();
  const actions = readFileSync(path.join(root, "src", "app", "sourcing", "[id]", "opening", "actions.ts"), "utf8");
  const part = (from: string, to: string) => actions.slice(actions.indexOf(from), actions.indexOf(to));
  it("an authorisation writes the member's own panel row", () => {
    const body = part("export async function recordAuthorisation(", "export async function adjournOpening(");
    expect(body).toMatch(/const seat = o\.panel\.find\(\(p\) => p\.personId === personId\)/);
    expect(body).toMatch(/openingAuthorisation\.create\(\{ data: \{[^}]*panelMemberId: seat\?\.id \?\? null/);
  });
  it("a signature writes the member's own panel row", () => {
    const body = part("export async function recordSignature(", "export async function recordScheduleDetails(");
    expect(body).toMatch(/openingSignature\.create\(\{ data: \{[^}]*panelMemberId: seat\.id/);
  });
  it("the opening's read names the seat of each, and reads it from the row's own panel member", () => {
    const repo = readFileSync(path.join(root, "src", "lib", "opening", "repo.ts"), "utf8");
    expect(repo.match(/panelMember: \{ select: \{ seatLabelSnapshot: true \} \}/g)).toHaveLength(2);
    const read = readFileSync(path.join(root, "src", "lib", "opening", "read.ts"), "utf8");
    expect(read).toContain("seatWords(a.panelMember?.seatLabelSnapshot)");
    expect(read).toContain("seatWords(s.panelMember?.seatLabelSnapshot)");
  });
  it("the seat is a nullable foreign key to the opening's panel row on both models, so an earlier row is not backfilled", () => {
    const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
    for (const model of ["OpeningAuthorisation", "OpeningSignature"]) {
      const body = new RegExp(String.raw`\nmodel ${model} \{([\s\S]*?)\n\}`).exec(schema)![1];
      expect(body, model).toMatch(/\n\s+panelMemberId\s+String\?/);
      expect(body, model).toMatch(/panelMember\s+OpeningPanelMember\?\s+@relation\(fields: \[panelMemberId\], references: \[id\], onDelete: Restrict\)/);
    }
  });
});
