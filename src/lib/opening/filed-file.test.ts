import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FILED_FILE_WORDS, filedFileFaults, type MoveFailure } from "./filed-file";
import { openingFindingText } from "./labels";

/**
 * The cell download after finalising goes through the filed document (20cl; wave 3c plan §3.2, §4.2). Pure.
 * Worked example: Aminah, a named officer, asks for bid 2's Form of Tender after the opening is finalised. She is not an administrator, the opening is
 * finalised, the file is bid 2's at this opening, and the frozen rules mark the Form of Tender as opened at the opening: no fault, so the route files it
 * and hands her to the document version. The same request before finalising is refused with words saying only the named officers open it from the opening.
 */

const ok = { administrator: false, finalised: true, fileOnOpening: true, checked: true };
const codes = (over: Partial<typeof ok>) => filedFileFaults({ ...ok, ...over }).map((f) => f.code);

describe("filedFileFaults", () => {
  it("the worked example: a finalised opening's opening-check file, asked for by staff who are not administrators, has no fault", () => {
    expect(filedFileFaults(ok)).toEqual([]);
  });
  it("each condition refuses on its own", () => {
    expect(codes({ administrator: true })).toEqual(["ADMINISTRATOR"]);
    expect(codes({ finalised: false })).toEqual(["NOT_FINALISED"]);
    expect(codes({ fileOnOpening: false })).toEqual(["NOT_ON_THIS_OPENING"]);
    expect(codes({ checked: false })).toEqual(["NOT_AN_OPENING_CHECK_FILE"]);
  });
  it("faults accumulate in a fixed order, each a block", () => {
    const fs = filedFileFaults({ administrator: true, finalised: false, fileOnOpening: false, checked: false });
    expect(fs.map((f) => f.code)).toEqual(["ADMINISTRATOR", "NOT_FINALISED", "NOT_ON_THIS_OPENING", "NOT_AN_OPENING_CHECK_FILE"]);
    expect(fs.every((f) => f.level === "block")).toBe(true);
  });
  it("property: there is no fault exactly when every condition holds", () => {
    for (const administrator of [false, true]) for (const finalised of [false, true]) for (const fileOnOpening of [false, true]) for (const checked of [false, true])
      expect(filedFileFaults({ administrator, finalised, fileOnOpening, checked }).length === 0).toBe(!administrator && finalised && fileOnOpening && checked);
  });
});

describe("FILED_FILE_WORDS: a sentence per refusal and per failure of the move", () => {
  const moverCodes: MoveFailure[] = ["FILE_NOT_FOUND", "CLASS_NOT_SET", "CLASS_NOT_SULIT", "ORGANISATION_NOT_FOUND", "STORE_NOT_BUILT", "BYTES_MISSING", "DIGEST_MISMATCH", "FILE_UNREADABLE", "REFUSED"];
  it("every FAILED code the mover returns has words: the codes in the mover's source are all keys here", () => {
    const mover = readFileSync(join(process.cwd(), "src/lib/sealing/online-file-mover.ts"), "utf8");
    const returned = new Set([...mover.matchAll(/status: "FAILED", code: "([A-Z_]+)"/g)].map((m) => m[1]));
    expect(returned.size).toBeGreaterThan(5);
    for (const c of returned) expect(Object.keys(FILED_FILE_WORDS)).toContain(c);
    for (const c of moverCodes) expect(FILED_FILE_WORDS[c]).toBeTruthy();
  });
  it("no sentence is a code, and each is a sentence", () => {
    for (const w of Object.values(FILED_FILE_WORDS)) {
      expect(w).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
      expect(w).toMatch(/^[A-Z].{20,}\.$/);
    }
  });
  it("CLASS_NOT_SET points where the finalise refusal points (Configuration › Documents, in the upload rules)", () => {
    expect(FILED_FILE_WORDS.CLASS_NOT_SET).toContain("Configuration › Documents, in the upload rules");
    expect(openingFindingText({ code: "ONLINE_FILE_CLASS_NOT_SET", level: "block" })).toContain("Configuration › Documents, in the upload rules");
  });
  it("the opening's words read the two new refusal codes from here", () => {
    expect(openingFindingText({ code: "NOT_ON_THIS_OPENING", level: "block" })).toBe(FILED_FILE_WORDS.NOT_ON_THIS_OPENING);
    expect(openingFindingText({ code: "NOT_AN_OPENING_CHECK_FILE", level: "block" })).toBe(FILED_FILE_WORDS.NOT_AN_OPENING_CHECK_FILE);
  });
});
