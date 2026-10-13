import { describe, expect, it } from "vitest";

import { aadBytes, canonicalAad } from "./aad";
import type { AadContext } from "./types";

const A: AadContext = { purpose: "SHARE", organisationId: "cmorg0001", exerciseId: "cmex0001", keyId: "cmkey0001", recordId: "cmshare0001" };

describe("the canonical AAD (ADR 0036 D2)", () => {
  it("is v1|purpose|organisationId|exerciseId|keyId|recordId|partKey, partKey empty when absent", () => {
    expect(canonicalAad(A)).toBe("v1|SHARE|cmorg0001|cmex0001|cmkey0001|cmshare0001|");
    expect(canonicalAad({ ...A, purpose: "FILE_BODY", partKey: "cmpart01" })).toBe("v1|FILE_BODY|cmorg0001|cmex0001|cmkey0001|cmshare0001|cmpart01");
    expect(Buffer.from(aadBytes(A)).toString("utf8")).toBe(canonicalAad(A));
  });

  it("refuses a separator inside any field, so two contexts never write the same string", () => {
    for (const field of ["organisationId", "exerciseId", "keyId", "recordId", "partKey"] as const) {
      expect(() => canonicalAad({ ...A, [field]: "a|b" }), field).toThrow("FORMAT");
    }
  });

  it("refuses an empty id", () => {
    for (const field of ["organisationId", "exerciseId", "keyId", "recordId"] as const) expect(() => canonicalAad({ ...A, [field]: "" }), field).toThrow("FORMAT");
  });
});
