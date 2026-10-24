import { describe, expect, it } from "vitest";

import { STAGED_FOR_AWARD_RETURN, STAGED_FOR_PROJECT_DOCUMENT } from "@/lib/documents/staged-for";

import {
  answerFaults,
  askFaults,
  LODGED_ONLINE,
  lodgeFaults,
  onlineReturnState,
  paperStarted,
  QUERY_MAX,
  QUERY_OPEN_MAX,
  refuseFaults,
  returnRecordFromOnline,
  scanTaken,
  stagedReturnFileFaults,
  verifyFaults,
  type OnlineReturnFacts,
  type OnlineReturnPage,
  type StagedReturnFile,
} from "./online-return";
import { awardReturnFaultText } from "./online-return-words";
import { EMPTY_RETURN } from "./stage-two";

const LOA: OnlineReturnFacts = { awardStatus: "ISSUED", instrument: "LETTER_OF_ACCEPTANCE", today: "2026-10-24", paperStarted: false, waiting: false, classSet: true, signingFault: null };
const INDENT: OnlineReturnFacts = { ...LOA, instrument: "WORK_INDENT" };
const LOA_SCANS = ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"];
const PAGE: OnlineReturnPage = { signatoryName: "Ahmad bin Ali", icNumber: "800101-01-1234", occupation: "Director", address: "1 Jalan Satu", capacity: "Director", witnessName: "Siti binti Omar", contractorSigned: true, stampAffixed: true, witnessSigned: true };
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("lodging a return online (ADR 0045 D1)", () => {
  it("takes a Letter of Acceptance's three scans, and an indent's page with its scan", () => {
    expect(lodgeFaults(LOA, { scans: LOA_SCANS, page: null })).toEqual([]);
    expect(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: PAGE })).toEqual([]);
  });

  it("refuses each organisation-side and award-side reason, every one named", () => {
    const f = lodgeFaults({ ...LOA, awardStatus: "ACCEPTED", waiting: true, paperStarted: true, classSet: false, today: null, signingFault: "SIGNER_NOT_AUTHORISED" }, { scans: LOA_SCANS, page: null });
    expect(codes(f)).toEqual(["NOT_ISSUED", "ALREADY_WAITING", "PAPER_STARTED", "CLASS_NOT_SET", "NO_ZONE", "NOT_SIGNING_AUTHORITY"]);
    expect(f.find((x) => x.code === "NOT_SIGNING_AUTHORITY")?.data).toEqual({ fault: "SIGNER_NOT_AUTHORISED" });
    // The signing refusal speaks in the portal's own words for the cause.
    expect(awardReturnFaultText(f.find((x) => x.code === "NOT_SIGNING_AUTHORITY")!)).toMatch(/do not sign for your company/);
  });

  it("asks for each scan the instrument takes, and no other", () => {
    expect(lodgeFaults(LOA, { scans: ["SIGNED_LETTER"], page: null })).toEqual([
      { code: "SCAN_MISSING", level: "block", data: { scan: "DECLARATION" } },
      { code: "SCAN_MISSING", level: "block", data: { scan: "AUTHORISATION" } },
    ]);
    expect(codes(lodgeFaults(LOA, { scans: [...LOA_SCANS, "ACCEPTANCE_PAGE"], page: null }))).toEqual(["SCAN_NOT_TAKEN"]);
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE", "SIGNED_LETTER"], page: PAGE }))).toEqual(["SCAN_NOT_TAKEN"]);
    expect(codes(lodgeFaults(INDENT, { scans: [], page: PAGE }))).toEqual(["SCAN_MISSING"]);
  });

  it("refuses page fields on a Letter of Acceptance (PAGE_NOT_TAKEN)", () => {
    expect(codes(lodgeFaults(LOA, { scans: LOA_SCANS, page: PAGE }))).toEqual(["PAGE_NOT_TAKEN"]);
  });

  it("reuses the paper's acceptance-page faults for an indent, without RECEIVED_ON (the day is the server's)", () => {
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: null }))).toEqual(["SIGNATORY_NAME", "IC_NUMBER", "OCCUPATION", "ADDRESS", "CAPACITY", "CONTRACTOR_SIGNATURE_NOT_RECORDED", "STAMP_NOT_RECORDED", "WITNESS_NAME", "WITNESS_SIGNATURE_NOT_RECORDED"]);
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, contractorSigned: false, stampAffixed: false, witnessSigned: false } }))).toEqual(["CONTRACTOR_NOT_SIGNED", "STAMP_NOT_AFFIXED", "WITNESS_NOT_SIGNED"]);
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, capacity: "  " } }))).toEqual(["CAPACITY"]);
  });

  it("refuses a malformed identity card number and an over-long field", () => {
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, icNumber: "12345" } }))).toEqual(["IC_FORMAT"]);
    expect(codes(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, icNumber: "800101011234" } }))).toEqual([]);
    const long = lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, address: "x".repeat(1001) } });
    expect(long).toEqual([{ code: "PAGE_FIELD_TOO_LONG", level: "block", data: { field: "address", max: 1000 } }]);
    expect(lodgeFaults(INDENT, { scans: ["ACCEPTANCE_PAGE"], page: { ...PAGE, address: "x".repeat(1000) } })).toEqual([]);
    expect(awardReturnFaultText(long[0]!)).toBe("The address is longer than 1000 characters.");
  });

  it("tells which scans an instrument takes", () => {
    expect(scanTaken("WORK_INDENT", "ACCEPTANCE_PAGE")).toBe(true);
    expect(scanTaken("WORK_INDENT", "SIGNED_LETTER")).toBe(false);
    expect(scanTaken("LETTER_OF_ACCEPTANCE", "AUTHORISATION")).toBe(true);
  });
});

