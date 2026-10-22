import { describe, expect, it } from "vitest";

import type { Finding } from "@/lib/documents/types";

import { uploadFaultWords } from "./upload-words";

/** A refused staging upload says what the contractor can do, never where a staff member sets something, and never a code or a setting's name. */

const ORG = "Jabatan Ujian";
const ctx = { orgName: ORG, allowedTypes: ["application/pdf", "image/png"] };
const f = (code: string, data?: Finding["data"]): Finding => ({ code, level: "block", ...(data ? { data } : {}) });

describe("a refused upload, in the contractor's words", () => {
  it("a type the rules do not allow lists what is accepted, and does not point at the Upload rules", () => {
    const words = uploadFaultWords(f("TYPE_NOT_ALLOWED", { sniffed: "image/jpeg" }), ctx);
    expect(words).toMatch(/not accepted here/);
    expect(words).toMatch(/PDF/);
    expect(words).not.toMatch(/Upload rules|Configuration|administrator/i);
  });

  it("every setting the organisation or the operator makes reads as 'ask the organisation', naming it, with no screen and no variable", () => {
    for (const code of ["TYPES_NOT_SET", "SIZE_NOT_SET", "CEILING_NOT_SET", "CEILING_INVALID", "CLASS_NOT_SET", "PROJECT_CLASS_NOT_SET", "CLASSES_NOT_CONFIGURED", "CLASS_UNKNOWN", "NO_ORGANISATION", "PERSON_UNKNOWN", "DOCUMENT_UNKNOWN", "DRIVER_UNKNOWN", "DRIVER_NOT_BUILT"]) {
      const words = uploadFaultWords(f(code), ctx);
      expect(words, code).toContain(ORG);
      expect(words, code).not.toMatch(/Configuration|administrator|DOCUMENT_|Upload rules|operator/i);
    }
  });

  it("a body that was too slow is said, and is not the store's 'This was refused.'", () => {
    expect(uploadFaultWords(f("BODY_TOO_SLOW"), ctx)).toMatch(/too slow/);
  });

  it("what is wrong with the file itself is the store's own words", () => {
    expect(uploadFaultWords(f("TOO_LARGE", { cap: "1048576", from: "CEILING" }), ctx)).toMatch(/larger than/);
    expect(uploadFaultWords(f("EMPTY"), ctx)).toBe("The file is empty.");
    expect(uploadFaultWords(f("ARCHIVE_NOT_ACCEPTED"), ctx)).toMatch(/ZIP/);
    expect(uploadFaultWords(f("DECLARED_TYPE_MISMATCH", { sniffed: "application/pdf", declared: "image/png" }), ctx)).toMatch(/Check the file/);
  });

  it("a code it has never seen is plain words, never the code", () => {
    expect(uploadFaultWords(f("SOMETHING_NEW"), ctx)).not.toContain("SOMETHING_NEW");
  });
});
