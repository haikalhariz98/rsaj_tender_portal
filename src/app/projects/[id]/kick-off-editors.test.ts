import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/projects/[id]/kick-off-actions", () => ({}));
vi.mock("@/app/projects/[id]/document-actions", () => ({}));

import { withOtherNames } from "./kick-off-editors";

describe("the other names typed in the held drawer", () => {
  it("become one otherName each, blank lines dropped, the rest of the form kept", () => {
    const f = new FormData();
    f.set("contractId", "c1");
    f.set("otherNames", "Mr Tan\r\n\n  \n Ms Lee ");
    const next = withOtherNames(f);
    expect(next.getAll("otherName")).toEqual(["Mr Tan", "Ms Lee"]);
    expect(next.has("otherNames")).toBe(false);
    expect(next.get("contractId")).toBe("c1");
  });

  it("none typed posts none", () => {
    const f = new FormData();
    f.set("otherNames", "   ");
    expect(withOtherNames(f).getAll("otherName")).toEqual([]);
  });
});
