import { describe, expect, it } from "vitest";

import { creditor, ctx, GIRO_SHA, type as typeConfig, value } from "@/lib/portal/registration/fixture";
import type { ConditionRow } from "@/lib/suppliers/eligibility";

import type { SupplierStatus } from "@/lib/suppliers/types";

import { bankChangeFaults, bankReading, bankState, type BankChangeInput, type BankState } from "./bank";
import { attentionCount, documentRows, replacementFaults, requestView, type ExpiryPolicy, type ReplacementContext, type ReplacementInput } from "./documents";
import { conditionViews, failingFirst, SUPPLIER_VERDICT } from "./eligibility-view";
import type { CompanyDocument, OpenRequestFacts } from "./types";
import { companyFaultText, hasCompanyFaultText } from "./words";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * Phase 4c's pure rules: the documents the supplier holds with their bands and reminders (FR-VND-008), the office's request and its answers (FR-VND-007), the rules for lodging a
 * replacement, the rules for changing the bank details after registration, and the supplier's own eligibility in words (FR-VND-011).
 */

const TODAY = "2026-10-09";
const doc = (o: Partial<CompanyDocument> & Pick<CompanyDocument, "id" | "typeId">): CompanyDocument => ({
  typeLabel: "A certificate",
  lodgedOn: "2026-01-02",
  issuedOn: "2026-01-01",
  validFrom: "2026-01-01",
  expiresOn: "2027-01-01",
  notApplicable: false,
  verification: "VERIFIED",
  verifiedOn: "2026-01-03",
  supersedesId: null,
  title: "",
  reference: "R-1",
  issuingAuthority: "An authority",
  ratePercent: null,
  codes: [],
  codeValues: [],
  files: 1,
  notScanned: true,
  lodgedBySupplier: true,
  applicationId: null,
  answersItemId: null,
  ...o,
});
const T_REG = typeConfig({ id: "t-reg", nameEn: "Companies registry certificate", hintEn: "Latest Form 9" });
const T_WORKS = typeConfig({ id: "t-works", nameEn: "Works board certificate", bodyId: "body-1", valueKinds: ["GRADE", "CATEGORY"] });
const T_OTHER = typeConfig({ id: "t-other", nameEn: "Other", repeatable: true, mandatoryAtRegistration: false });
const policy = (o: Partial<ExpiryPolicy> = {}): ExpiryPolicy => ({ criticalDays: 30, warningDays: 60, upcomingDays: 90, reminderOffsets: [90, 60, 30, 7], ...o });

const rowsOf = (docs: CompanyDocument[], o: Partial<Parameters<typeof documentRows>[0]> = {}) =>
  documentRows({ types: [T_REG, T_WORKS, T_OTHER], docs, today: TODAY, policy: policy(), supplierStatus: "REGISTERED", request: null, uploadClosed: null, ...o });

