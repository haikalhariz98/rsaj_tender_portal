import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { event, klAt, NEWSPAPER, NOTICE_BOARD, SPEC_CALENDAR, SPEC_CHANNELS, SPEC_FLOORS, SPEC_POLICY, WEBSITE } from "./fixture";
import { windowFindingText } from "./labels";
import { publishFaults, windowPathOf, type PublishInput } from "./publish";

/**
 * FR-ADV-001–008 and FR-MTD-008 at publication: every reason at once, each alone below; all clear
 * gives none. Advertised: every required channel carries a day, and the advertisement day is the
 * latest (OD-3). Invited: no public channel, and the approved list exactly (OD-4).
 */

const codes = (r: { findings: { code: string; level: string }[] }) => r.findings.filter((f) => f.level === "block").map((f) => f.code);
const records = [
  { channelId: NEWSPAPER.id, publishedOn: "2026-11-02" },
  { channelId: NOTICE_BOARD.id, publishedOn: "2026-11-03" },
  { channelId: WEBSITE.id, publishedOn: "2026-11-03" },
];
const ok: PublishInput = {
  status: "APPROVED_FOR_TENDERING",
  packKind: "TENDER",
  methodPath: "ADVERTISED",
  windowPath: "ADVERTISED",
  restricted: false,
  requirements: 1,
  window: {
    inspectionPlace: "Tender table, Level 2",
    purchasePlace: "Finance counter, Level 1",
    inspectionHours: "09:00 to 16:00 on working days",
    purchaseFromDay: "2026-11-04",
    purchaseCloseDay: "2026-11-20",
    fee: parseSen("250.00"),
    feePaymentMethods: "Bank draft or cash",
    submissionPlace: "Tender box, Level 1",
    closingTimeReason: "",
  },
  events: [event()],
  policy: SPEC_POLICY,
  calendar: SPEC_CALENDAR,
  channels: SPEC_CHANNELS,
  records,
  closingAt: klAt("2026-11-24"),
  tenderingStartOn: "2026-11-02",
  timeZone: "Asia/Kuala_Lumpur",
  today: "2026-11-03",
  regime: "tender",
  floors: SPEC_FLOORS,
  basisTotal: parseSen("200.00"),
  template: { state: "OK", missing: [], unknown: [], stampMissing: false },
  invited: null,
};
const route = (status: "PENDING" | "APPROVED", invitees = [{ registrationNo: "A1" }, { registrationNo: "B2" }]) => ({ id: "n", status, openedAt: new Date("2026-10-01"), invitees });
const invitedOk: PublishInput = { ...ok, methodPath: "INVITED", windowPath: "INVITED", records: [], invited: { method: { requiresNameApproval: true }, nameRoutes: [route("APPROVED")], proposed: [{ registrationNo: "A1" }, { registrationNo: "B2" }] } };

describe("all clear", () => {
  it("advertised: no block, and the advertisement day is the latest required channel's", () => {
    const r = publishFaults(ok);
    expect(codes(r)).toEqual([]);
    expect(r.advertisementDay).toBe("2026-11-03");
  });
  it("invited: no block, and the invitation day is the advertisement day", () => {
    const r = publishFaults(invitedOk);
    expect(codes(r)).toEqual([]);
    expect(r.advertisementDay).toBe("2026-11-03");
  });
});

