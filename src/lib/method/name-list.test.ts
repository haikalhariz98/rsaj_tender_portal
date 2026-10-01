import { describe, expect, it } from "vitest";

import { nameListFault } from "@/lib/window/invitees";

import { nameRequestFault } from "./approval";
import { SPEC_METHODS } from "./fixture";
import { findingText } from "./labels";
import type { Method } from "./types";

/**
 * 6.5 (ADR 0015, BD-4 extended): the name may be asked for until the list is invited — in draft,
 * in preparation, with approval for tendering and approved for tendering — never once published,
 * and never with no list to freeze.
 */

const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;

describe("asking for the name's approval", () => {
  it("is open from draft to approved for tendering", () => {
    for (const s of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) expect(nameRequestFault(s, m("selected_tender"), [], "2026-10-01")).toBeNull();
  });
  it("is refused once published: the invited list is frozen, with its exit", () => {
    for (const s of ["ADVERTISED", "INVITED"] as const) {
      const f = nameRequestFault(s, m("selected_tender"), [], "2026-10-01");
      expect(f?.code).toBe("NAME_LIST_FROZEN");
      expect(findingText(f!)).toMatch(/cancel the exercise and open a replacement/);
    }
  });
  it("needs a list to freeze", () => {
    expect(nameListFault([])?.code).toBe("NAME_NO_INVITEES");
    expect(findingText(nameListFault([])!)).toMatch(/Add the invitees/);
    expect(nameListFault([{ registrationNo: "A1" }])).toBeNull();
  });
});
