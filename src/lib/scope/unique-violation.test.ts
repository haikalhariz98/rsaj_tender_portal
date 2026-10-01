import { describe, expect, it } from "vitest";

import { backstopCode, uniqueViolationIndex } from "./unique-violation";

/// The shape observed from Prisma 7 + @prisma/adapter-pg on Postgres (probed on perolehan_verify, rolled back).
const adapterError = (index: string, fields: string[], modelName = "CompanyEstimate") => ({
  code: "P2002",
  meta: {
    modelName,
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage: `duplicate key value violates unique constraint "${index}"`,
        kind: "UniqueConstraintViolation",
        constraint: { fields: fields.map((f) => `"${f}"`) },
      },
    },
  },
});

describe("which unique index a P2002 names", () => {
  it("reads the index from the driver adapter's message", () => {
    expect(uniqueViolationIndex(adapterError("CompanyEstimate_one_live_per_exercise", ["exerciseId"]))).toBe("CompanyEstimate_one_live_per_exercise");
  });

  it("reads meta.target, as a string or among an array, and constraint.index", () => {
    expect(uniqueViolationIndex({ code: "P2002", meta: { target: "BqVersion_one_draft_per_exercise" } })).toBe("BqVersion_one_draft_per_exercise");
    expect(uniqueViolationIndex({ code: "P2002", meta: { target: ["exerciseId", "CompanyEstimate_one_live_per_exercise"] } })).toBe("CompanyEstimate_one_live_per_exercise");
    expect(uniqueViolationIndex({ code: "P2002", meta: { driverAdapterError: { cause: { constraint: { index: "X_idx" } } } } })).toBe("X_idx");
  });

  it("names nothing for another error, or a P2002 that names no index", () => {
    expect(uniqueViolationIndex({ code: "P2025", meta: {} })).toBeNull();
    expect(uniqueViolationIndex({ code: "P2002" })).toBeNull();
    expect(uniqueViolationIndex({ code: "P2002", meta: { target: ["exerciseId"] } })).toBeNull();
    expect(uniqueViolationIndex(new Error("boom"))).toBeNull();
    expect(uniqueViolationIndex(null)).toBeNull();
  });
});

describe("backstopCode: only the two backstop indexes map to a rule", () => {
  it("one live estimate per exercise (OD-2) reads LIVE_ESTIMATE_EXISTS", () => {
    expect(backstopCode(adapterError("CompanyEstimate_one_live_per_exercise", ["exerciseId"]))).toBe("LIVE_ESTIMATE_EXISTS");
  });

  it("one draft bill per exercise reads DRAFT_EXISTS", () => {
    expect(backstopCode(adapterError("BqVersion_one_draft_per_exercise", ["exerciseId"], "BqVersion"))).toBe("DRAFT_EXISTS");
  });

  it("any other unique violation is not a rule's refusal: null, so the caller rethrows", () => {
    expect(backstopCode(adapterError("BqVersion_exerciseId_versionNo_key", ["exerciseId", "versionNo"], "BqVersion"))).toBeNull();
    expect(backstopCode(adapterError("Qualification_organisationId_code_key", ["organisationId", "code"], "Qualification"))).toBeNull();
    // A column list alone never decides it: CompanyEstimate's exerciseId could be another index.
    expect(backstopCode({ code: "P2002", meta: { modelName: "CompanyEstimate", driverAdapterError: { cause: { constraint: { fields: ['"exerciseId"'] } } } } })).toBeNull();
    expect(backstopCode({ code: "P2002", meta: { target: "toString" } })).toBeNull();
  });
});
