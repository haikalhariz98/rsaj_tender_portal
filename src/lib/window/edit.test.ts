import { describe, expect, it } from "vitest";

import { invitedSaleFault, publicationFault, windowChangeRejectionSnapshot, windowEditFault } from "./edit";

/// When the window's parts may be written: prepared until published, then frozen (plan §4).

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("preparing the window", () => {
  it("from preparation to approval for tendering, on an exercise with tender documents", () => {
    for (const s of ["DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) expect(windowEditFault(s, "TENDER")).toBeNull();
    expect(windowEditFault("APPROVED_FOR_TENDERING", "QUOTATION")).toBeNull();
  });
  it("not in draft, not once published, not once cancelled, not without tender documents", () => {
    expect(windowEditFault("DRAFT", "TENDER")?.code).toBe("NOT_IN_PREPARATION");
    expect(windowEditFault("ADVERTISED", "TENDER")?.code).toBe("WINDOW_PUBLISHED");
    expect(windowEditFault("INVITED", "QUOTATION")?.code).toBe("WINDOW_PUBLISHED");
    expect(windowEditFault("CANCELLED", "TENDER")?.code).toBe("EXERCISE_CANCELLED");
    expect(windowEditFault("APPROVED_FOR_TENDERING", "NONE")?.code).toBe("NO_TENDER_DOCUMENTS");
    expect(windowEditFault("APPROVED_FOR_TENDERING", null)?.code).toBe("NO_TENDER_DOCUMENTS");
  });
});

describe("recording a publication", () => {
  const ok = { status: "APPROVED_FOR_TENDERING" as const, path: "ADVERTISED" as const, channel: { retiredOn: null }, alreadyRecorded: false, publishedOn: "2026-11-03", approvedOn: "2026-10-30", today: "2026-11-03", personActive: true };
  it("on an approved, advertised, unpublished window", () => expect(publicationFault(ok)).toEqual([]));
  it("each refusal", () => {
    expect(codes(publicationFault({ ...ok, status: "ADVERTISED" }))).toEqual(["WINDOW_PUBLISHED"]);
    expect(codes(publicationFault({ ...ok, status: "DOCUMENTS_IN_PREPARATION" }))).toEqual(["NOT_APPROVED_FOR_TENDERING"]);
    expect(codes(publicationFault({ ...ok, path: "INVITED" }))).toEqual(["PUBLIC_CHANNEL_ON_INVITED"]);
    expect(codes(publicationFault({ ...ok, channel: { retiredOn: "2026-11-01" } }))).toEqual(["CHANNEL_RETIRED"]);
    expect(codes(publicationFault({ ...ok, alreadyRecorded: true }))).toEqual(["CHANNEL_ALREADY_RECORDED"]);
    expect(codes(publicationFault({ ...ok, publishedOn: "2026-11-04" }))).toEqual(["PUBLICATION_IN_FUTURE"]);
    expect(codes(publicationFault({ ...ok, publishedOn: "2026-10-29" }))).toEqual(["PUBLICATION_BEFORE_APPROVAL"]);
    expect(codes(publicationFault({ ...ok, personActive: false }))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(publicationFault({ ...ok, today: null }))).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("the invited path's sale and a refused window change", () => {
  it("sells only to an invitee whose letter issued", () => {
    expect(invitedSaleFault("INVITED", false)?.code).toBe("NOT_INVITED");
    expect(invitedSaleFault("INVITED", true)).toBeNull();
    expect(invitedSaleFault("ADVERTISED", false)).toBeNull();
  });
  it("a refused change is not made and may be asked again, recorded as an assumption", () => {
    expect(windowChangeRejectionSnapshot(new Date("2026-11-01"))).toMatchObject({ rejectionKind: "RETURN_TO_ORIGINATOR", rejectionProvenance: "ASSUMED" });
  });
});
