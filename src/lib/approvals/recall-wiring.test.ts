import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FR-APR-017, held on the sending acts by a source scan (vitest has no database): the route a name or an award opens records who sent it, as an attributed act of
 * the signed-in officer's own, in the same transaction. Without that, nobody is shown to be the originator and the recall is refused.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const fn = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  const j = src.indexOf("\nexport async function ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};

describe.each([
  ["src/app/sourcing/actions.ts", "requestNameApproval"],
  ["src/app/awards/actions.ts", "submitAward"],
])("%s#%s records its sender", (file, name) => {
  const body = fn(read(file), name);
  it("begins the sender's attributed act as their own, never someone else's", () => {
    expect(body).toMatch(/beginAct\(actor, data, "ApprovalInstance\.submittedBy", \{ personField: "personId", onBehalf: false \}\)/);
  });
  it("writes the sender on the route it opens, and the attribution in that transaction", () => {
    expect(body).toMatch(/submittedByPersonId: act\.subjectPersonId/);
    expect(body).toMatch(/await act\.write\(tx, instance\.id\)/);
  });
});

describe("the recall acts ask the one rule", () => {
  it.each([
    ["src/app/requisitions/actions.ts", "recallRequisition"],
    ["src/app/sourcing/actions.ts", "recallNameApproval"],
    ["src/app/awards/actions.ts", "recallAward"],
  ])("%s#%s judges recallFault and tells the people the step was waiting on", (file, name) => {
    const body = fn(read(file), name);
    expect(body).toMatch(/recallFault\(/);
    expect(body).toMatch(/RECALL_FAULT_TEXT\[refused\]/);
    expect(body).toMatch(/noticeRecall\(tx, actor/);
    // Phase 3c review: the count of the committee's matters moved out of the three acts into `committeeStandingOf` (one place, awaiting and decided), which all three call.
    // The assertion that the committee's matters are counted is unchanged; it now reads the shared function, and the function counts both.
    expect(body).toMatch(/committeeStandingOf\(tx, /);
    expect(body).toMatch(/committeeDecided: standing\.decided/);
  });

  it("committeeStandingOf counts the matters awaiting a vote and the matters decided since the route opened", () => {
    const store = read("src/lib/approvals/recall-store.ts");
    const body = store.slice(store.indexOf("export async function committeeStandingOf"), store.indexOf("export async function noticeRecall"));
    expect((body.match(/committeeDecision\.count/g) ?? []).length).toBe(2);
    expect(body).toMatch(/outcome: "PENDING"/);
    expect(body).toMatch(/outcome: \{ in: \["CARRIED", "NOT_CARRIED"\] \}/);
    expect(body).toMatch(/withdrawnAt: null/);
  });
});
