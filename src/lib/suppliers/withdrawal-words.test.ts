import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { judgedWhileCancelled, notRevisitedWords, openingJudgedOf, type OpeningJudged } from "./cancellation";

/**
 * 6.13 Part B Run 0 fix round, S-2 and S-4: withdrawing a registration cancelled recorded in error.
 * - S-2: the audit recorded `standing: null` after; the act now re-reads the standing in its transaction after the update
 *   and records the real after value, leaving the field out where the standing did not change.
 * - S-4: the success message and the drawer say, in English and Malay, that judgments made while the record stood are not
 *   revisited, and name the bid openings that judged the supplier cancelled since the day it took effect (each keeps its
 *   frozen finding; a bid rejected at the opening stays rejected). A sale refused for it left no record, so none is listed.
 *
 * Worked example: cancelled from 1 Oct 2026; the bid No. 3 opened on 2 Oct 2026 on DEMO/T/0007/2026 was judged
 * "registration cancelled" and rejected at the opening; one opened on 30 Sep (before) judged it active; another supplier's
 * blacklisting is not a cancellation. Withdrawn on 4 Oct, the words name only DEMO/T/0007/2026's bid No. 3.
 */

const finding = (judgedOn: string, standing: string) => ({ judgedOn, supplierId: "s", supplierReference: "DEMO/SUP/0001/2026", standing, verdict: standing === "ACTIVE" ? "ELIGIBLE" : "NOT_ELIGIBLE", rows: [] });

describe("the openings judged while the cancellation stood (S-4)", () => {
  const openings: OpeningJudged[] = [
    openingJudgedOf("DEMO/T/0007/2026", { listingNo: 3, eligibilityFinding: finding("2026-10-02", "CANCELLED"), verdict: "REJECT" })!,
    openingJudgedOf("DEMO/T/0006/2026", { listingNo: 1, eligibilityFinding: finding("2026-09-30", "ACTIVE"), verdict: "PASS" })!,
    openingJudgedOf("DEMO/T/0008/2026", { listingNo: 2, eligibilityFinding: finding("2026-10-03", "BLACKLISTED"), verdict: null })!,
  ];
  it("an opened bid's frozen finding is read; one with none (not linked when opened) is skipped", () => {
    expect(openings[0]).toEqual({ exercise: "DEMO/T/0007/2026", listingNo: 3, judgedOn: "2026-10-02", standing: "CANCELLED", rejected: true });
    expect(openingJudgedOf("X", { listingNo: 1, eligibilityFinding: null, verdict: null })).toBeNull();
  });
  it("only CANCELLED findings on or after the day it took effect, in order (the boundary day counts)", () => {
    expect(judgedWhileCancelled(openings, "2026-10-01").map((o) => o.exercise)).toEqual(["DEMO/T/0007/2026"]);
    expect(judgedWhileCancelled(openings, "2026-10-02").map((o) => o.exercise)).toEqual(["DEMO/T/0007/2026"]);
    expect(judgedWhileCancelled(openings, "2026-10-03")).toEqual([]);
    const two = [...openings, { ...openings[0], exercise: "DEMO/T/0005/2026", judgedOn: "2026-10-02", listingNo: 9 }];
    expect(judgedWhileCancelled(two, "2026-10-01").map((o) => `${o.exercise} ${o.listingNo}`)).toEqual(["DEMO/T/0005/2026 9", "DEMO/T/0007/2026 3"]);
  });
  it("the words name each, in English and Malay, and say refused sales left no record", () => {
    expect(notRevisitedWords(judgedWhileCancelled(openings, "2026-10-01"))).toEqual({
      en: "Judgments made while it stood are not revisited. The openings that judged the supplier cancelled keep their findings: DEMO/T/0007/2026 (bid No. 3, opened 02 Oct 2026, rejected at the opening). A sale refused for it left no record, so none is listed.",
      ms: "Penilaian yang dibuat semasa ia berkuat kuasa tidak disemak semula. Pembukaan yang menilai pembekal sebagai dibatalkan mengekalkan penemuannya: DEMO/T/0007/2026 (tawaran No. 3, dibuka 02 Oct 2026, ditolak semasa pembukaan). Jualan yang ditolak kerananya tidak meninggalkan rekod, jadi tiada yang disenaraikan.",
    });
  });
  it("with none, they still say judgments are not revisited", () => {
    expect(notRevisitedWords([])).toEqual({
      en: "Judgments made while it stood are not revisited: no bid opening judged the supplier cancelled. A sale refused for it left no record, so none is listed.",
      ms: "Penilaian yang dibuat semasa ia berkuat kuasa tidak disemak semula: tiada pembukaan tawaran yang menilai pembekal sebagai dibatalkan. Jualan yang ditolak kerananya tidak meninggalkan rekod, jadi tiada yang disenaraikan.",
    });
  });
});

describe("the withdrawal act and drawer (source)", () => {
  const acts = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");
  const body = acts.slice(acts.indexOf("export async function withdrawRegistrationCancelled"));
  it("S-2: the standing is re-read in the transaction after the update, and the audit records it, or leaves it out unchanged", () => {
    expect(body.indexOf("const after = (await lockedStanding(tx, l)).reading;")).toBeGreaterThan(body.indexOf("if (moved.count !== 1) throw new Refusal(CHANGED);"));
    expect(body).toMatch(/\.\.\.\(was !== standingAfter \? \{ standing: was \} : \{\}\)/);
    expect(body).toMatch(/\.\.\.\(was !== standingAfter \? \{ standing: standingAfter \} : \{\}\)/);
    expect(body).not.toMatch(/standing: null/);
  });
  it("S-4: the message and the audit carry the not-revisited words; the drawer is given them by the panel", () => {
    expect(body).toMatch(/notRevisited: notRevisited\.en/);
    expect(body).toMatch(/\$\{notRevisited\.en\}` \};/);
    const panel = readFileSync("src/app/suppliers/[id]/standing-panels.tsx", "utf8");
    expect(panel).toMatch(/<WithdrawCancellationDrawer eventId=\{e\.id\} people=\{people\} notRevisited=\{notRevisitedWords\(judgedWhileCancelled\(openings, storedDay\(e\.effectiveOn\)\)\)\.en\} \/>/);
    const drawer = readFileSync("src/app/suppliers/[id]/standing-editors.tsx", "utf8");
    expect(drawer).toMatch(/\$\{notRevisited\} A cancellation that stood is not withdrawn: the supplier registers again, by a new application/);
  });
});