describe("a document's band and reminder, from the configuration only (FR-VND-008)", () => {
  it("bands by the office's thresholds and shows the reminder reached, never sent", () => {
    const rows = rowsOf([doc({ id: "a", typeId: "t-reg", expiresOn: "2026-11-01" })]);
    const row = rows.find((r) => r.typeId === "t-reg")!;
    expect(row.state).toBe("VALID");
    expect(row.band).toMatchObject({ band: "CRITICAL", daysLeft: 23 });
    // 23 days left: the 30-day reminder is the latest reached, and it falls on 2026-10-02.
    expect(row.reminder).toMatchObject({ offset: 30, dueOn: "2026-10-02" });
  });
  it("with the thresholds unset nothing is banded, and it says so rather than showing a quiet nothing", () => {
    const row = rowsOf([doc({ id: "a", typeId: "t-reg", expiresOn: "2026-11-01" })], { policy: policy({ criticalDays: null, warningDays: null, upcomingDays: null }) }).find((r) => r.typeId === "t-reg")!;
    expect(row.band).toMatchObject({ band: "BANDS_NOT_SET" });
  });
  it("with no reminder rule no reminder is due", () => {
    const row = rowsOf([doc({ id: "a", typeId: "t-reg", expiresOn: "2026-11-01" })], { policy: policy({ reminderOffsets: [] }) }).find((r) => r.typeId === "t-reg")!;
    expect(row.reminder).toBeNull();
  });
  it("an expired document reads expired, with no reminder", () => {
    const row = rowsOf([doc({ id: "a", typeId: "t-reg", expiresOn: "2026-10-01" })]).find((r) => r.typeId === "t-reg")!;
    expect(row.state).toBe("EXPIRED");
    expect(row.band?.band).toBe("EXPIRED");
    expect(row.reminder).toBeNull();
  });
  it("a renewal waiting for its check leaves the old one in force, and is shown as waiting (FR-VND-008)", () => {
    const old = doc({ id: "a", typeId: "t-reg", expiresOn: "2026-11-01" });
    const renewal = doc({ id: "b", typeId: "t-reg", supersedesId: "a", expiresOn: "2028-01-01", verification: "NOT_CHECKED", verifiedOn: null, lodgedOn: "2026-10-05" });
    const row = rowsOf([old, renewal]).find((r) => r.typeId === "t-reg")!;
    expect(row.state).toBe("VALID");
    expect(row.effective?.id).toBe("a");
    expect(row.pending?.id).toBe("b");
    expect(row.replace.allowed).toBe(false);
    expect(row.replace.reason).toMatch(/waiting for the office to check it/);
  });
  it("a chain renewed twice with a link waiting between is read to its end (615-C7, on the supplier's own page)", () => {
    const a = doc({ id: "a", typeId: "t-reg", expiresOn: "2026-10-20" });
    const b = doc({ id: "b", typeId: "t-reg", supersedesId: "a", verification: "NOT_CHECKED", verifiedOn: null, lodgedOn: "2026-09-10" });
    const c = doc({ id: "c", typeId: "t-reg", supersedesId: "b", expiresOn: "2028-10-20", lodgedOn: "2026-09-20" });
    const row = rowsOf([a, b, c]).find((r) => r.typeId === "t-reg")!;
    expect(row.effective?.id).toBe("c");
    expect(row.band?.band).toBe("NONE");
  });
  it("lists a mandatory type the supplier has not given, and a type nobody asks for is left out", () => {
    const rows = rowsOf([]);
    expect(rows.map((r) => r.typeId).sort()).toEqual(["t-reg", "t-works"]);
    expect(rows.find((r) => r.typeId === "t-reg")).toMatchObject({ state: "MISSING", replace: { allowed: true } });
  });
  it("a type lodged several times is read a title at a time", () => {
    const rows = rowsOf([doc({ id: "o1", typeId: "t-other", title: "Safety" }), doc({ id: "o2", typeId: "t-other", title: "Quality" })]);
    expect(rows.filter((r) => r.typeId === "t-other").map((r) => r.name).sort()).toEqual(["Other · Quality", "Other · Safety"]);
  });
  it("a supplier not yet registered replaces nothing unless the office asked, and one whose registration was not accepted nothing at all", () => {
    expect(rowsOf([doc({ id: "a", typeId: "t-reg" })], { supplierStatus: "APPLICANT" }).find((r) => r.typeId === "t-reg")!.replace.allowed).toBe(false);
    expect(rowsOf([doc({ id: "a", typeId: "t-reg" })], { supplierStatus: "REJECTED" }).find((r) => r.typeId === "t-reg")!.replace.reason).toMatch(/not accepted/);
  });
  it("closed uploads close the replacement and name why", () => {
    const row = rowsOf([doc({ id: "a", typeId: "t-reg" })], { uploadClosed: "Uploads are closed: the office has not set the quota." }).find((r) => r.typeId === "t-reg")!;
    expect(row.replace).toEqual({ allowed: false, reason: "Uploads are closed: the office has not set the quota." });
  });
  it("counts what needs attention", () => {
    const rows = rowsOf([doc({ id: "a", typeId: "t-reg", expiresOn: "2026-10-01" }), doc({ id: "w", typeId: "t-works", expiresOn: "2026-10-25" })]);
    expect(attentionCount(rows)).toMatchObject({ expired: 1, critical: 1 });
  });
});

