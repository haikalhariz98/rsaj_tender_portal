import { describe, expect, it } from "vitest";

import { DOWNLOAD_WORDS, downloadFaults } from "./grants";

/**
 * Who may download a sealed file at the opening check (ADR 0036 D10, rulings 20n, 20t).
 */

describe("a download at the opening check (D10, 20n, 20t)", () => {
  const ok = { actorIsNamedOfficer: true, actorIsAdministrator: false, unsealed: true, finalised: false, use: "OPENING_CHECK" as const, bidStatus: "OPENED" as const };
  it("is a named officer's, after the unseal and before finalising, of an opening-check part of an opened bid", () => expect(downloadFaults(ok)).toEqual([]));
  it.each([
    [{ actorIsNamedOfficer: false }, "NOT_NAMED_OFFICER"],
    [{ actorIsAdministrator: true }, "ADMINISTRATOR"],
    [{ unsealed: false }, "NOT_UNSEALED"],
    [{ finalised: true }, "FINALISED_USE_DOCUMENTS"],
    [{ use: "FINALISE" as const }, "NOT_OPENING_CHECK_PART"],
    [{ bidStatus: "SUBMITTED" as const }, "NOT_OPENED"],
    [{ bidStatus: "REPLACED" as const }, "NOT_OPENED"],
  ] as const)("refused: %o gives %s", (over, fault) => expect(downloadFaults({ ...ok, ...over })).toEqual([fault]));
  it("an administrator who is somehow named is still refused, with both reasons", () => {
    expect(downloadFaults({ ...ok, actorIsAdministrator: true })).toEqual(["ADMINISTRATOR"]);
    expect(downloadFaults({ ...ok, actorIsNamedOfficer: false, actorIsAdministrator: true })).toEqual(["NOT_NAMED_OFFICER", "ADMINISTRATOR"]);
  });
  it("each refusal has words", () => {
    for (const w of Object.values(DOWNLOAD_WORDS)) expect(w.length).toBeGreaterThan(10);
  });
});
