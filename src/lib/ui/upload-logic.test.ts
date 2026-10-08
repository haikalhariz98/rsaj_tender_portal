import { describe, expect, it } from "vitest";

import { NOT_SCANNED_LABEL, progressPercent, progressText, uploadOutcome } from "./upload-logic";

describe("what the answer to an upload means (the shared FileInput's upload mode)", () => {
  it("a 2xx the server calls ok is done", () => {
    expect(uploadOutcome(201, { ok: true })).toEqual({ phase: "done", message: "", stale: false });
  });

  it("a refusal is worded by the server, and its code is never the words", () => {
    const o = uploadOutcome(422, { ok: false, code: "QUOTA_FILES", message: "Your registration already holds as many files as it may (6)." });
    expect(o).toEqual({ phase: "refused", message: "Your registration already holds as many files as it may (6).", stale: false });
    expect(o.message).not.toContain("QUOTA_FILES");
  });

  it("a stale page is told to reload", () => {
    expect(uploadOutcome(409, { ok: false, message: "This registration was changed since this page was opened." })).toMatchObject({ phase: "refused", stale: true });
    expect(uploadOutcome(409, null).message).toContain("Reload");
  });

  it("answers with no words of their own get plain ones", () => {
    expect(uploadOutcome(0, null).message).toContain("did not reach the portal");
    expect(uploadOutcome(413, null).message).toContain("larger");
    expect(uploadOutcome(401, null).message).toContain("signed out");
    expect(uploadOutcome(500, null).message).toContain("could not be uploaded");
    expect(uploadOutcome(200, { ok: false }).phase).toBe("refused");
    expect(uploadOutcome(200, null).phase).toBe("refused");
  });

  it("says how far it has got, whole and bounded", () => {
    expect(progressText(0, 0)).toBe("Uploading…");
    expect(progressText(50, 200)).toBe("Uploading… 25%");
    expect(progressText(300, 200)).toBe("Uploading… 100%");
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5, 0)).toBe(0);
    expect(NOT_SCANNED_LABEL).toBe("Not scanned");
  });
});