describe("the office's request and the supplier's answers (FR-VND-007)", () => {
  const request: OpenRequestFacts = {
    applicationId: "app1",
    decisionId: "dec1",
    remarks: "Send what is missing.",
    resubmitBy: "2026-10-20",
    decidedOn: "2026-10-05",
    items: [
      { id: "i1", label: "Works board certificate W-1", remarks: "The scan is not legible.", documentId: "w", typeId: null },
      { id: "i2", label: "Companies registry certificate", remarks: "Not given.", documentId: null, typeId: "t-reg" },
    ],
  };
  const works = doc({ id: "w", typeId: "t-works", verification: "NOT_IN_ORDER" });

  it("an item with no answer waits for the supplier, and may be answered", () => {
    const v = requestView(request, [works], TODAY);
    expect(v.open).toBe(true);
    expect(v.items.map((i) => [i.id, i.state, i.canAnswer])).toEqual([["i1", "WAITING_FOR_YOU", true], ["i2", "WAITING_FOR_YOU", true]]);
  });
  it("an answer sent and not yet checked blocks another; one found not in order allows it again; one accepted closes the item", () => {
    const sent = doc({ id: "n1", typeId: "t-works", supersedesId: "w", verification: "NOT_CHECKED", verifiedOn: null, answersItemId: "i1", lodgedOn: "2026-10-06" });
    expect(requestView(request, [works, sent], TODAY).items[0]).toMatchObject({ state: "SENT", canAnswer: false });
    expect(requestView(request, [works, { ...sent, verification: "NOT_IN_ORDER" }], TODAY).items[0]).toMatchObject({ state: "NOT_ACCEPTED", canAnswer: true });
    expect(requestView(request, [works, { ...sent, verification: "VERIFIED" }], TODAY).items[0]).toMatchObject({ state: "ACCEPTED", canAnswer: false });
  });
  it("the deadline day is still open, and the day after is lapsed and takes no answer", () => {
    expect(requestView(request, [], "2026-10-20").open).toBe(true);
    const late = requestView(request, [], "2026-10-21");
    expect(late.lapse).toBe("LAPSED");
    expect(late.items.every((i) => !i.canAnswer)).toBe(true);
  });
  it("a request nobody answered is not read as answered once its date has passed (it was, because nothing could be answered any more)", () => {
    const late = requestView(request, [], "2026-10-21");
    expect(late.items.every((i) => !i.canAnswer)).toBe(true);
    expect(attentionCount(rowsOf([], { request: late, supplierStatus: "APPLICANT" })).waitingForYou).toBe(0);
    expect(late.reading).toEqual({ kind: "DATE_PASSED", unanswered: 2 });
    expect(requestView(request, [], TODAY).reading).toEqual({ kind: "WAITING", needing: 2 });
  });
  it("an answer found not in order is still waiting for the supplier while the date runs", () => {
    const sent = doc({ id: "n1", typeId: "t-works", supersedesId: "w", verification: "NOT_IN_ORDER", answersItemId: "i1", lodgedOn: "2026-10-06" });
    const other = doc({ id: "n2", typeId: "t-reg", verification: "NOT_CHECKED", verifiedOn: null, answersItemId: "i2", lodgedOn: "2026-10-06" });
    expect(requestView(request, [works, sent, other], TODAY).reading).toEqual({ kind: "WAITING", needing: 1 });
    expect(requestView(request, [works, { ...sent, verification: "NOT_CHECKED" }, other], TODAY).reading).toEqual({ kind: "ANSWERED" });
  });
  it("a request for a type that may be lodged several times, which nothing is held of, has a row of its own to answer on", () => {
    const asked: OpenRequestFacts = { ...request, items: [{ id: "i9", label: "Other", remarks: "Send your safety plan.", documentId: null, typeId: "t-other" }] };
    const view = requestView(asked, [], TODAY);
    const rows = rowsOf([], { request: view, supplierStatus: "APPLICANT" });
    const row = rows.find((r) => r.typeId === "t-other");
    expect(row).toMatchObject({ name: "Other", head: null, replace: { allowed: true } });
    expect(row!.requested.map((i) => i.id)).toEqual(["i9"]);
    expect(attentionCount(rows).waitingForYou).toBe(1);
  });
  it("once a titled document answers it, the item shows on that document's row and the new-title row goes", () => {
    const asked: OpenRequestFacts = { ...request, items: [{ id: "i9", label: "Other", remarks: "Send your safety plan.", documentId: null, typeId: "t-other" }] };
    const sent = doc({ id: "o1", typeId: "t-other", title: "Safety", verification: "NOT_IN_ORDER", answersItemId: "i9", lodgedOn: "2026-10-06" });
    const rows = rowsOf([sent], { request: requestView(asked, [sent], TODAY), supplierStatus: "APPLICANT" }).filter((r) => r.typeId === "t-other");
    expect(rows.map((r) => [r.name, r.requested.map((i) => i.id)])).toEqual([["Other · Safety", ["i9"]]]);
    expect(rows[0]!.replace.allowed).toBe(true);
  });
  it("a type-level request is not shown on the rows of the titles already held", () => {
    const asked: OpenRequestFacts = { ...request, items: [{ id: "i9", label: "Other", remarks: "Send one more.", documentId: null, typeId: "t-other" }] };
    const held = doc({ id: "o1", typeId: "t-other", title: "Safety" });
    const rows = rowsOf([held], { request: requestView(asked, [held], TODAY) }).filter((r) => r.typeId === "t-other");
    expect(rows.map((r) => [r.name, r.requested.length]).sort()).toEqual([["Other · Safety", 0], ["Other", 1]]);
  });
  it("a document the office asked about may be answered while it still waits for its first check, and another waiting document may not be renewed over", () => {
    const wizard = doc({ id: "w", typeId: "t-works", verification: "NOT_CHECKED", verifiedOn: null });
    const only = { ...request, items: [request.items[0]!] };
    expect(rowsOf([wizard], { request: requestView(only, [wizard], TODAY), supplierStatus: "APPLICANT" }).find((r) => r.typeId === "t-works")!.replace.allowed).toBe(true);
    const pending = doc({ id: "p", typeId: "t-works", supersedesId: "w", verification: "NOT_CHECKED", verifiedOn: null, lodgedOn: "2026-10-05" });
    const row = rowsOf([wizard, pending], { request: requestView(only, [wizard, pending], TODAY), supplierStatus: "APPLICANT" }).find((r) => r.typeId === "t-works")!;
    expect(row.replace).toMatchObject({ allowed: false, reason: expect.stringMatching(/waiting for the office to check it/) });
  });
  it("an applicant whose date has passed is told so, and not that it must wait to be asked", () => {
    const rows = rowsOf([works], { request: requestView(request, [works], "2026-10-21"), supplierStatus: "APPLICANT" });
    expect(rows.find((r) => r.typeId === "t-works")!.replace).toEqual({ allowed: false, reason: "The date to answer the office has passed." });
  });
  it("the request's items appear on their document's row and on the type's row", () => {
    const view = requestView(request, [works], TODAY);
    const rows = rowsOf([works], { request: view, supplierStatus: "APPLICANT" });
    expect(rows.find((r) => r.typeId === "t-works")!.requested.map((i) => i.id)).toEqual(["i1"]);
    expect(rows.find((r) => r.typeId === "t-reg")!.requested.map((i) => i.id)).toEqual(["i2"]);
    // An applicant answers what the office asked, and only that.
    expect(rows.find((r) => r.typeId === "t-works")!.replace.allowed).toBe(true);
    expect(rows.find((r) => r.typeId === "t-reg")!.replace.allowed).toBe(true);
    expect(attentionCount(rows).waitingForYou).toBe(2);
  });
});

