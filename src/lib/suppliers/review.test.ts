import { describe, expect, it } from "vitest";

import { approveFaults, decisionFaults, isOpen, lapseFaults, lapseState, openApplicationFaults, submitFaults, type FileFacts } from "./review";

const file: FileFacts = {
  status: "RECEIVED",
  lapsedRecordedAt: null,
  resubmitBy: null,
  routePending: false,
  declarationSignedOn: "2026-09-29",
  declarationScanned: true,
  mandatory: [
    { label: "Companies registry certificate", state: "VALID" },
    { label: "Works board certificate", state: "VALID" },
  ],
  mandatoryNotSet: [],
  typesConfigured: 4,
};
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("approving a file (FR-VND-007)", () => {
  it("a complete file with every mandatory document standing can be approved", () => {
    expect(approveFaults(file, "2026-10-01")).toEqual([]);
  });

  it("a mandatory document not checked, not in order, expired or missing is refused by name", () => {
    for (const state of ["NOT_CHECKED", "NOT_IN_ORDER", "EXPIRED", "MISSING", "NOT_YET_VALID"] as const) {
      const fs = approveFaults({ ...file, mandatory: [{ label: "Works board certificate", state }] }, "2026-10-01");
      expect(fs).toEqual([{ code: "DOCUMENT_NOT_STANDING", level: "block", data: { type: "Works board certificate", state } }]);
    }
  });

  it("not applicable stands", () => {
    expect(approveFaults({ ...file, mandatory: [{ label: "X", state: "NOT_APPLICABLE" }] }, "2026-10-01")).toEqual([]);
  });

  it("needs the declaration's day and its scan", () => {
    expect(codes(approveFaults({ ...file, declarationSignedOn: null, declarationScanned: false }, "2026-10-01"))).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
  });

  it("an unset mandatory switch, or no types at all, blocks naming the setting", () => {
    expect(codes(approveFaults({ ...file, mandatoryNotSet: ["Tax clearance letter"] }, "2026-10-01"))).toEqual(["MANDATORY_NOT_SET"]);
    expect(codes(approveFaults({ ...file, typesConfigured: 0, mandatory: [] }, "2026-10-01"))).toEqual(["TYPES_NOT_SET"]);
  });

  it("a decided application refuses a second decision", () => {
    expect(codes(approveFaults({ ...file, status: "APPROVED" }, "2026-10-01"))).toEqual(["DECIDED"]);
    expect(codes(approveFaults({ ...file, status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: new Date() }, "2026-10-01"))).toEqual(["DECIDED"]);
  });

  it("sending it for decision while a route is open is refused", () => {
    expect(codes(submitFaults({ ...file, routePending: true }, "2026-10-01"))).toEqual(["ROUTE_PENDING"]);
  });

  it("no day without a time zone", () => {
    expect(codes(approveFaults(file, null))).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("the resubmission deadline (derived, no scheduler)", () => {
  const asked = { status: "RESUBMISSION_REQUESTED" as const, resubmitBy: "2026-10-20" };

  it("worked example: deadline 2026-10-20 is still open on the 20th and LAPSED on the 21st (organisation's day)", () => {
    expect(lapseState(asked, "2026-10-19")).toBe("OPEN");
    expect(lapseState(asked, "2026-10-20")).toBe("OPEN");
    expect(lapseState(asked, "2026-10-21")).toBe("LAPSED");
  });

  it("no deadline unless resubmission was requested", () => {
    expect(lapseState({ status: "RECEIVED", resubmitBy: "2026-10-20" }, "2026-12-01")).toBe("NO_DEADLINE");
  });

  it("a lapsed file cannot be approved; the lapse is recorded once, only once lapsed", () => {
    const f = { ...file, ...asked };
    expect(codes(approveFaults(f, "2026-10-21"))).toEqual(["LAPSED"]);
    expect(codes(lapseFaults(f, "2026-10-20"))).toEqual(["NOT_LAPSED"]);
    expect(lapseFaults(f, "2026-10-21")).toEqual([]);
    expect(codes(lapseFaults({ ...f, lapsedRecordedAt: new Date() }, "2026-10-21"))).toEqual(["DECIDED"]);
  });

  it("an open application is received or awaiting resubmission, with no lapse recorded", () => {
    expect(isOpen({ status: "RECEIVED", lapsedRecordedAt: null })).toBe(true);
    expect(isOpen({ status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null })).toBe(true);
    expect(isOpen({ status: "REJECTED", lapsedRecordedAt: null })).toBe(false);
  });
});

describe("an officer's outcome (FR-VND-007)", () => {
  const ctx = { today: "2026-10-01", documentIds: ["d1", "d2"], typeIds: ["t_clearance"] };
  const resubmit = { outcome: "RESUBMIT" as const, remarks: "", resubmitBy: "2026-10-20", items: [{ documentId: "d1", typeId: null, remarks: "Certificate copy illegible; send a certified copy." }], personActive: true };

  it("resubmission needs at least one item, each with remarks, and a deadline after today", () => {
    expect(decisionFaults(resubmit, file, ctx)).toEqual([]);
    expect(codes(decisionFaults({ ...resubmit, items: [] }, file, ctx))).toEqual(["ITEMS_REQUIRED"]);
    expect(codes(decisionFaults({ ...resubmit, items: [{ documentId: "d2", typeId: null, remarks: " " }] }, file, ctx))).toEqual(["ITEM_REMARKS_REQUIRED"]);
    expect(codes(decisionFaults({ ...resubmit, resubmitBy: "2026-10-01" }, file, ctx))).toEqual(["DEADLINE_NOT_AFTER_TODAY"]);
    expect(codes(decisionFaults({ ...resubmit, resubmitBy: null }, file, ctx))).toEqual(["DEADLINE_REQUIRED"]);
  });

  it("an item may name a configured type not lodged yet, never a document not on file, and never nothing", () => {
    expect(decisionFaults({ ...resubmit, items: [{ documentId: null, typeId: "t_clearance", remarks: "Lodge the tax clearance letter." }] }, file, ctx)).toEqual([]);
    expect(codes(decisionFaults({ ...resubmit, items: [{ documentId: "zz", typeId: null, remarks: "x" }] }, file, ctx))).toEqual(["ITEM_NOT_ON_FILE"]);
    expect(codes(decisionFaults({ ...resubmit, items: [{ documentId: null, typeId: null, remarks: "x" }] }, file, ctx))).toEqual(["ITEM_NAMES_NOTHING"]);
    expect(codes(decisionFaults({ ...resubmit, items: [{ documentId: null, typeId: "t_other", remarks: "x" }] }, file, ctx))).toEqual(["ITEM_NAMES_NOTHING"]);
  });

  it("rejection needs its remarks", () => {
    expect(codes(decisionFaults({ ...resubmit, outcome: "REJECT", items: [] }, file, ctx))).toEqual(["REMARKS_REQUIRED"]);
    expect(decisionFaults({ ...resubmit, outcome: "REJECT", remarks: "Not a works contractor.", items: [] }, file, ctx)).toEqual([]);
  });

  it("approval and lapse are not recorded here", () => {
    expect(codes(decisionFaults({ ...resubmit, outcome: "APPROVE" }, file, ctx))).toEqual(["OUTCOME_NOT_RECORDED_HERE"]);
    expect(codes(decisionFaults({ ...resubmit, outcome: "LAPSE" }, file, ctx))).toEqual(["OUTCOME_NOT_RECORDED_HERE"]);
  });

  it("not while a route is open, nor on a lapsed request, nor twice", () => {
    expect(codes(decisionFaults(resubmit, { ...file, routePending: true }, ctx))).toEqual(["ROUTE_PENDING"]);
    expect(codes(decisionFaults({ ...resubmit, resubmitBy: "2026-10-30" }, { ...file, status: "RESUBMISSION_REQUESTED", resubmitBy: "2026-09-30" }, ctx))).toEqual(["LAPSE_UNRECORDED"]);
    expect(codes(decisionFaults(resubmit, { ...file, status: "REJECTED" }, ctx))).toEqual(["DECIDED"]);
  });

  it("names the officer recording it", () => {
    expect(codes(decisionFaults({ ...resubmit, personActive: false }, file, ctx))).toEqual(["PERSON_REQUIRED"]);
  });
});

describe("opening a further application", () => {
  it("one at a time; a first registration only while not registered, a renewal or upgrade only once registered", () => {
    expect(openApplicationFaults("RENEWAL", "REGISTERED", false)).toEqual([]);
    expect(openApplicationFaults("NEW", "REJECTED", false)).toEqual([]);
    expect(codes(openApplicationFaults("NEW", "REGISTERED", false))).toEqual(["KIND_NOT_FOR_STATUS"]);
    expect(codes(openApplicationFaults("UPGRADE", "APPLICANT", false))).toEqual(["KIND_NOT_FOR_STATUS"]);
    expect(codes(openApplicationFaults("RENEWAL", "REGISTERED", true))).toEqual(["ALREADY_OPEN"]);
    expect(codes(openApplicationFaults(null, "REGISTERED", false))).toEqual(["KIND_REQUIRED"]);
  });
});

describe("the file as approval reads it", () => {
  it("each live mandatory type with its state; unset switches named; retired types neither asked nor required", async () => {
    const { fileFacts } = await import("./review");
    const { TYPES, doc } = await import("./fixture");
    const types = [TYPES.companies, TYPES.works, TYPES.clearance, { ...TYPES.supply, mandatoryAtRegistration: true, retiredOn: "2026-09-01" }];
    const f = fileFacts({ status: "RECEIVED", lapsedRecordedAt: null, resubmitBy: null, routePending: false, declarationSignedOn: "2026-09-29", declarationScanned: true }, types, [doc({ id: "c", typeId: "t_companies" })], "2026-10-01");
    expect(f.mandatory).toEqual([
      { label: "Companies registry certificate", state: "VALID" },
      { label: "Works board certificate", state: "MISSING" },
    ]);
    expect(f.mandatoryNotSet).toEqual(["Tax clearance letter"]);
    expect(f.typesConfigured).toBe(3);
  });
});

describe("an application's place in the queue (derived)", () => {
  it("reads with approval while a route is open, lapsed the day after its deadline, and the recorded outcomes as they are", async () => {
    const { queueState } = await import("./review");
    const base = { status: "RECEIVED" as const, resubmitBy: null, lapsedRecordedAt: null, routes: [] as { status: string }[] };
    expect(queueState(base, "2026-10-01")).toBe("RECEIVED");
    expect(queueState({ ...base, routes: [{ status: "REJECTED" }, { status: "PENDING" }] }, "2026-10-01")).toBe("WITH_APPROVAL");
    const asked = { ...base, status: "RESUBMISSION_REQUESTED" as const, resubmitBy: "2026-10-20" };
    expect(queueState(asked, "2026-10-20")).toBe("RESUBMISSION_REQUESTED");
    expect(queueState(asked, "2026-10-21")).toBe("LAPSED");
    expect(queueState(asked, null)).toBe("RESUBMISSION_REQUESTED");
    expect(queueState({ ...asked, status: "REJECTED", lapsedRecordedAt: new Date() }, "2026-10-21")).toBe("REJECTED_ON_LAPSE");
    expect(queueState({ ...base, status: "APPROVED" }, "2026-10-21")).toBe("APPROVED");
  });
});
