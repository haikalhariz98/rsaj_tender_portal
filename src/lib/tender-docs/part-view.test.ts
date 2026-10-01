import { describe, expect, it } from "vitest";

import { pickTemplateView } from "./part-view";

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
