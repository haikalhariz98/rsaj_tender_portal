import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { decimalText } from "@/lib/format";
import { parseSen, senToDecimalString } from "@/lib/money";

import { firstReleaseShare, releaseOf } from "./retention";

/// Code review run 2, item 1: a Decimal(9,4) read back from the database is "50" (no point), so stripping zeros
/// from its end read a 50% first release as 5%. The act and the Payments tab now read it through one helper.
describe("a stored percentage, read back as a person typed it", () => {
  const db = (v: string) => new Prisma.Decimal(v);
  it.each([
    ["50.0000", "50"],
    ["100.0000", "100"],
    ["10.0000", "10"],
    ["12.5000", "12.5"],
    ["0.0500", "0.05"],
    ["70.0000", "70"],
  ])("%s → %s", (stored, shown) => {
    expect(firstReleaseShare(db(stored))).toBe(shown);
    expect(decimalText(db(stored))).toBe(shown);
    expect(decimalText(stored)).toBe(shown);
  });
  it("unset stays unset", () => {
    expect(firstReleaseShare(null)).toBeNull();
    expect(firstReleaseShare(undefined)).toBeNull();
  });
  it("a 50% first release of RM1,000.00 held releases RM500.00 (worked through the release rule)", () => {
    const r = releaseOf({ kind: "RELEASED_FIRST", held: { MAIN: parseSen("1000.00"), NSC: parseSen("200.00"), NS: 0n }, already: { first: false, balance: false }, firstReleasePct: firstReleaseShare(db("50.0000")), asBuiltHandedOver: true, makingGoodIssued: false, firstReleased: { MAIN: 0n, NSC: 0n, NS: 0n } });
    expect(r.faults).toEqual([]);
    expect(senToDecimalString(r.amounts!.MAIN)).toBe("500.00");
    expect(senToDecimalString(r.amounts!.NSC)).toBe("100.00");
    const all = releaseOf({ kind: "RELEASED_FIRST", held: { MAIN: parseSen("1000.00"), NSC: 0n, NS: 0n }, already: { first: false, balance: false }, firstReleasePct: firstReleaseShare(db("100.0000")), asBuiltHandedOver: true, makingGoodIssued: false, firstReleased: { MAIN: 0n, NSC: 0n, NS: 0n } });
    expect(senToDecimalString(all.amounts!.MAIN)).toBe("1000.00");
  });
  it("no screen or act strips zeros from the end of a Decimal's text (the pattern that read 50 as 5)", () => {
    const ROOT = path.join(__dirname, "../../..");
    for (const f of ["src/app/projects/[id]/payment-actions.ts", "src/app/projects/[id]/payment-panels.tsx", "src/app/configuration/post-award/page.tsx", "src/app/configuration/contracts/page.tsx", "src/app/configuration/awards/page.tsx"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).not.toMatch(/replace\(\/\\\.\?0\+\$\//);
    }
    expect(readFileSync(path.join(ROOT, "src/app/projects/[id]/payment-actions.ts"), "utf8")).toMatch(/firstReleaseShare\(policy\?\.firstReleasePct\)/);
    expect(readFileSync(path.join(ROOT, "src/app/projects/[id]/payment-panels.tsx"), "utf8")).toMatch(/firstReleaseShare\(v\.cfg\.policy\?\.firstReleasePct\)/);
  });
});
