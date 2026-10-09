import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUBMISSION_KIND_HINT, SUBMISSION_KIND_WORDS } from "./labels";

/**
 * Decisions log, 2026-10-09, ruling on 1924(K) (spec line 3278, Statutory Declarations Act 1960): what the contractor sends from the portal is its NOTICE that the statutory declaration is lodged. It is
 * not the declaration, which is attested on paper before a Commissioner for Oaths and recorded by an officer, and it never clears the block on final payment.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

describe("the portal's declaration is a notice", () => {
  it("is called a notice that the declaration is lodged, and says it is not the declaration", () => {
    expect(SUBMISSION_KIND_WORDS.STATUTORY_DECLARATION.en).toBe("Notice that the statutory declaration is lodged");
    expect(SUBMISSION_KIND_HINT.STATUTORY_DECLARATION.en).toMatch(/It is not the declaration/);
    expect(SUBMISSION_KIND_HINT.STATUTORY_DECLARATION.en).toMatch(/Commissioner for Oaths/);
    expect(SUBMISSION_KIND_HINT.STATUTORY_DECLARATION.en).toMatch(/only that lifts the block on final payment/);
  });

  it("no code reads a contractor's submission as the declaration that lifts the final-payment block", () => {
    const readers = walk(path.join(process.cwd(), "src"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return /declarationBlocking/.test(src) && /contractorSubmission|ContractorSubmission/.test(src);
      })
      .map((f) => path.relative(process.cwd(), f).split(path.sep).join("/"));
    expect(readers).toEqual([]);
  });
});
