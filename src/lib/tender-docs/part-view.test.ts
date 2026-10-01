import { describe, expect, it } from "vitest";

import { distinctOffices, pickTemplateView } from "./part-view";

/**
 * Carry e: the pick-template drawer opens on the template the part draws now. Before, the
 * read model gave no current template and the drawer opened on "Choose", as if none were set.
 */

const templates = [
  { id: "t1", nameEn: "Demo notice of invitation", bodyVersion: 2 },
  { id: "t2", nameEn: "Demo instructions to bidders", bodyVersion: 1 },
];
const part = { source: "TEMPLATE" as const, content: "STANDARD" as const, templateId: "t2", printedNumber: "2", label: "Instructions to bidders" };

describe("the pick-template action, as the tab offers it", () => {
  it("preselects the template the part draws now", () => {
    const v = pickTemplateView(part, templates, null);
    expect(v).toEqual({ allowed: true, current: "t2", options: [{ value: "t1", label: "Demo notice of invitation (text version 2)" }, { value: "t2", label: "Demo instructions to bidders (text version 1)" }] });
  });
  it("none chosen yet, or one no longer in the library: nothing preselected", () => {
    expect(pickTemplateView({ ...part, templateId: null }, templates, null)).toMatchObject({ allowed: true, current: "" });
    expect(pickTemplateView({ ...part, templateId: "gone" }, templates, null)).toMatchObject({ allowed: true, current: "" });
  });
  it("refused, with the reason, for an uploaded or bespoke part or a pack that is not a draft", () => {
    expect(pickTemplateView({ ...part, source: "UPLOAD" }, templates, null)).toEqual({ allowed: false, reason: "This part does not draw a library template." });
    expect(pickTemplateView({ ...part, content: "BESPOKE" }, templates, null).allowed).toBe(false);
    expect(pickTemplateView(part, templates, { code: "PACK_NOT_DRAFT", level: "block", data: { status: "SUBMITTED" } }).allowed).toBe(false);
  });
});

describe("the picker offers only templates suited to the part, with text (UX 10)", () => {
  const lib = [
    { id: "n", code: "notice", nameEn: "Notice", bodyVersion: 1, bodyEn: "Text", bodyMs: null },
    { id: "i", code: "instr", nameEn: "Instructions", bodyVersion: 1, bodyEn: "Text", bodyMs: null },
    { id: "loa", code: "loa", nameEn: "Letter of acceptance", bodyVersion: 1, bodyEn: "Text", bodyMs: null },
    { id: "blank", code: "blank", nameEn: "Approval routing sheet", bodyVersion: 0, bodyEn: null, bodyMs: null },
  ];
  const p = { ...part, templateId: "i" };
  it("hides a template configured for another role and one with no text", () => {
    const v = pickTemplateView(p, lib, null, new Set(["notice", "instr", "blank"]));
    expect(v.allowed && v.options.map((o) => o.value)).toEqual(["n", "i"]);
  });
  it("hides an empty template even where nothing is narrowed by role", () => {
    const v = pickTemplateView(p, lib, null, null);
    expect(v.allowed && v.options.map((o) => o.value)).toEqual(["n", "i", "loa"]);
  });
  it("keeps the template the part draws now, so the drawer opens on it", () => {
    const v = pickTemplateView({ ...p, templateId: "blank" }, lib, null, new Set(["notice"]));
    expect(v).toMatchObject({ allowed: true, current: "blank" });
    expect(v.allowed && v.options.map((o) => o.value)).toEqual(["n", "blank"]);
  });
});

describe("office options are one per code (UX 8)", () => {
  it("a unit stored once per effective period is offered once, the period in force winning", () => {
    const opts = distinctOffices([
      { code: "NTH", nameEn: "Northern Region (old)", effectiveFrom: new Date("2024-01-01"), effectiveTo: new Date("2026-07-01") },
      { code: "NTH", nameEn: "Northern Region", effectiveFrom: new Date("2026-07-01"), effectiveTo: null },
      { code: "CP", nameEn: "Contract & Procurement", effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    ]);
    expect(opts).toEqual([{ value: "CP", label: "Contract & Procurement" }, { value: "NTH", label: "Northern Region" }]);
  });
});