describe("lodging a replacement", () => {
  const input = (o: Partial<ReplacementInput> = {}): ReplacementInput => ({ reference: "R-2", issuingAuthority: "An authority", expiresOn: "2028-01-01", ratePercent: "", title: "", valueIds: [], ...o });
  const old = doc({ id: "a", typeId: "t-reg", expiresOn: "2027-01-01" });
  const context = (o: Partial<ReplacementContext> = {}): ReplacementContext => ({
    today: TODAY,
    supplierStatus: "REGISTERED",
    type: { ...T_REG },
    chain: [old],
    renews: old,
    heldTitles: [],
    answering: null,
    values: [],
    files: 1,
    ...o,
  });
  const codes = (i: ReplacementInput, c: ReplacementContext) => replacementFaults(i, c).filter((f) => f.level === "block").map((f) => f.code);

  it("a renewal that ends later, with its file, is clean", () => {
    expect(replacementFaults(input(), context())).toEqual([]);
  });
  it("needs the day judged, a file, a reference and an issuer", () => {
    expect(codes(input(), context({ today: null }))).toEqual(["TIME_ZONE_UNSET"]);
    expect(codes(input(), context({ files: 0 }))).toContain("FILE_REQUIRED");
    expect(codes(input({ reference: " ", issuingAuthority: "" }), context())).toEqual(expect.arrayContaining(["REFERENCE_REQUIRED", "AUTHORITY_REQUIRED"]));
  });
  it("the expiry: required where the type expires, a real day, after today, and later than the checked document it renews", () => {
    expect(codes(input({ expiresOn: "" }), context())).toContain("EXPIRY_REQUIRED");
    expect(codes(input({ expiresOn: "2028-02-30" }), context())).toContain("EXPIRY_NOT_A_DAY");
    expect(codes(input({ expiresOn: "2026-10-09" }), context())).toContain("ALREADY_EXPIRED");
    expect(codes(input({ expiresOn: "2027-01-01" }), context())).toContain("RENEWAL_NOT_LATER");
    // A correction of one found not in order may keep its expiry.
    const bad = doc({ id: "a", typeId: "t-reg", expiresOn: "2027-01-01", verification: "NOT_IN_ORDER" });
    expect(codes(input({ expiresOn: "2027-01-01" }), context({ chain: [bad], renews: bad }))).toEqual([]);
  });
  it("a type that does not say whether it expires asks for the date and warns, and one that never expires takes none", () => {
    const unsaid = replacementFaults(input({ expiresOn: "" }), context({ type: { ...T_REG, expires: null } }));
    expect(unsaid).toEqual([expect.objectContaining({ code: "EXPIRES_NOT_SET", level: "warn" })]);
    expect(codes(input({ expiresOn: "2028-01-01" }), context({ type: { ...T_REG, expires: false } }))).toContain("EXPIRY_NOT_TAKEN");
  });
  it("only the newest document of a chain is renewed, and a type already held is not lodged a second time", () => {
    const newer = doc({ id: "b", typeId: "t-reg", supersedesId: "a" });
    expect(codes(input(), context({ chain: [old, newer] }))).toContain("RENEWS_SUPERSEDED");
    expect(codes(input(), context({ renews: null }))).toContain("ALREADY_LODGED");
    expect(codes(input(), context({ renews: null, chain: [] }))).toEqual([]);
  });
  it("a type lodged several times takes a second document under a different title (the title, not the type, stops a repeat)", () => {
    const safety = doc({ id: "s", typeId: "t-other", title: "Safety" });
    const t = { ...T_OTHER };
    // The chain holds a real document of another title, as the store gives it.
    expect(replacementFaults(input({ title: "Insurance" }), context({ type: t, renews: null, chain: [safety], heldTitles: ["Safety"] }))).toEqual([]);
    expect(replacementFaults(input({ title: "safety " }), context({ type: t, renews: null, chain: [safety], heldTitles: ["Safety"] })).map((f) => f.code)).toEqual(["TITLE_DUPLICATE"]);
    // A kind that may be lodged once still refuses a second.
    expect(codes(input(), context({ renews: null, chain: [old] }))).toEqual(["ALREADY_LODGED"]);
  });
  it("a document still waiting for its first check is not renewed over, unless the office's request is about that very document", () => {
    const waiting = doc({ id: "w", typeId: "t-reg", verification: "NOT_CHECKED", verifiedOn: null });
    expect(codes(input(), context({ renews: waiting, chain: [waiting] }))).toEqual(["RENEWS_WAITING"]);
    const open = { open: true, itemFound: true, itemWaiting: false };
    expect(codes(input(), context({ supplierStatus: "APPLICANT", renews: waiting, chain: [waiting], answering: open }))).toEqual(["RENEWS_WAITING"]);
    expect(codes(input(), context({ supplierStatus: "APPLICANT", renews: waiting, chain: [waiting], answering: { ...open, renewsIsAsked: true } }))).toEqual([]);
  });
  it("a renewal is later than the document the chain has in force, not only than the one it renews", () => {
    const inForce = doc({ id: "a", typeId: "t-reg", expiresOn: "2027-06-01" });
    const bad = doc({ id: "b", typeId: "t-reg", supersedesId: "a", expiresOn: "2030-01-01", verification: "NOT_IN_ORDER", lodgedOn: "2026-09-01" });
    const c = (expiresOn: string) => codes(input({ expiresOn }), context({ renews: bad, chain: [inForce, bad] }));
    expect(c("2027-06-01")).toContain("RENEWAL_NOT_LATER");
    expect(c("2027-06-02")).toEqual([]);
  });
  it("a type lodged several times needs a title that is not one already held", () => {
    const t = { ...T_OTHER };
    expect(codes(input(), context({ type: t, renews: null, chain: [] }))).toContain("TITLE_REQUIRED");
    expect(codes(input({ title: "safety" }), context({ type: t, renews: null, chain: [], heldTitles: ["Safety"] }))).toContain("TITLE_DUPLICATE");
    expect(codes(input({ title: "Quality" }), context({ type: t, renews: null, chain: [], heldTitles: ["Safety"] }))).toEqual([]);
  });
  it("the rate where the type records one, as a percentage to two places", () => {
    const sst = { ...T_REG, recordsRate: true };
    expect(codes(input({ ratePercent: "" }), context({ type: sst }))).toContain("RATE_INVALID");
    expect(codes(input({ ratePercent: "100.5" }), context({ type: sst }))).toContain("RATE_INVALID");
    expect(codes(input({ ratePercent: "6.5" }), context({ type: sst }))).toEqual([]);
  });
  it("codes: of the type's body and kinds, live, and one grade at most", () => {
    const works = { ...T_WORKS };
    const values = [value({ id: "g1", code: "G1", nameEn: "Grade 1", kind: "GRADE" }), value({ id: "g2", code: "G2", nameEn: "Grade 2", kind: "GRADE" }), value({ id: "b", code: "B", nameEn: "Buildings", kind: "CATEGORY" }), value({ id: "f", code: "12", nameEn: "Water", kind: "FIELD_CODE" }), value({ id: "old", code: "Z", nameEn: "Old", kind: "CATEGORY", retired: true }), value({ id: "x", code: "Q", nameEn: "Elsewhere", kind: "CATEGORY", bodyId: "other-body" })];
    const base = { type: works, chain: [], renews: null, values };
    expect(codes(input({ valueIds: ["g1", "b"] }), context(base))).toEqual([]);
    expect(codes(input({ valueIds: ["g1", "g2"] }), context(base))).toContain("ONE_GRADE_ONLY");
    expect(codes(input({ valueIds: ["f"] }), context(base))).toContain("VALUE_NOT_FOR_DOCUMENT");
    expect(codes(input({ valueIds: ["x"] }), context(base))).toContain("VALUE_NOT_FOR_DOCUMENT");
    expect(codes(input({ valueIds: ["old"] }), context(base))).toContain("VALUE_RETIRED");
    expect(codes(input({ valueIds: ["nope"] }), context(base))).toContain("VALUE_UNKNOWN");
  });
  it("who may: a rejected supplier nothing; an applicant only an open item of the office's request", () => {
    expect(codes(input(), context({ supplierStatus: "REJECTED" }))).toContain("SUPPLIER_CLOSED");
    expect(codes(input(), context({ supplierStatus: "APPLICANT" }))).toContain("NOT_ON_REGISTER");
    const open = { open: true, itemFound: true, itemWaiting: false };
    expect(codes(input(), context({ supplierStatus: "APPLICANT", answering: open }))).toEqual([]);
    expect(codes(input(), context({ supplierStatus: "APPLICANT", answering: { ...open, open: false } }))).toContain("REQUEST_LAPSED");
    expect(codes(input(), context({ supplierStatus: "APPLICANT", answering: { ...open, itemFound: false } }))).toContain("ITEM_NOT_FOUND");
    expect(codes(input(), context({ supplierStatus: "APPLICANT", answering: { ...open, itemWaiting: true } }))).toContain("ITEM_WAITING");
  });
  it("an unknown type is refused", () => {
    expect(codes(input(), context({ type: null }))).toContain("DOCUMENT_TYPE_UNKNOWN");
  });
});

