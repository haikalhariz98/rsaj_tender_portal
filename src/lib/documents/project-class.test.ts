import { describe, expect, it } from "vitest";

import { eligibleProjectClasses, PROJECT_CLASS_NOT_OURS, PROJECT_CLASS_SULIT, PROJECT_CLASS_UNCLASSIFIED, projectClassFault } from "./project-class";

describe("the class for project files", () => {
  it("refuses a class that is not the organisation's, an unclassified one and a SULIT one, in the plan's words", () => {
    expect(projectClassFault(null)).toBe("Choose one of this organisation's document classes.");
    expect(projectClassFault({ classification: null })).toBe(PROJECT_CLASS_UNCLASSIFIED);
    expect(PROJECT_CLASS_UNCLASSIFIED).toBe("Set this class's classification first. A project file is downloaded by the contractor, so its class must be classified.");
    expect(projectClassFault({ classification: "SULIT" })).toBe(PROJECT_CLASS_SULIT);
    expect(PROJECT_CLASS_SULIT).toBe("A contractor downloads project files, so their class cannot be SULIT. Choose another class.");
    expect(PROJECT_CLASS_NOT_OURS).toMatch(/this organisation's/);
  });

  it("accepts every other classification", () => {
    expect(projectClassFault({ classification: "PUBLIC" })).toBeNull();
    expect(projectClassFault({ classification: "INTERNAL" })).toBeNull();
  });

  it("offers only classified, non-SULIT classes", () => {
    const rows = [{ id: "a", classification: null }, { id: "b", classification: "SULIT" as const }, { id: "c", classification: "INTERNAL" as const }];
    expect(eligibleProjectClasses(rows).map((r) => r.id)).toEqual(["c"]);
  });
});
