import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ saveTemplate: () => undefined }));

import { EditTemplate } from "./editors";

/**
 * Founder, 2026-10-20: documents are English only, so the Malay name, Malay text and language to issue in are hidden fields that carry the stored value. A save nulls any
 * hidden field the editor does not post back, so every hidden field must have a value in `values` (`english-only-save.db.test.ts` holds the server half).
 */
describe("the template editor posts back every hidden field", () => {
  it("each hidden field it declares has a key in its values", () => {
    const row = { id: "t", code: "c", nameEn: "N", nameMs: "M", formCode: null, revisionDate: null, bilingual: false, documentClassId: null, provenance: "ASSUMED", sortOrder: 0, notes: null, bodyMs: "m", bodyEn: "e", primaryLanguage: "MS" };
    const el = EditTemplate({ row: row as never, classes: [], clauses: [] }) as unknown as { props: { fields: { kind: string; name: string }[]; values: Record<string, unknown> } };
    const hidden = el.props.fields.filter((f) => f.kind === "hidden").map((f) => f.name);
    expect(hidden).toEqual(expect.arrayContaining(["bodyMs", "nameMs", "primaryLanguage"]));
    expect(hidden.filter((n) => !(n in el.props.values))).toEqual([]);
  });
});