describe("changing the bank details after registration", () => {
  const giro = (o: Partial<BankChangeInput["giro"]> = {}) => ({ textVersionId: "text-giro-1", textSha256: GIRO_SHA, signatoryName: "Aminah Binti Ali", signatoryDesignation: "Director", confirmed: true, ...o });
  const input = (o: Partial<BankChangeInput> = {}): BankChangeInput => ({ creditor: creditor(), statementFiles: 1, giro: giro(), ...o });
  const inForce = bankState([{ version: 1, sent: true, verification: "VERIFIED" }]);
  const ok: { supplierStatus: SupplierStatus; bank: BankState; passwordGiven: boolean } = { supplierStatus: "REGISTERED", bank: inForce, passwordGiven: true };
  const blocks = (i: BankChangeInput, s = ok, c = ctx()) => bankChangeFaults(i, c, s).filter((f) => f.level === "block").map((f) => f.code);

  it("a complete change by a registered supplier, signed, is clean", () => {
    expect(blocks(input())).toEqual([]);
  });
  it("only a registered supplier changes them here, and one at a time", () => {
    expect(blocks(input(), { ...ok, supplierStatus: "APPLICANT" })).toContain("NOT_REGISTERED_FOR_CHANGE");
    expect(blocks(input(), { ...ok, bank: bankState([{ version: 1, sent: true, verification: "VERIFIED" }, { version: 2, sent: true, verification: "NOT_CHECKED" }]) })).toContain("CHANGE_WAITING");
  });
  it("the details are judged by the registration's own rules, and the statement is needed", () => {
    expect(blocks(input({ creditor: creditor({ bankAccountNo: "" }) }))).toContain("FIELD_REQUIRED");
    expect(blocks(input({ statementFiles: 0 }))).toContain("STATEMENT_REQUIRED");
    expect(blocks(input({ creditor: creditor({ bankCode: "no-such" }) }))).toContain("BANK_NOT_LISTED");
  });
  it("the authorisation: its wording is set, is the wording shown, names who signs and is ticked", () => {
    expect(blocks(input(), ok, ctx({ texts: { GIRO_AUTHORISATION: null, FALSE_DECLARATION: null } }))).toContain("TEXT_NOT_SET");
    expect(blocks(input({ giro: giro({ textSha256: "0".repeat(64) }) }))).toContain("TEXT_STALE");
    expect(blocks(input({ giro: giro({ textVersionId: "forged" }) }))).toContain("TEXT_STALE");
    expect(blocks(input({ giro: giro({ signatoryName: "", signatoryDesignation: "" }) }))).toEqual(expect.arrayContaining(["SIGNATORY_NAME_REQUIRED", "SIGNATORY_DESIGNATION_REQUIRED"]));
    expect(blocks(input({ giro: giro({ confirmed: false }) }))).toContain("NOT_CONFIRMED");
  });
  it("a different signatory is flagged to the office, not refused", () => {
    const fs = bankChangeFaults(input({ giro: giro({ signatoryName: "Someone Else" }) }), ctx(), ok);
    expect(fs.find((f) => f.code === "SIGNATORY_DIFFERS")?.level).toBe("warn");
  });
  it("it is signed with the password asked again", () => {
    expect(blocks(input(), { ...ok, passwordGiven: false })).toContain("PASSWORD_REQUIRED");
  });
  it("no day, nothing is judged", () => {
    expect(bankChangeFaults(input(), ctx({ today: null }), ok)).toEqual([{ code: "TIME_ZONE_UNSET", level: "block" }]);
  });
});

