import { describe, expect, it } from "vitest";

import { closeoutNext } from "./next";
import type { CloseoutFacts } from "./types";

/** Plan closeout-plan.md §3.2's rows for stages B, D and C, one per line (table-driven). */

const dlp = { applies: true as const, start: "2025-10-01", endExclusive: "2026-10-01" };
// Changed for stage D (flagged): the facts carry the performance report; stage B's rows read it filed, so each keeps its line, and stage D's rows follow.
// Changed for stage C (flagged, faithful): the facts carry the supply flag, the final certificate and the close's first refusal; the rows that
// read "Final account not raised" with no action now offer RAISE_FINAL_ACCOUNT, as §3.2's row says.
const base: CloseoutFacts = { status: "ACTIVE", cpc: null, schedule: null, cmgd: null, defects: { open: 0 }, retention: { balanceDue: false, event: { state: "NOT_SET" } }, securities: [], performance: "VERIFIED", supply: false, final: null, closeBlocked: null, today: "2026-10-20" };
const pc: CloseoutFacts = { ...base, status: "PRACTICALLY_COMPLETE", cpc: { id: "cpc", status: "ISSUED", dlp } };
const mgc: CloseoutFacts = { ...pc, status: "MAKING_GOOD_COMPLETE", cmgd: { id: "cmgd", status: "ISSUED" } };

