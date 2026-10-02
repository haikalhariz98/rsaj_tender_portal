import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pendingSentences, pendingText } from "./labels";
import type { Finding } from "./types";

/**
 * 6.8 re-review 8: "Not judged yet" reads once. The items one bid lacks are gathered into one
 * sentence; every other reason is said once, starting with a capital.
 */

const aspect = (no: number, a: string): Finding => ({ code: "ASPECT_UNASSESSED", level: "block", data: { listingNo: no, aspect: a } });
const score = (no: number, c: string): Finding => ({ code: "SCORE_MISSING", level: "block", data: { listingNo: no, criterion: c } });

describe("the pending reasons, gathered (re-review 8)", () => {
  it("four aspects not assessed: one sentence", () => {
    const fs = ["Completeness of the bid", "Price against the company estimate", "Completion period offered", "Capability to carry out the works"].map((a) => aspect(1, a));
    expect(`Not judged yet: ${pendingText(fs)}`).toBe("Not judged yet: No. 1 is not assessed on Completeness of the bid, Price against the company estimate, Completion period offered and Capability to carry out the works.");
  });
  it("scores missing: one sentence; one item reads alone", () => {
    expect(pendingText([score(2, "Method"), score(2, "Staff")])).toBe("No. 2 has no score on Method and Staff.");
    expect(pendingText([score(2, "Method")])).toBe("No. 2 has no score on Method.");
  });
  it("other reasons once each, with a capital, in the order found", () => {
    const fs: Finding[] = [{ code: "BALANCES_NOT_ENTERED", level: "block", data: { listingNo: 2 } }, { code: "ESTIMATE_SEALED", level: "block" }, { code: "ESTIMATE_SEALED", level: "block" }, score(2, "Method")];
    expect(pendingSentences(fs)).toEqual(["Bid No. 2's three monthly balances are not all entered.", "The company estimate is still sealed, so nothing is computed against it.", "No. 2 has no score on Method."]);
  });
  it("two bids are two sentences", () => {
    expect(pendingSentences([aspect(1, "A"), aspect(2, "A"), aspect(1, "B")])).toEqual(["No. 1 is not assessed on A and B.", "No. 2 is not assessed on A."]);
  });
  it("the stage rows and the submit block both read through it (source scan)", () => {
    const read = readFileSync(join(process.cwd(), "src/lib/evaluation/read.ts"), "utf8");
    expect(read).toMatch(/const notYet = live && live\.pending\.length \? pendingText\(live\.pending\) : null;/);
    expect(read).toMatch(/pendingSentences\(blocking\(r\.faults\)\)/);
  });
});
