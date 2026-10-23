import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two records of contractor submissions (plan §12 risk; PW-11): until the earlier rows stop mattering, every reader that counts or lists what a contractor sent reads BOTH the
 * Project workspace's documents and the earlier `ContractorSubmission` rows. This scan lists every file outside the tests that reads the earlier table, each with why, and holds
 * the counters and lists that must read both to the reader that reads the documents beside it. A new reader of the earlier table fails here until it is listed with its reason.
 */

const ROOT = path.join(process.cwd(), "src");
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated" || name === "test-db" || name === "test-support") continue;
      out.push(...files(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$|\.fixture\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/// Every reader of the earlier table, and why it may read it. "BOTH" means it reads the documents too, as held below.
const READERS: Readonly<Record<string, string>> = {
  "src/app/documents/review-actions.ts": "The answer to an unanswered earlier record (PW-11: it stays answerable through its own act). It acts on one row, and lists nothing.",
  "src/lib/portal/projects/review-store.ts": "BOTH in `reviewCounts` (its waiting is `documentsWaitingCount`); the earlier queue (`loadReviewQueue`) pages the earlier rows alone, for the old panel the screen step folds into the one list.",
  "src/lib/portal/projects/workspace-store.ts": "BOTH in the overview's counts (`contractorDocumentTally`) and the Payments tab's claims (`contractorClaimDocuments`); `submissionsTab` is the earlier list the screen step folds into the one list.",
  "src/lib/project-docs/earlier-read.ts": "The earlier source of the merged lists (`register.ts`, `portal-read.ts`, `waiting-read.ts`), read-only.",
  "src/lib/project-docs/waiting-read.ts": "BOTH: the count's earlier half beside the documents waiting on the organisation (`documentsWaitingCount`).",
};

describe("every reader of the earlier contractor submissions is known, and the counters read both sources (PW-11)", () => {
  const found = files(ROOT)
    .filter((f) => /\.contractorSubmission\./.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join("/"))
    .sort();

  it("the readers are exactly the ones listed, each with its reason", () => {
    expect(found).toEqual(Object.keys(READERS).sort());
    for (const [f, why] of Object.entries(READERS)) expect(why.length, f).toBeGreaterThan(40);
  });

  it("the counters and lists that must read both do: reviewCounts, the overview, the claims, the Contracts list's button, and the merged lists", () => {
    const review = read("src/lib/portal/projects/review-store.ts");
    const counts = review.slice(review.indexOf("export async function reviewCounts"), review.indexOf("export interface ReviewQueue"));
    expect(counts).toContain("documentsWaitingCount(");
    const workspace = read("src/lib/portal/projects/workspace-store.ts");
    const overview = workspace.slice(workspace.indexOf("export async function overviewTab"), workspace.indexOf("export async function programmeTab"));
    expect(overview).toContain("contractorDocumentTally(");
    const payments = workspace.slice(workspace.indexOf("export async function paymentsTab"), workspace.indexOf("function figureOf"));
    expect(payments).toContain("contractorClaimDocuments(");
    const projects = read("src/app/projects/page.tsx");
    expect(projects).toContain("documentsWaitingCount(");
    expect(projects).not.toMatch(/contractorSubmission/);
    for (const f of ["src/lib/project-docs/register.ts", "src/lib/project-docs/portal-read.ts", "src/lib/project-docs/waiting-read.ts"]) {
      const src = read(f);
      expect(src, f).toContain("walkMerged(");
      expect(src, f).toContain("earlierLoader(");
    }
  });
});
