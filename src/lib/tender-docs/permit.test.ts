import { describe, expect, it } from "vitest";

import { conditionFieldValues, type ConditionsInput } from "./conditions";
import { permitFaults, permitLabel, permitSaveFaults, type PermitList } from "./permit";
import type { PackPartFacts, TemplateFacts } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/// The regulator's permit types as a customer might configure them (test-only; OQ-04: no value bands).
const LIST: PermitList = { name: "Regulator permits", values: [{ code: "b", label: "Permit Type B", retired: false }, { code: "c", label: "Permit Type C", retired: false }, { code: "x", label: "A type withdrawn", retired: true }] };
const template = (bodyEn: string, x: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "t", code: "itt", nameEn: "Instructions", formCode: "", revisionDate: null, bodyEn, bodyMs: null, primaryLanguage: null, bodyVersion: 1, ...x });
const instructions = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({
  partCode: "i", printedNumber: "11", sortOrder: 110, label: "Instructions to tenderers", role: "INSTRUCTIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "itt",
  template: template("The successful bidder shall obtain the regulator's {{permit.type}} before work starts."), state: "READY", omittedReason: "", liveUploads: 0, ...x,
});

describe("FR-DOC-006: the regulator-permit clause in the instructions", () => {
  it("regulated works, a type from the list, and instructions naming it: clear, and the type is what the documents print", () => {
    expect(permitFaults({ regulated: true, permitCode: "c", list: LIST, parts: [instructions()] })).toEqual([]);
    expect(permitLabel(true, "c", LIST)).toBe("Permit Type C");
  });
  it("unanswered is not 'no': it blocks", () => {
    expect(codes(permitFaults({ regulated: null, permitCode: null, list: LIST, parts: [instructions()] }))).toEqual(["REGULATED_NOT_ANSWERED"]);
  });
  it("regulated works need the configured list, a type chosen, and a type still on it", () => {
    expect(codes(permitFaults({ regulated: true, permitCode: "b", list: null, parts: [instructions()] }))).toEqual(["PERMIT_LIST_NOT_SET"]);
    expect(codes(permitFaults({ regulated: true, permitCode: null, list: LIST, parts: [instructions()] }))).toEqual(["PERMIT_NOT_CHOSEN"]);
    expect(codes(permitFaults({ regulated: true, permitCode: "x", list: LIST, parts: [instructions()] }))).toEqual(["PERMIT_NOT_ON_LIST"]);
  });
  it("the instructions must name it: none bound, a template without the field, an uploaded set unchecked", () => {
    expect(codes(permitFaults({ regulated: true, permitCode: "b", list: LIST, parts: [] }))).toEqual(["INSTRUCTIONS_PART_MISSING"]);
    expect(codes(permitFaults({ regulated: true, permitCode: "b", list: LIST, parts: [instructions({ state: "OMITTED", mandatory: false, omittedReason: "x" })] }))).toEqual(["INSTRUCTIONS_PART_MISSING"]);
    expect(codes(permitFaults({ regulated: true, permitCode: "b", list: LIST, parts: [instructions({ template: template("Read every part.") })] }))).toEqual(["PERMIT_NOT_IN_INSTRUCTIONS"]);
    expect(permitFaults({ regulated: true, permitCode: "b", list: LIST, parts: [instructions({ source: "UPLOAD", template: null })] })).toEqual([{ code: "INSTRUCTIONS_NOT_CHECKED", level: "warn", data: { part: "11. Instructions to tenderers" } }]);
  });
  it("works not regulated: no permit is printed, so a template naming it is refused", () => {
    expect(permitFaults({ regulated: false, permitCode: null, list: null, parts: [instructions({ template: template("Read every part.") })] })).toEqual([]);
    expect(codes(permitFaults({ regulated: false, permitCode: null, list: null, parts: [instructions()] }))).toEqual(["PERMIT_FIELD_NOT_REGULATED"]);
    expect(permitLabel(false, "b", LIST)).toBeNull();
  });
  it("saving the answer: a type only from the configured list (the database refuses a type without yes)", () => {
    expect(permitSaveFaults(true, "b", LIST)).toEqual([]);
    expect(permitSaveFaults(true, null, LIST)).toEqual([]);
    expect(codes(permitSaveFaults(true, "b", null))).toEqual(["PERMIT_LIST_NOT_SET"]);
    expect(codes(permitSaveFaults(true, "zz", LIST))).toEqual(["PERMIT_NOT_ON_LIST"]);
    expect(permitSaveFaults(false, null, null)).toEqual([]);
  });
});

describe("the permit type in a Malay document (code review carry 4)", () => {
  const MS_BODY = "Pembida yang berjaya hendaklah mendapatkan {{permit.type}}.";
  const malay = () => instructions({ template: template("The successful bidder shall obtain the regulator's {{permit.type}}.", { bodyMs: MS_BODY }) });
  const withMs: PermitList = { ...LIST, values: LIST.values.map((v) => (v.code === "c" ? { ...v, labelMs: "Permit Jenis C" } : v)) };

  it("a type's name is given in the language the document is issued in", () => {
    expect(permitLabel(true, "c", withMs, "EN")).toBe("Permit Type C");
    expect(permitLabel(true, "c", withMs, "MS")).toBe("Permit Jenis C");
  });
  it("a Malay document never prints the English name in its place: no Malay name is no name", () => {
    expect(permitLabel(true, "b", withMs, "MS")).toBeNull();
    expect(permitLabel(true, "b", { ...withMs, values: withMs.values.map((v) => (v.code === "b" ? { ...v, labelMs: "  " } : v)) }, "MS")).toBeNull();
  });
  it("blocks where the instructions have Malay text and the chosen type has no Malay name, like a clause with no Malay text", () => {
    expect(permitFaults({ regulated: true, permitCode: "b", list: withMs, parts: [malay()] })).toEqual([{ code: "PERMIT_NAME_MS_MISSING", level: "block", data: { part: "11. Instructions to tenderers", permit: "Permit Type B" } }]);
  });
  it("is clear with a Malay name, or where the instructions have no Malay text", () => {
    expect(permitFaults({ regulated: true, permitCode: "c", list: withMs, parts: [malay()] })).toEqual([]);
    expect(permitFaults({ regulated: true, permitCode: "b", list: withMs, parts: [instructions()] })).toEqual([]);
  });
  it("the merged value in each language is that language's name", () => {
    const input: ConditionsInput = {
      today: "2026-10-01",
      eligibility: { requirements: [], bodies: [] },
      restriction: { restricted: false, label: null, stamp: { EN: null, MS: null } },
      permit: { regulated: true, permitCode: "c", list: withMs },
      clauses: { clauses: [], overrides: [] },
      assurance: { required: false, confirmations: [] },
    };
    const v = conditionFieldValues(input, null);
    expect(v.EN["permit.type"]).toBe("Permit Type C");
    expect(v.MS["permit.type"]).toBe("Permit Jenis C");
  });
});
