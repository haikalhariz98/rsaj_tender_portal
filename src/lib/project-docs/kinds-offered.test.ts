import { describe, expect, it } from "vitest";

import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";

import { kindOfferedFault, kindsOffered, SUPPLY_FILE_PURPOSES, versionFileFaults } from "./kinds-offered";
import { PAYMENT_ROUTES } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the kinds a contract offers, by its type's payment route (ADR 0045 D6; WV-9, WV-10)", () => {
  const SIX = ["WORK_PROGRAMME", "INTERIM_CLAIM", "MATERIALS_ON_SITE", "DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION"];

  it("not set: today's six, never the supply claim", () => {
    expect(kindsOffered(null)).toEqual(SIX);
  });

  it("certified claim: today's six, never the supply claim", () => {
    expect(kindsOffered("CERTIFIED_CLAIM")).toEqual(SIX);
  });

  it("delivery order and invoice: the supply claim, and neither valuation claim", () => {
    expect(kindsOffered("DELIVERY_ORDER_INVOICE")).toEqual(["WORK_PROGRAMME", "DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION", "SUPPLY_CLAIM"]);
  });

  it("every route offers a subset of the kinds, in the list's order", () => {
    for (const r of [null, ...PAYMENT_ROUTES]) expect(SUBMISSION_KINDS.filter((k) => kindsOffered(r).includes(k))).toEqual(kindsOffered(r));
  });

  it("a kind not offered is refused, naming it; no kind is never refused", () => {
    expect(kindOfferedFault("SUPPLY_CLAIM", "CERTIFIED_CLAIM")).toEqual({ code: "KIND_NOT_OFFERED", level: "block", data: { kind: "SUPPLY_CLAIM" } });
    expect(kindOfferedFault("SUPPLY_CLAIM", null)?.code).toBe("KIND_NOT_OFFERED");
    expect(kindOfferedFault("INTERIM_CLAIM", "DELIVERY_ORDER_INVOICE")?.code).toBe("KIND_NOT_OFFERED");
    expect(kindOfferedFault("MATERIALS_ON_SITE", "DELIVERY_ORDER_INVOICE")?.code).toBe("KIND_NOT_OFFERED");
    expect(kindOfferedFault("SUPPLY_CLAIM", "DELIVERY_ORDER_INVOICE")).toBeNull();
    expect(kindOfferedFault("INTERIM_CLAIM", null)).toBeNull();
    expect(kindOfferedFault(null, "DELIVERY_ORDER_INVOICE")).toBeNull();
  });
});

describe("the files of a version, by its kind (WV-11)", () => {
  it("a supply claim takes a delivery order and an invoice, several of each allowed", () => {
    expect(versionFileFaults("SUPPLY_CLAIM", ["DELIVERY_ORDER", "SUPPLY_INVOICE"])).toEqual([]);
    expect(versionFileFaults("SUPPLY_CLAIM", ["SUPPLY_INVOICE", "DELIVERY_ORDER", "DELIVERY_ORDER"])).toEqual([]);
  });

  it("a missing invoice is refused, naming it", () => {
    expect(versionFileFaults("SUPPLY_CLAIM", ["DELIVERY_ORDER"])).toEqual([{ code: "SUPPLY_FILE_MISSING", level: "block", data: { purpose: "SUPPLY_INVOICE" } }]);
  });

  it("a missing delivery order is refused, naming it", () => {
    expect(versionFileFaults("SUPPLY_CLAIM", ["SUPPLY_INVOICE", "SUPPLY_INVOICE"])).toEqual([{ code: "SUPPLY_FILE_MISSING", level: "block", data: { purpose: "DELIVERY_ORDER" } }]);
  });

  it("no file at all misses both", () => {
    expect(versionFileFaults("SUPPLY_CLAIM", []).map((f) => f.data?.purpose)).toEqual([...SUPPLY_FILE_PURPOSES]);
  });

  it("a plain project file on a supply claim is refused, naming the file", () => {
    expect(versionFileFaults("SUPPLY_CLAIM", ["DELIVERY_ORDER", "SUPPLY_INVOICE", "PROJECT_DOCUMENT_FILE"])).toEqual([{ code: "FILE_PURPOSE_NOT_TAKEN", level: "block", data: { file: 3, purpose: "PROJECT_DOCUMENT_FILE", kind: "SUPPLY_CLAIM" } }]);
  });

  it("a delivery order on a drawing (no kind) or on another kind is refused", () => {
    expect(codes(versionFileFaults(null, ["PROJECT_DOCUMENT_FILE", "DELIVERY_ORDER"]))).toEqual(["FILE_PURPOSE_NOT_TAKEN"]);
    expect(versionFileFaults(null, ["DELIVERY_ORDER"])[0]!.data).toEqual({ file: 1, purpose: "DELIVERY_ORDER", kind: null });
    expect(codes(versionFileFaults("INTERIM_CLAIM", ["SUPPLY_INVOICE"]))).toEqual(["FILE_PURPOSE_NOT_TAKEN"]);
  });

  it("every other kind, and none, takes plain project files as before", () => {
    for (const k of [null, ...SUBMISSION_KINDS.filter((x) => x !== "SUPPLY_CLAIM")]) expect(versionFileFaults(k, ["PROJECT_DOCUMENT_FILE", "PROJECT_DOCUMENT_FILE"]), String(k)).toEqual([]);
  });
});
