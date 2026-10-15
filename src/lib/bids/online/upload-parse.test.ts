import { describe, expect, it } from "vitest";

import { parseDiscardBody, parseUploadForm, parseUploadQuery } from "./upload-parse";

const IDS = { exerciseId: "ex_12345678", packPartId: "part_12345678" };
const form = (o: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const file = new File([new Uint8Array([1])], "a.pdf");

describe("the part routes' input", () => {
  it("the query names both ids, once, and nothing else", () => {
    expect(parseUploadQuery(new URLSearchParams(IDS))).toEqual({ ok: true, value: IDS });
    expect(parseUploadQuery(new URLSearchParams({ exerciseId: IDS.exerciseId })).ok).toBe(false);
    expect(parseUploadQuery(new URLSearchParams({ ...IDS, extra: "1" })).ok).toBe(false);
    expect(parseUploadQuery(new URLSearchParams({ ...IDS, exerciseId: "a b" })).ok).toBe(false);
  });
  it("the form needs the file and the hash, and refuses an unknown field", () => {
    expect(parseUploadForm(form({ file, contentSha256: "ab" }), IDS)).toEqual({ ok: true, value: { file, contentSha256: "ab" } });
    expect(parseUploadForm(form({ file }), IDS).ok).toBe(false);
    expect(parseUploadForm(form({ file, contentSha256: "ab", extra: "x" }), IDS).ok).toBe(false);
  });
  it("the form's own ids must agree with the query", () => {
    expect(parseUploadForm(form({ file, contentSha256: "ab", ...IDS }), IDS).ok).toBe(true);
    expect(parseUploadForm(form({ file, contentSha256: "ab", exerciseId: "other_1234" }), IDS)).toEqual({ ok: false, disagree: true });
  });
  it("a discard names an exercise and a file, and nothing else", () => {
    expect(parseDiscardBody({ exerciseId: IDS.exerciseId, fileId: "file_12345678" }).ok).toBe(true);
    expect(parseDiscardBody({ exerciseId: IDS.exerciseId }).ok).toBe(false);
    expect(parseDiscardBody({ exerciseId: IDS.exerciseId, fileId: "file_12345678", x: 1 }).ok).toBe(false);
  });
});
