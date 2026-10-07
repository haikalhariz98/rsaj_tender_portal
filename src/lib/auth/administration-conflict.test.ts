import { describe, expect, it } from "vitest";

import { administrationConflict, holdingsInWords, type AdministratorAct, type HoldingKind } from "./administration-conflict";

const none = { offices: 0, seats: 0, delegations: 0 };

describe("making a Person an administrator (ADR 0034 D9)", () => {
  it("is allowed for a Person who holds nothing", () => {
    expect(administrationConflict({ kind: "MAKE_ADMINISTRATOR", holdings: none })).toBeNull();
  });

  it.each([
    ["an office", { ...none, offices: 1 }, /1 office\b/],
    ["a committee seat", { ...none, seats: 1 }, /1 committee seat\b/],
    ["a delegation", { ...none, delegations: 1 }, /1 delegation\b/],
    ["all three", { offices: 2, seats: 1, delegations: 3 }, /2 offices, 1 committee seat, 3 delegations/],
  ])("is refused for a Person who holds %s, and says what they hold", (_name, holdings, says) => {
    const fault = administrationConflict({ kind: "MAKE_ADMINISTRATOR", holdings });
    expect(fault?.code).toBe("ADMINISTRATOR_HOLDS_NOTHING");
    expect(fault?.en).toMatch(says);
    expect(fault?.en).toMatch(/Give the administrator a person of their own/);
    expect(fault?.ms.length).toBeGreaterThan(20);
  });

  it("keeps the words the bootstrap command has always said", () => {
    expect(administrationConflict({ kind: "MAKE_ADMINISTRATOR", holdings: { ...none, offices: 1 } })?.en).toBe(
      "This person holds 1 office. An administrator holds no office, seat or delegation, so that administration stays apart from transactions. Give the administrator a person of their own.",
    );
  });

  it("counts nothing for a holding of zero, and says nothing about it", () => {
    expect(holdingsInWords(none)).toBeNull();
    expect(holdingsInWords({ ...none, seats: 2 })).toEqual({ en: "2 committee seats", ms: "2 kerusi jawatankuasa" });
  });
});

describe("giving a holding to a Person whose account is an administrator's", () => {
  const kinds: HoldingKind[] = ["OFFICE", "SEAT", "DELEGATION"];

  it.each(kinds)("is refused for %s, in both languages", (holding) => {
    const fault = administrationConflict({ kind: "GIVE_HOLDING", holding, personIsAdministrator: true });
    expect(fault?.code).toBe("ADMINISTRATOR_CANNOT_HOLD");
    expect(fault?.en).toMatch(/administrator/);
    expect(fault?.ms).toMatch(/pentadbir/);
  });

  it.each(kinds)("is allowed for %s to anyone else", (holding) => {
    expect(administrationConflict({ kind: "GIVE_HOLDING", holding, personIsAdministrator: false })).toBeNull();
  });

  it("names the kind it refuses", () => {
    const text = (holding: HoldingKind) => administrationConflict({ kind: "GIVE_HOLDING", holding, personIsAdministrator: true })?.en;
    expect(text("OFFICE")).toContain("an office cannot be given");
    expect(text("SEAT")).toContain("a committee seat cannot be given");
    expect(text("DELEGATION")).toContain("a delegation cannot be given");
  });
});

describe("an administrator account attempting an act that needs a holder", () => {
  const acts: AdministratorAct[] = ["HOLDER_CHECKED", "SIGNATURE", "UNSEAL"];

  it.each(acts)("is refused for %s", (act) => {
    const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: true });
    expect(fault?.code).toBe("ADMINISTRATOR_CANNOT_ACT");
    expect(fault?.en).toMatch(/Sign in as the person who holds the office/);
  });

  it.each(acts)("is allowed for %s to everyone who is not an administrator", (act) => {
    expect(administrationConflict({ kind: "ACT", act, actorIsAdministrator: false })).toBeNull();
  });
});