describe("each refusal alone", () => {
  it.each<[string, Partial<PublishInput>]>([
    ["NOT_APPROVED_FOR_TENDERING", { status: "PENDING_APPROVAL_FOR_TENDERING" }],
    ["NO_TENDER_DOCUMENTS", { packKind: "NONE" }],
    ["PATH_NOT_SET", { methodPath: null, windowPath: "ADVERTISED" }],
    ["PATH_CHANGED", { methodPath: "INVITED", windowPath: "ADVERTISED" }],
    ["RESTRICTION_NOT_ANSWERED", { restricted: null }],
    ["STAMP_NOT_SET", { restricted: true, template: { state: "OK", missing: [], unknown: [], stampMissing: true } }],
    ["ELIGIBILITY_MISSING", { requirements: 0 }],
    ["CLOSING_NOT_SET", { closingAt: null }],
    ["BEFORE_TENDERING_START", { tenderingStartOn: "2026-11-04", window: { ...ok.window, purchaseFromDay: "2026-11-04" } }],
    ["PUBLICATION_IN_FUTURE", { today: "2026-11-02", records: [...records.slice(0, 2), { channelId: WEBSITE.id, publishedOn: "2026-11-02" }], window: { ...ok.window }, tenderingStartOn: "2026-11-01" }],
    ["TEMPLATE_NOT_SET", { template: { state: "NOT_SET", missing: [], unknown: [], stampMissing: false } }],
    ["TEMPLATE_TEXT_NOT_SET", { template: { state: "NO_TEXT", missing: [], unknown: [], stampMissing: false } }],
    ["TEMPLATE_LANGUAGE_NOT_SET", { template: { state: "NO_LANGUAGE", missing: [], unknown: [], stampMissing: false } }],
    ["TEMPLATE_INCOMPLETE", { template: { state: "OK", missing: ["window.fee"], unknown: [], stampMissing: false } }],
    ["TEMPLATE_UNKNOWN_FIELD", { template: { state: "OK", missing: [], unknown: ["invitee.name"], stampMissing: false } }],
    ["TIME_ZONE_UNSET", { timeZone: null }],
  ])("%s", (code, over) => {
    const r = publishFaults({ ...ok, ...over });
    expect(codes(r)).toContain(code);
    expect(windowFindingText(r.findings.find((f) => f.code === code)!)).not.toBe("This cannot be done now.");
  });

  it.each<[string, Partial<PublishInput["window"]>]>([
    ["INSPECTION_PLACE_MISSING", { inspectionPlace: " " }],
    ["PURCHASE_PLACE_MISSING", { purchasePlace: "" }],
    ["INSPECTION_HOURS_MISSING", { inspectionHours: "" }],
    ["PURCHASE_FROM_NOT_SET", { purchaseFromDay: null }],
    ["PURCHASE_DAYS_OUT_OF_ORDER", { purchaseFromDay: "2026-11-21" }],
    ["PURCHASE_FROM_BEFORE_ADVERTISEMENT", { purchaseFromDay: "2026-11-02" }],
    ["PAYMENT_METHODS_MISSING", { feePaymentMethods: "" }],
    ["SUBMISSION_PLACE_MISSING", { submissionPlace: "" }],
    ["FEE_NOT_SET", { fee: null }],
    ["BELOW_FLOOR", { fee: parseSen("249.99") }],
    ["PURCHASE_CLOSE_NOT_SET", { purchaseCloseDay: null }],
    ["PURCHASE_CUTOFF_TOO_LATE", { purchaseCloseDay: "2026-11-23" }],
    ["TIME_NOT_DEFAULT", {}],
  ])("notice item: %s", (code, w) => {
    const over: Partial<PublishInput> = code === "TIME_NOT_DEFAULT" ? { closingAt: klAt("2026-11-24", "17:00") } : {};
    expect(codes(publishFaults({ ...ok, ...over, window: { ...ok.window, ...w } }))).toContain(code);
  });

  it("an event missing its time, or its place, or mandatory unanswered where permitted", () => {
    expect(codes(publishFaults({ ...ok, events: [event({ startsAt: null })] }))).toEqual(["EVENT_TIME_MISSING"]);
    expect(codes(publishFaults({ ...ok, events: [event({ place: "" })] }))).toEqual(["EVENT_PLACE_MISSING"]);
    expect(codes(publishFaults({ ...ok, events: [event({ mandatory: null })] }))).toEqual(["MANDATORY_NOT_ANSWERED"]);
  });

  it("every closing rule blocks it: a Saturday closing, too soon, a calendar year not maintained", () => {
    expect(codes(publishFaults({ ...ok, closingAt: klAt("2026-11-28"), window: { ...ok.window, purchaseCloseDay: "2026-11-25" } }))).toEqual(["CLOSING_ON_WEEKEND"]);
    expect(codes(publishFaults({ ...ok, closingAt: klAt("2026-11-16"), window: { ...ok.window, purchaseCloseDay: "2026-11-13" } }))).toEqual(["CLOSING_TOO_SOON"]);
    expect(codes(publishFaults({ ...ok, closingAt: klAt("2027-01-12"), window: { ...ok.window, purchaseCloseDay: "2027-01-08" } }))).toEqual(["CALENDAR_NOT_MAINTAINED"]);
  });

  it("advertised: no channel configured, and a channel missing, each named", () => {
    expect(codes(publishFaults({ ...ok, channels: [] }))).toEqual(["CHANNELS_NOT_SET"]);
    const r = publishFaults({ ...ok, records: records.slice(0, 2) });
    expect(codes(r)).toEqual(["CHANNEL_MISSING"]);
    expect(windowFindingText(r.findings[0])).toMatch(/Website/);
    expect(r.advertisementDay).toBeNull();
  });

  it("advertised: the day rule unset blocks", () => {
    expect(codes(publishFaults({ ...ok, policy: { ...SPEC_POLICY, advertisementDayRule: null } }))).toEqual(["RULE_NOT_SET"]);
  });

  it("invited: a public channel recorded is refused", () => {
    expect(codes(publishFaults({ ...invitedOk, records: [records[0]] }))).toEqual(["PUBLIC_CHANNEL_ON_INVITED"]);
  });

  it("invited: the name gate (invitationFault) and the frozen list (inviteeListFault)", () => {
    expect(codes(publishFaults({ ...invitedOk, invited: { ...invitedOk.invited!, nameRoutes: [route("PENDING")] } }))).toEqual(["NAME_NOT_APPROVED"]);
    expect(codes(publishFaults({ ...invitedOk, invited: { ...invitedOk.invited!, nameRoutes: [] } }))).toEqual(["NAME_NOT_REQUESTED"]);
    expect(codes(publishFaults({ ...invitedOk, invited: { ...invitedOk.invited!, proposed: [{ registrationNo: "A1" }] } }))).toEqual(["LIST_CHANGED"]);
    expect(codes(publishFaults({ ...invitedOk, invited: { ...invitedOk.invited!, nameRoutes: [route("APPROVED", [])] } }))).toEqual(["LIST_NOT_RECORDED"]);
  });
});

describe("the path from the method's flags", () => {
  it("advertised or invited; both or neither is not set", () => {
    expect(windowPathOf({ requiresAdvertisement: true, invitesNamedSuppliers: false })).toBe("ADVERTISED");
    expect(windowPathOf({ requiresAdvertisement: false, invitesNamedSuppliers: true })).toBe("INVITED");
    expect(windowPathOf({ requiresAdvertisement: true, invitesNamedSuppliers: true })).toBeNull();
    expect(windowPathOf({ requiresAdvertisement: false, invitesNamedSuppliers: false })).toBeNull();
    expect(windowPathOf(null)).toBeNull();
  });
});
