import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";

import { OUTCOMES, SIDES, otherSide } from "./types";

/** The workspace's vocabulary equals the schema's enums (step 1), in order, so the rules and the database never drift apart. */

const schema = readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8");
const values = (name: string) => {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1]!.split("\n").map((l) => l.replace(/\/\/\/.*$/, "").replace(/\/\/.*$/, "").trim()).filter(Boolean);
};

describe("the vocabulary matches the schema", () => {
  it("ProjectSide", () => expect([...SIDES]).toEqual(values("ProjectSide")));
  it("ProjectDocumentOutcome", () => expect([...OUTCOMES]).toEqual(values("ProjectDocumentOutcome")));
  it("the six kinds are ContractorSubmissionKind's (ProjectDocument.kind reuses it)", () => expect([...SUBMISSION_KINDS]).toEqual(values("ContractorSubmissionKind")));
  it("the other side of each side", () => {
    expect(otherSide("CONTRACTOR")).toBe("ORGANISATION");
    expect(otherSide("ORGANISATION")).toBe("CONTRACTOR");
  });
});
