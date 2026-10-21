import { describe, expect, it } from "vitest";

import { approveFaults, submitFaults } from "@/lib/suppliers/review";
import type { DocumentTypeFacts } from "@/lib/suppliers/types";

import { portalFileFacts, type HeldDocumentFacts } from "./file-facts";

/// The held rows of a whole online application, read by the same approval rules as any application (ADR 0041 D5, plan 8.1).
const TODAY = "2026-10-09";
const types: DocumentTypeFacts[] = [
  { id: "t-reg", label: "Companies registry certificate", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, retiredOn: null },
  { id: "t-sst", label: "Sales tax certificate", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true, retiredOn: null },
];
const verified: HeldDocumentFacts = { id: "d1", typeId: "t-reg", typeLabel: "Companies registry certificate", expiresOn: "2027-06-30", notApplicable: false, verification: "VERIFIED", verifiedOn: "2026-10-08" };
const app = { status: "RECEIVED" as const, receivedOn: "2026-10-01", routePending: false };
const declared = [{ kind: "FALSE_DECLARATION" as const, signedAt: "2026-10-01T02:00:00.000Z" }];
const codes = (fs: readonly { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);

describe("portalFileFacts read by approveFaults", () => {
  it("is approvable once the mandatory document is verified and the online declaration stands in for the paper", () => {
    const f = portalFileFacts(app, [verified], { verification: "VERIFIED" }, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY);
    expect(f).toMatchObject({ kind: "NEW", supplierStatus: "APPLICANT", channel: "PORTAL", blacklist: null, cancellation: null, creditorProfile: "VERIFIED" });
    expect(codes(approveFaults(f, TODAY))).toEqual([]);
  });

  it("an unverified mandatory document blocks: it stands only once a named officer has verified it (FR-VND-004)", () => {
    const f = portalFileFacts(app, [{ ...verified, verification: "NOT_CHECKED", verifiedOn: null }], null, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY);
    expect(codes(approveFaults(f, TODAY))).toEqual(["DOCUMENT_NOT_STANDING"]);
    expect(codes(approveFaults(portalFileFacts(app, [], null, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY), TODAY))).toEqual(["DOCUMENT_NOT_STANDING"]);
  });

  it("the online-declaration switch: unset blocks naming it, false asks for the paper, true lets the online declaration stand (O-8)", () => {
    const at = (s: boolean | null) => codes(approveFaults(portalFileFacts(app, [verified], null, declared, types, { onlineDeclarationReplacesPaper: s }, TODAY), TODAY));
    expect(at(null)).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED", "ONLINE_DECLARATION_SWITCH_NOT_SET"]);
    expect(at(false)).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
    expect(at(true)).toEqual([]);
    // With no false declaration agreed, nothing stands in for the paper.
    expect(codes(approveFaults(portalFileFacts(app, [verified], null, [], types, { onlineDeclarationReplacesPaper: true }, TODAY), TODAY))).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
  });

  it("bank details not yet checked warn; a decided application, or one with a route waiting, is not sent again", () => {
    const f = portalFileFacts(app, [verified], { verification: "NOT_CHECKED" }, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY);
    expect(approveFaults(f, TODAY)).toEqual([{ code: "CREDITOR_NOT_VERIFIED", level: "warn" }]);
    for (const status of ["APPROVED", "REJECTED", "DISCARDED", "RECORDED"] as const) expect(codes(approveFaults(portalFileFacts({ ...app, status }, [verified], null, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY), TODAY))).toEqual(["DECIDED"]);
    expect(codes(submitFaults(portalFileFacts({ ...app, routePending: true }, [verified], null, declared, types, { onlineDeclarationReplacesPaper: true }, TODAY), TODAY))).toEqual(["ROUTE_PENDING"]);
  });
});