describe("where the bank details stand", () => {
  const v = (version: number, verification: "VERIFIED" | "NOT_CHECKED" | "NOT_IN_ORDER", sent = true) => ({ version, sent, verification });
  it("reads each state", () => {
    expect(bankReading(bankState([]))).toBe("NONE_SENT");
    expect(bankReading(bankState([v(1, "VERIFIED")]))).toBe("IN_FORCE");
    expect(bankReading(bankState([v(1, "NOT_CHECKED")]))).toBe("WAITING_FIRST");
    expect(bankReading(bankState([v(1, "VERIFIED"), v(2, "NOT_CHECKED")]))).toBe("IN_FORCE_CHANGE_WAITING");
    expect(bankReading(bankState([v(1, "VERIFIED"), v(2, "NOT_IN_ORDER")]))).toBe("NOT_IN_ORDER_STILL_IN_FORCE");
    expect(bankReading(bankState([v(1, "NOT_IN_ORDER")]))).toBe("NOT_IN_ORDER");
  });
  it("version 1 stays in force while version 2 waits or is found not in order, and a later checked version takes over", () => {
    expect(bankState([v(1, "VERIFIED"), v(2, "NOT_CHECKED")]).inForce?.version).toBe(1);
    expect(bankState([v(1, "VERIFIED"), v(2, "NOT_IN_ORDER")]).inForce?.version).toBe(1);
    expect(bankState([v(1, "VERIFIED"), v(2, "VERIFIED")]).inForce?.version).toBe(2);
  });
  it("a version that was never sent counts for nothing", () => {
    expect(bankState([v(1, "VERIFIED"), v(2, "VERIFIED", false)]).inForce?.version).toBe(1);
    expect(bankReading(bankState([v(1, "NOT_CHECKED", false)]))).toBe("NONE_SENT");
  });
});

