import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { submitFaults } from "./appointment";
import { bidGateFindings, issueFaults, type BidGateFacts, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";

/**
 * 6.6 (X-9, flagged against accepted 6.11, new tests only): on an exercise published through 6.5,
 * the award is neither sent for approval nor issued while a late envelope waits for the
 * committee's decision on admission (OD-6), nor once the bids' validity has expired without an
 * extension or while it is not set (FR-BID-009). Facts not given — an exercise not published
 * through 6.5 — ask nothing, as before.
 */

const late: BidGateFacts = { lateFault: { code: "LATE_UNDECIDED", level: "block", data: { count: 1, committeeSet: "yes" } }, validityFault: null };
const expired: BidGateFacts = { lateFault: null, validityFault: { code: "BID_VALIDITY_EXPIRED", level: "block", data: { expiry: "2027-03-17" } } };
const clearBids: BidGateFacts = { lateFault: null, validityFault: null };

const clear: IssueInput = {
  status: "APPROVED",
  today: "2026-09-30",
  exerciseStatus: "DOCUMENTS_IN_PREPARATION",
  exercisePackKind: null,
  commitment: null,
  sourcingPermitted: true,
  instrument: { kind: "LETTER_OF_ACCEPTANCE" },
  valueFaults: [],
  dossierFaults: [],
  appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "A", outcome: "CARRIED" }] },
  signatory: { ok: true, roleCode: "FD", roleLabel: "Functional Director", ruleKey: "k", ruleLabel: "l", clause: "c", recommenders: [], delegable: false },
  indent: null,
  distribution: { rows: [{}] },
  documents: [{ kind: "LETTER_OF_ACCEPTANCE", state: "OK", templateName: "LoA", missing: [], unknown: [], unfilled: [] }],
  variant: null,
  terms: null,
  bond: { required: true, reason: "", basis: { state: "SET", amount: parseSen("1"), basis: "CONTRACT_PRICE" } },
  contractNumber: { source: "SERIES", seriesKey: "contract" },
  startDate: "2026-10-01",
  wc: { required: false, basis: null },
};
const issue = (bids: BidGateFacts | null | undefined) => issueFaults({ ...clear, bids }).map((f) => f.code);

describe("issuing an award on an exercise published through 6.5", () => {
  it("a late envelope undecided: LATE_UNDECIDED", () => expect(issue(late)).toEqual(["LATE_UNDECIDED"]));
  it("validity expired without an extension: BID_VALIDITY_EXPIRED", () => expect(issue(expired)).toEqual(["BID_VALIDITY_EXPIRED"]));
  it("both clear, or not published through 6.5: nothing more is asked", () => {
    expect(issue(clearBids)).toEqual([]);
    expect(issue(null)).toEqual([]);
    expect(issue(undefined)).toEqual([]);
  });
});

describe("sending it for approval", () => {
  const route = { ok: true as const, ruleKey: "k", ruleLabel: "l", clause: null, approverCode: "CEO", committeeCode: null, chain: [], warnings: [], source: "DAL" as const, overrideIssue: null, core: null } as unknown as Parameters<typeof submitFaults>[0]["route"];
  const sub = (bids: BidGateFacts | null) => submitFaults({ status: "DRAFT", today: "2026-10-01", exerciseStatus: "ADVERTISED", exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: false }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route, bids }).map((f) => f.code);
  it("refused while a late envelope waits or the validity is not set; clear otherwise", () => {
    expect(sub(late)).toEqual(["LATE_UNDECIDED"]);
    expect(sub({ lateFault: null, validityFault: { code: "VALIDITY_NOT_SET", level: "block" } })).toEqual(["VALIDITY_NOT_SET"]);
    expect(sub(clearBids)).toEqual([]);
    expect(sub(null)).toEqual([]);
  });
});

describe("the words", () => {
  it("each reads in the register's words, naming where to act", () => {
    expect(awardFindingText(late.lateFault!)).toMatch(/Bids received tab/);
    expect(awardFindingText(expired.validityFault!)).toMatch(/expired on 17 Mar 2027/);
    expect(awardFindingText({ code: "VALIDITY_NOT_SET", level: "block" })).toMatch(/not set on the window/);
    expect(awardFindingText({ code: "VALIDITY_NOT_JUDGED", level: "block", data: { why: "TIME_ZONE_UNSET" } })).toMatch(/time zone/);
    expect(bidGateFindings(null)).toEqual([]);
  });
});
