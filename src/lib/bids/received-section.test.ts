import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LATE_TABLED_TEXT } from "@/lib/committee/labels";

import { bidFindingText, RECEIVED_SECTION } from "./labels";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * 6.7 review S-2: since 6.7 (OD-8) the register is the Received section of the "Bids and opening" tab;
 * no tab is called "Bids received" any more. Nothing the app or the lib says may send a reader to it.
 */

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [toPosix(path)] : [];
  });
}

describe("no record label names a 'Bids received' tab either (6.7 re-review)", () => {
  it("History's labels for the window's answers name the Received section, in the action and the demo", () => {
    for (const p of [join(root, "src", "app", "sourcing", "[id]", "bids", "actions.ts"), join(root, "prisma", "demo-bids.ts")]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/Bids received ·/);
      expect(src, p).toMatch(/Bids and opening, Received · window answers/);
    }
  });
});

describe("the register is named as the Received section of Bids and opening (S-2)", () => {
  it("no source in src/app or src/lib names a 'Bids received tab'", () => {
    const hits = [...files(join(root, "src", "app")), ...files(join(root, "src", "lib")), ...files(join(root, "src", "components"))]
      .filter((p) => /Bids received tab/i.test(readFileSync(p, "utf8")))
      .map((p) => posixRelative(root, p));
    expect(hits).toEqual([]);
  });
  it("the late-admission hold, the validity holds, the committee's refusal name the section", () => {
    expect(RECEIVED_SECTION).toBe("the Received section of Bids and opening");
    expect(bidFindingText({ code: "LATE_UNDECIDED", level: "block", data: { count: 1, committeeSet: "yes" } })).toContain(`in ${RECEIVED_SECTION}`);
    expect(bidFindingText({ code: "VALIDITY_NOT_SET", level: "block" })).toContain(`in ${RECEIVED_SECTION}`);
    expect(bidFindingText({ code: "BID_VALIDITY_EXPIRED", level: "block", data: { expiry: "2027-03-17" } })).toContain(`in ${RECEIVED_SECTION}`);
    expect(LATE_TABLED_TEXT).toContain(RECEIVED_SECTION);
  });
  it("the withdrawal's confirmation names the section", () => {
    const src = readFileSync(join(root, "src", "app", "sourcing", "[id]", "bids", "actions.ts"), "utf8");
    expect(src).toContain("Attach the letter to it in the Received section of Bids and opening.");
  });
});
