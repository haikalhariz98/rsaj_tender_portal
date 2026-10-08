import { describe, expect, it } from "vitest";

import { approveFaults, submitFaults, type FileFacts } from "./review";

/**
 * Phase 4b (FR-VND-006, ruling 8): a portal application's online declaration may stand in for the paper declaration's day and scan, but only where the organisation has said so
 * (`SupplierPolicy.onlineDeclarationReplacesPaper`), and only for an application that came through the portal. The mandatory test: approval fails when neither the paper nor the
 * online declaration is present, under each of the three states of the switch, and with only an online declaration where the switch is not true or the channel is not PORTAL.
 */

const base: FileFacts = {
  status: "RECEIVED",
  lapsedRecordedAt: null,
  resubmitBy: null,
  routePending: false,
  declarationSignedOn: null,
  declarationScanned: false,
  mandatory: [{ label: "A certificate", state: "VALID" }],
  mandatoryNotSet: [],
  typesConfigured: 1,
  blacklist: null,
  kind: "NEW",
  supplierStatus: "APPLICANT",
  cancellation: null,
};
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const blocks = (fs: { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);
const TODAY = "2026-10-09";
const online = { signedAt: "2026-10-09T02:00:00.000Z" };

describe("approval needs the paper declaration or, where the organisation says so, the online one", () => {
  for (const channel of ["PORTAL", "COUNTER"] as const) {
    for (const sw of [null, true, false] as const) {
      it(`neither the paper nor an online declaration: approval is refused (${channel}, switch ${sw})`, () => {
        const fs = approveFaults({ ...base, channel, onlineDeclaration: null, onlineDeclarationReplacesPaper: sw }, TODAY);
        expect(blocks(fs)).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
      });
    }
  }

  it("a paper application with no channel facts at all is refused as before", () => {
    expect(blocks(approveFaults(base, TODAY))).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
  });

  it("the paper day and scan satisfy it, as they always did", () => {
    expect(approveFaults({ ...base, declarationSignedOn: "2026-09-29", declarationScanned: true }, TODAY)).toEqual([]);
    expect(approveFaults({ ...base, channel: "PORTAL", declarationSignedOn: "2026-09-29", declarationScanned: true, onlineDeclarationReplacesPaper: null }, TODAY)).toEqual([]);
  });

  it("only an online declaration, with the switch NOT SET: refused, and the setting is named", () => {
    const fs = approveFaults({ ...base, channel: "PORTAL", onlineDeclaration: online, onlineDeclarationReplacesPaper: null }, TODAY);
    expect(blocks(fs)).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED", "ONLINE_DECLARATION_SWITCH_NOT_SET"]);
  });

  it("only an online declaration, with the switch FALSE: the paper is still required (and the unset-switch message is not given)", () => {
    const fs = approveFaults({ ...base, channel: "PORTAL", onlineDeclaration: online, onlineDeclarationReplacesPaper: false }, TODAY);
    expect(blocks(fs)).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
  });

  it("only an online declaration, with the switch TRUE, on a PORTAL application: it passes", () => {
    expect(approveFaults({ ...base, channel: "PORTAL", onlineDeclaration: online, onlineDeclarationReplacesPaper: true }, TODAY)).toEqual([]);
  });

  it("only an online declaration, with the switch TRUE, on any channel but PORTAL: refused", () => {
    for (const channel of ["COUNTER", "POST", "EMAIL"] as const) {
      expect(blocks(approveFaults({ ...base, channel, onlineDeclaration: online, onlineDeclarationReplacesPaper: true }, TODAY)), channel).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
    }
  });

  it("a PORTAL application with the switch true but no online declaration signed: refused", () => {
    expect(blocks(approveFaults({ ...base, channel: "PORTAL", onlineDeclaration: null, onlineDeclarationReplacesPaper: true }, TODAY))).toEqual(["DECLARATION_DAY_REQUIRED", "DECLARATION_SCAN_REQUIRED"]);
  });

  it("sending for decision asks the same", () => {
    expect(blocks(submitFaults({ ...base, channel: "PORTAL", onlineDeclaration: online, onlineDeclarationReplacesPaper: true }, TODAY))).toEqual([]);
    expect(blocks(submitFaults({ ...base, channel: "PORTAL", onlineDeclaration: online, onlineDeclarationReplacesPaper: null }, TODAY))).toContain("ONLINE_DECLARATION_SWITCH_NOT_SET");
  });
});

describe("approval while the creditor profile is not checked warns and does not block (BD-613-44)", () => {
  const ok = { ...base, channel: "PORTAL" as const, onlineDeclaration: online, onlineDeclarationReplacesPaper: true };
  it("not checked: the warning, and the approval still goes", () => {
    const fs = approveFaults({ ...ok, creditorProfile: "NOT_VERIFIED" }, TODAY);
    expect(fs).toEqual([{ code: "CREDITOR_NOT_VERIFIED", level: "warn" }]);
    expect(blocks(fs)).toEqual([]);
  });
  it("checked, or never entered on paper: no warning", () => {
    expect(codes(approveFaults({ ...ok, creditorProfile: "VERIFIED" }, TODAY))).toEqual([]);
    expect(codes(approveFaults({ ...ok, creditorProfile: "NOT_ENTERED" }, TODAY))).toEqual([]);
    expect(codes(approveFaults(ok, TODAY))).toEqual([]);
  });
});