describe("paper started (WV-4)", () => {
  it("is false on an empty return with no live scan, and true on any item, page field or live scan", () => {
    expect(paperStarted(null, 0)).toBe(false);
    expect(paperStarted(EMPTY_RETURN, 0)).toBe(false);
    expect(paperStarted(EMPTY_RETURN, 1)).toBe(true);
    expect(paperStarted({ ...EMPTY_RETURN, declarationReceivedOn: "2026-10-20" }, 0)).toBe(true);
    expect(paperStarted({ ...EMPTY_RETURN, witnessName: "Siti" }, 0)).toBe(true);
    expect(paperStarted({ ...EMPTY_RETURN, stampAffixed: false }, 0)).toBe(true);
    expect(paperStarted({ ...EMPTY_RETURN, signatoryName: "   " }, 0)).toBe(false);
  });
});

describe("deciding a lodged return", () => {
  it("verifies only while the award is issued and the return waits", () => {
    expect(verifyFaults({ awardStatus: "ISSUED", state: "WAITING" })).toEqual([]);
    expect(codes(verifyFaults({ awardStatus: "CANCELLED", state: "WAITING" }))).toEqual(["NOT_ISSUED"]);
    for (const state of ["NONE", "VERIFIED", "REFUSED"] as const) expect(codes(verifyFaults({ awardStatus: "ISSUED", state }))).toEqual(["NOT_WAITING"]);
  });

  it("refuses only a waiting return, with a reason of at most 2,000 characters", () => {
    expect(refuseFaults({ state: "WAITING", reason: "The declaration is not signed." })).toEqual([]);
    expect(codes(refuseFaults({ state: "WAITING", reason: "  " }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(refuseFaults({ state: "WAITING", reason: "x".repeat(2000) }))).toEqual([]);
    expect(codes(refuseFaults({ state: "WAITING", reason: "x".repeat(2001) }))).toEqual(["REASON_TOO_LONG"]);
    expect(codes(refuseFaults({ state: "REFUSED", reason: "Again" }))).toEqual(["NOT_WAITING"]);
  });

  it("reads the latest row lodged, whatever order the rows come in", () => {
    const at = (d: string) => new Date(`${d}T03:00:00Z`);
    expect(onlineReturnState([])).toBe("NONE");
    const refused = { submittedAt: at("2026-10-20"), verifiedAt: null, refusedAt: at("2026-10-21") };
    const waiting = { submittedAt: at("2026-10-22"), verifiedAt: null, refusedAt: null };
    expect(onlineReturnState([waiting, refused])).toBe("WAITING");
    expect(onlineReturnState([refused, waiting])).toBe("WAITING");
    expect(onlineReturnState([refused])).toBe("REFUSED");
    expect(onlineReturnState([refused, { ...waiting, verifiedAt: at("2026-10-24") }])).toBe("VERIFIED");
  });
});

describe("the return a verified row writes (WV-3, WV-16)", () => {
  const row = { submittedOn: "2026-10-20", ...PAGE };

  it("Worked example: a Letter of Acceptance lodged on 20 October and verified on 22 October counts as received on 20 October, for all three documents", () => {
    const rec = returnRecordFromOnline("LETTER_OF_ACCEPTANCE", { ...row, signatoryName: "", icNumber: "", occupation: "", address: "", capacity: "", witnessName: "", contractorSigned: null, stampAffixed: null, witnessSigned: null });
    expect(rec).toEqual({ ...EMPTY_RETURN, signedLetterReceivedOn: "2026-10-20", declarationReceivedOn: "2026-10-20", authorisationReceivedOn: "2026-10-20", whereHeld: "Lodged online" });
  });

  it("an indent's page is received on the day lodged, with its fields as typed", () => {
    const rec = returnRecordFromOnline("WORK_INDENT", row);
    expect(rec).toEqual({ ...EMPTY_RETURN, ...PAGE, signedLetterReceivedOn: "2026-10-20", whereHeld: LODGED_ONLINE });
    expect(rec.declarationReceivedOn).toBeNull();
    expect(rec.authorisationReceivedOn).toBeNull();
  });
});

describe("the staged scans a lodge pins", () => {
  const file = (o: Partial<StagedReturnFile> = {}): StagedReturnFile => ({ scan: "SIGNED_LETTER", versionId: "v1", known: true, stagedFor: STAGED_FOR_AWARD_RETURN, recordedByPersonId: null, recordedBySupplierAccountId: "acc", attachments: 0, withdrawn: false, documentClassId: "cls", ...o });

  it("takes a file staged for an award return by this account, unattached, live, in the class", () => {
    expect(stagedReturnFileFaults([file(), file({ scan: "DECLARATION", versionId: "v2" })], "acc", "cls")).toEqual([]);
  });

  it("refuses each other case, naming the scan", () => {
    expect(stagedReturnFileFaults([file({ stagedFor: STAGED_FOR_PROJECT_DOCUMENT })], "acc", "cls")).toEqual([{ code: "NOT_STAGED_FOR_RETURN", level: "block", data: { scan: "SIGNED_LETTER" } }]);
    expect(codes(stagedReturnFileFaults([file({ recordedBySupplierAccountId: "other" })], "acc", "cls"))).toEqual(["NOT_YOURS"]);
    expect(codes(stagedReturnFileFaults([file({ recordedByPersonId: "staff" })], "acc", "cls"))).toEqual(["NOT_YOURS"]);
    expect(codes(stagedReturnFileFaults([file({ attachments: 1 })], "acc", "cls"))).toEqual(["ALREADY_ATTACHED"]);
    expect(codes(stagedReturnFileFaults([file({ withdrawn: true })], "acc", "cls"))).toEqual(["WITHDRAWN"]);
    expect(codes(stagedReturnFileFaults([file({ documentClassId: "project" })], "acc", "cls"))).toEqual(["WRONG_CLASS"]);
    expect(codes(stagedReturnFileFaults([file(), file({ scan: "DECLARATION" })], "acc", "cls"))).toEqual(["DUPLICATE"]);
    expect(codes(stagedReturnFileFaults([file({ known: false })], "acc", "cls"))).toEqual(["FILE_UNKNOWN"]);
  });
});

describe("questions on an issued award (WV-7)", () => {
  it("are asked only while issued, 1 to 2,000 characters", () => {
    expect(askFaults({ awardStatus: "ISSUED", body: "When is the site handed over?", unanswered: 0 })).toEqual([]);
    expect(codes(askFaults({ awardStatus: "ACCEPTED", body: "Too late?", unanswered: 0 }))).toEqual(["NOT_ISSUED"]);
    expect(codes(askFaults({ awardStatus: "ISSUED", body: " ", unanswered: 0 }))).toEqual(["BODY_REQUIRED"]);
    expect(codes(askFaults({ awardStatus: "ISSUED", body: "x".repeat(QUERY_MAX), unanswered: 0 }))).toEqual([]);
    expect(codes(askFaults({ awardStatus: "ISSUED", body: "x".repeat(QUERY_MAX + 1), unanswered: 0 }))).toEqual(["BODY_TOO_LONG"]);
  });

  it("are refused while QUERY_OPEN_MAX of the award's questions wait for an answer (security review L2)", () => {
    expect(askFaults({ awardStatus: "ISSUED", body: "One more?", unanswered: QUERY_OPEN_MAX - 1 })).toEqual([]);
    const over = askFaults({ awardStatus: "ISSUED", body: "One more?", unanswered: QUERY_OPEN_MAX });
    expect(codes(over)).toEqual(["TOO_MANY_OPEN"]);
    expect(awardReturnFaultText(over[0]!)).toBe(`${QUERY_OPEN_MAX} questions are already waiting for an answer. Ask again once the office has answered.`);
  });

  it("are answered once, in any status: answering asks nothing of the award", () => {
    expect(answerFaults({ answeredAt: null, answer: "On 1 November." })).toEqual([]);
    expect(codes(answerFaults({ answeredAt: new Date(), answer: "Again" }))).toEqual(["ALREADY_ANSWERED"]);
    expect(codes(answerFaults({ answeredAt: null, answer: "" }))).toEqual(["ANSWER_REQUIRED"]);
    expect(codes(answerFaults({ answeredAt: null, answer: "x".repeat(QUERY_MAX + 1) }))).toEqual(["ANSWER_TOO_LONG"]);
  });
});