const rows: [string, CloseoutFacts, string, string | null][] = [
  ["before possession", { ...base, status: "STAMPED" }, "Opens once the contract is in force", null],
  ["ACTIVE, no CPC", base, "Practical completion not certified", "RAISE_CPC"],
  ["CPC in draft", { ...base, cpc: { id: "cpc", status: "DRAFT", dlp } }, "Practical completion certificate in draft", "OPEN_CERTIFICATE"],
  ["CPC being signed", { ...base, cpc: { id: "cpc", status: "SIGNING", dlp } }, "Practical completion certificate being signed", "OPEN_CERTIFICATE"],
  ["PC, DLP running", { ...pc, today: "2026-09-30" }, "Defects liability period ends 30 Sep 2026", "ADD_DEFECT"],
  ["DLP ended, lines open, no schedule", { ...pc, defects: { open: 2 } }, "2 defects open at the end of the period", "RAISE_SCHEDULE"],
  ["DLP ended, schedule in draft", { ...pc, defects: { open: 1 }, schedule: { id: "sod", status: "DRAFT", rectifyBy: "2026-12-31" } }, "Schedule of Defects in draft", "OPEN_CERTIFICATE"],
  ["DLP ended, lines open, schedule issued", { ...pc, defects: { open: 1 }, schedule: { id: "sod", status: "ISSUED", rectifyBy: "2026-12-31" } }, "1 defect to make good by 31 Dec 2026", null],
  ["DLP ended, nothing open", pc, "Ready for the certificate of making good defects", "RAISE_CMGD"],
  ["CMGD being signed", { ...pc, cmgd: { id: "cmgd", status: "SIGNING" } }, "Certificate of making good defects being signed", "OPEN_CERTIFICATE"],
  ["MGC, retention balance due", { ...mgc, retention: { balanceDue: true, event: { state: "REACHED", event: "MAKING_GOOD" } } }, "Retention balance to release", "RELEASE_RETENTION"],
  ["MGC, balance with the final payment", { ...mgc, retention: { balanceDue: true, event: { state: "NOT_REACHED", event: "FINAL_PAYMENT", missing: "FINAL_PAYMENT" } } }, "Final account not raised", "RAISE_FINAL_ACCOUNT"],
  ["MGC, a security to return", { ...mgc, securities: [{ id: "s1", label: "Performance bond", returnable: true }] }, "Performance bond to return", "RETURN_SECURITY"],
  ["MGC, nothing due", { ...mgc, securities: [{ id: "s2", label: "Design guarantee bond", returnable: false }] }, "Final account not raised", "RAISE_FINAL_ACCOUNT"],
  ["PC with no DLP: straight to the releases and the final account", { ...base, status: "PRACTICALLY_COMPLETE", cpc: { id: "cpc", status: "ISSUED", dlp: { applies: false } } }, "Final account not raised", "RAISE_FINAL_ACCOUNT"],
  // Stage D (ruling 17): after the releases, the report is filed before the final account.
  ["MGC, no report", { ...mgc, performance: "NONE" }, "Contractor performance not filed", "SCORE_PERFORMANCE"],
  ["MGC, report being scored", { ...mgc, performance: "OPEN" }, "Contractor performance not filed", "SCORE_PERFORMANCE"],
  ["MGC, report assessed", { ...mgc, performance: "ASSESSED" }, "Contractor performance to verify", "SCORE_PERFORMANCE"],
  ["MGC, a security to return comes before the report", { ...mgc, performance: "NONE", securities: [{ id: "s1", label: "Performance bond", returnable: true }] }, "Performance bond to return", "RETURN_SECURITY"],
  ["PC with no DLP, no report", { ...base, status: "PRACTICALLY_COMPLETE", cpc: { id: "cpc", status: "ISSUED", dlp: { applies: false } }, performance: "NONE" }, "Contractor performance not filed", "SCORE_PERFORMANCE"],
  // Stage C: the final account, its payment and the close.
  ["final in draft, the pack missing", { ...mgc, final: { id: "fin", status: "DRAFT", paid: false, firstMissing: "The pack is missing: As-built drawings" } }, "The pack is missing: As-built drawings", "OPEN_FINAL_ACCOUNT"],
  ["final in draft, nothing missing", { ...mgc, final: { id: "fin", status: "DRAFT", paid: false, firstMissing: null } }, "Final account ready to send for approval", "OPEN_CERTIFICATE"],
  ["final being signed", { ...mgc, final: { id: "fin", status: "SIGNING", paid: false, firstMissing: null } }, "Final certificate being signed", "OPEN_CERTIFICATE"],
  ["FCI, not paid", { ...mgc, status: "FINAL_CERTIFICATE_ISSUED", final: { id: "fin", status: "ISSUED", paid: false, firstMissing: null } }, "Waiting for Finance's payment", "RECORD_FINAL_PAYMENT"],
  ["FCI paid, the bond now to return", { ...mgc, status: "FINAL_CERTIFICATE_ISSUED", final: { id: "fin", status: "ISSUED", paid: true, firstMissing: null }, securities: [{ id: "s1", label: "Performance bond", returnable: true }] }, "Performance bond to return", "RETURN_SECURITY"],
  ["FCI paid, a check still failing", { ...mgc, status: "FINAL_CERTIFICATE_ISSUED", final: { id: "fin", status: "ISSUED", paid: true, firstMissing: null }, closeBlocked: "Retention of RM 10.00 is still held." }, "Retention of RM 10.00 is still held.", null],
  ["every check passes", { ...mgc, status: "FINAL_CERTIFICATE_ISSUED", final: { id: "fin", status: "ISSUED", paid: true, firstMissing: null } }, "Ready to close", "CLOSE_CONTRACT"],
  ["a supply contract", { ...base, supply: true }, "Closing is not built for supply contracts", null],
  ["closed", { ...base, status: "CLOSED" }, "The contract is closed", null],
];

describe("closeoutNext", () => {
  for (const [name, f, next, action] of rows)
    it(name, () => {
      const r = closeoutNext(f);
      expect(r.next).toBe(next);
      expect(r.action).toBe(action);
    });
  it("names the certificate it opens, and is waiting until the first CPC, done once closed", () => {
    expect(closeoutNext({ ...base, cpc: { id: "cpc", status: "IN_ROUTING", dlp } }).certificateId).toBe("cpc");
    expect(closeoutNext(base).state).toBe("waiting");
    expect(closeoutNext(pc).state).toBe("in-progress");
    expect(closeoutNext({ ...base, status: "CLOSED" }).state).toBe("done");
  });
});