describe("the supplier's eligibility in its own words (FR-VND-011)", () => {
  const row = (o: Partial<ConditionRow> & Pick<ConditionRow, "kind" | "result" | "reason">): ConditionRow => ({ requirementId: "rq", ...o });
  it("names the failing condition and the reason, and lists it first", () => {
    const views = failingFirst(conditionViews([
      row({ kind: "REGISTERED", result: "PASS", reason: "IS_REGISTERED", requirementId: null }),
      row({ kind: "GRADE", result: "FAIL", reason: "GRADE_BELOW", data: { held: "G5 — Grade five", needed: "G7 — Grade seven" } }),
    ]));
    expect(views[0]).toMatchObject({ label: "Grade", result: "FAIL", tone: "err", reason: "Holds G5 — Grade five, below the G7 — Grade seven asked." });
  });
  it("not assessed is never green, and a setting of the office's is not shown as a path through its configuration", () => {
    const [v] = conditionViews([row({ kind: "GRADE", result: "NOT_ASSESSED", reason: "GRADE_RANK_NOT_SET", data: { needed: "G7" } })]);
    expect(v!.tone).toBe("warn");
    expect(v!.reason).toBe("The office has not set the order of the grades, so your grade cannot be compared with the one asked for yet.");
    expect(v!.reason).not.toMatch(/Configuration|Values/);
    expect(SUPPLIER_VERDICT.NOT_ASSESSED.tone).toBe("warn");
  });
  it("a pass by special permission is shown as such", () => {
    const [v] = conditionViews([row({ kind: "GRADE", result: "PASS_BY_PERMISSION", reason: "GRADE_BELOW", data: { held: "G5", needed: "G7" } })]);
    expect(v!.resultText).toBe("Passes by special permission");
  });
});

describe("every finding has words", () => {
  it("each code the Company rules can return reads as a sentence, and none shows its code", () => {
    const codes = [
      "TIME_ZONE_UNSET", "SUPPLIER_CLOSED", "NOT_ON_REGISTER", "TYPE_RETIRED", "ALREADY_LODGED", "RENEWS_NOTHING", "RENEWS_SUPERSEDED", "RENEWAL_NOT_LATER", "REQUEST_NOT_OPEN", "REQUEST_LAPSED",
      "ITEM_NOT_FOUND", "ITEM_WAITING", "EXPIRY_NOT_TAKEN", "REFERENCE_REQUIRED", "AUTHORITY_REQUIRED", "CHANGE_WAITING", "NOT_REGISTERED_FOR_CHANGE", "PASSWORD_REQUIRED", "UPLOADS_CLOSED",
      "DOCUMENT_TYPE_UNKNOWN", "FILE_REQUIRED", "EXPIRY_REQUIRED", "EXPIRY_NOT_A_DAY", "ALREADY_EXPIRED", "EXPIRES_NOT_SET", "RATE_INVALID", "TITLE_REQUIRED", "TITLE_DUPLICATE", "VALUE_UNKNOWN",
      "VALUE_RETIRED", "VALUE_NOT_FOR_DOCUMENT", "ONE_GRADE_ONLY", "FIELD_REQUIRED", "BANK_NOT_LISTED", "STATEMENT_REQUIRED", "TEXT_NOT_SET", "TEXT_STALE", "SIGNATORY_NAME_REQUIRED",
      "SIGNATORY_DESIGNATION_REQUIRED", "NOT_CONFIRMED", "SIGNATORY_DIFFERS",
    ];
    for (const code of codes) {
      expect(hasCompanyFaultText(code), code).toBe(true);
      const t = companyFaultText({ code: code as never, data: { type: "Form 9", value: "G1 — Grade 1", field: "Account number", expiresOn: "2027-01-01", kind: "GIRO_AUTHORISATION" } });
      expect(t.en.length, code).toBeGreaterThan(10);
      expect(t.en, code).not.toContain(code);
    }
  });
});
