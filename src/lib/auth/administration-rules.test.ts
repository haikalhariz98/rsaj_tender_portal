import { describe, expect, it } from "vitest";

import { createAccountFaults, disableFaults, enableFaults, issueCodeFaults, leaverFaults, officeHolderNotice, unlockFaults } from "./administration-rules";

const codes = (faults: { code: string }[]) => faults.map((f) => f.code);
const NOW = new Date("2026-10-06T10:00:00Z");

describe("creating an account", () => {
  const ok = { isAdministrator: true, loginNameValid: true, loginNameTaken: false, person: { isActive: true, hasAccount: false } };
  it("is for an administrator, for a person on record who is active and has none, with a free and well-formed name", () => {
    expect(createAccountFaults(ok)).toEqual({});
    expect(createAccountFaults({ ...ok, isAdministrator: false })["*"]?.code).toBe("NOT_ADMINISTRATOR");
    expect(createAccountFaults({ ...ok, person: null }).personId?.code).toBe("NO_SUCH_PERSON");
    expect(createAccountFaults({ ...ok, person: { isActive: false, hasAccount: false } }).personId?.code).toBe("PERSON_INACTIVE");
    expect(createAccountFaults({ ...ok, person: { isActive: true, hasAccount: true } }).personId?.code).toBe("PERSON_HAS_ACCOUNT");
    expect(createAccountFaults({ ...ok, loginNameValid: false }).loginName?.code).toBe("BAD_LOGIN_NAME");
    expect(createAccountFaults({ ...ok, loginNameTaken: true }).loginName?.code).toBe("LOGIN_NAME_TAKEN");
  });
  it("says each fault in both languages", () => {
    for (const f of Object.values(createAccountFaults({ isAdministrator: false, loginNameValid: false, loginNameTaken: false, person: null }))) {
      expect(f!.en.length).toBeGreaterThan(10);
      expect(f!.ms.length).toBeGreaterThan(10);
    }
  });
});

describe("disabling an account", () => {
  const target = { id: "a2", status: "ACTIVE" as const, isAdministrator: false };
  const ok = { isAdministrator: true, actorAccountId: "a1", target, activeAdministrators: 2, reason: "left the unit" };
  it("needs an administrator, a reason, and an account that is not the actor's own", () => {
    expect(disableFaults(ok)).toEqual([]);
    expect(codes(disableFaults({ ...ok, isAdministrator: false }))).toEqual(["NOT_ADMINISTRATOR"]);
    expect(codes(disableFaults({ ...ok, target: null }))).toEqual(["NO_SUCH_ACCOUNT"]);
    expect(codes(disableFaults({ ...ok, reason: "  " }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(disableFaults({ ...ok, target: { ...target, id: "a1" } }))).toEqual(["OWN_ACCOUNT"]);
    expect(codes(disableFaults({ ...ok, target: { ...target, status: "DISABLED" } }))).toEqual(["ALREADY_DISABLED"]);
  });
  it("never disables the only active administrator, who could not then be replaced", () => {
    expect(codes(disableFaults({ ...ok, target: { ...target, isAdministrator: true }, activeAdministrators: 1 }))).toEqual(["LAST_ADMINISTRATOR"]);
    expect(disableFaults({ ...ok, target: { ...target, isAdministrator: true }, activeAdministrators: 2 })).toEqual([]);
    // An administrator already waiting or disabled is not one of the active ones.
    expect(disableFaults({ ...ok, target: { ...target, isAdministrator: true, status: "PENDING_ACTIVATION" }, activeAdministrators: 1 })).toEqual([]);
  });
});

describe("making a person inactive, which disables their account (Phase 1b review)", () => {
  const account = { id: "a2", status: "ACTIVE" as const, isAdministrator: false };
  const ok = { isAdministrator: true, actorAccountId: "a1", account, activeAdministrators: 2 };
  it("is an administrator's act: anyone else is refused, whoever the person is", () => {
    expect(leaverFaults(ok)).toEqual([]);
    expect(codes(leaverFaults({ ...ok, isAdministrator: false }))).toEqual(["NOT_ADMINISTRATOR_FOR_LEAVER"]);
    expect(codes(leaverFaults({ ...ok, isAdministrator: false, account: { ...account, isAdministrator: true } }))).toEqual(["NOT_ADMINISTRATOR_FOR_LEAVER"]);
    for (const f of leaverFaults({ ...ok, isAdministrator: false })) expect(f.ms.length).toBeGreaterThan(10);
  });
  it("is never one's own account, and never the only active administrator's", () => {
    expect(codes(leaverFaults({ ...ok, account: { ...account, id: "a1" } }))).toEqual(["OWN_ACCOUNT"]);
    expect(codes(leaverFaults({ ...ok, account: { ...account, isAdministrator: true }, activeAdministrators: 1 }))).toEqual(["LAST_ADMINISTRATOR"]);
    expect(leaverFaults({ ...ok, account: { ...account, isAdministrator: true }, activeAdministrators: 2 })).toEqual([]);
  });
  it("asks nothing where there is no account, or it is already disabled, even of a person who is not an administrator", () => {
    expect(leaverFaults({ ...ok, isAdministrator: false, account: null })).toEqual([]);
    expect(leaverFaults({ ...ok, isAdministrator: false, account: { ...account, status: "DISABLED" } })).toEqual([]);
  });
});

describe("putting a disabled account back", () => {
  it("needs a disabled account of a person who is active again, and a reason", () => {
    const ok = { isAdministrator: true, target: { status: "DISABLED" as const, personActive: true }, reason: "returned" };
    expect(enableFaults(ok)).toEqual([]);
    expect(codes(enableFaults({ ...ok, target: { status: "ACTIVE", personActive: true } }))).toEqual(["NOT_DISABLED"]);
    expect(codes(enableFaults({ ...ok, target: { status: "DISABLED", personActive: false } }))).toEqual(["PERSON_INACTIVE"]);
    expect(codes(enableFaults({ ...ok, reason: "" }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(enableFaults({ ...ok, isAdministrator: false }))).toEqual(["NOT_ADMINISTRATOR"]);
  });
});

describe("unlocking an account", () => {
  const ok = { isAdministrator: true, target: { failedAttempts: 3, lockedUntil: null }, reason: "rang the desk", now: NOW };
  it("needs something to clear (a lock in force, or wrong passwords counted) and a reason", () => {
    expect(unlockFaults(ok)).toEqual([]);
    expect(unlockFaults({ ...ok, target: { failedAttempts: 0, lockedUntil: new Date("2026-10-06T11:00:00Z") } })).toEqual([]);
    expect(codes(unlockFaults({ ...ok, target: { failedAttempts: 0, lockedUntil: new Date("2026-10-06T09:00:00Z") } }))).toEqual(["NOT_LOCKED"]);
    expect(codes(unlockFaults({ ...ok, target: { failedAttempts: 0, lockedUntil: null } }))).toEqual(["NOT_LOCKED"]);
    expect(codes(unlockFaults({ ...ok, reason: "" }))).toEqual(["REASON_REQUIRED"]);
  });
});

describe("issuing a code", () => {
  const target = { id: "a2", status: "PENDING_ACTIVATION" as const, personActive: true };
  const ok = { isAdministrator: true, actorAccountId: "a1", target, purpose: "ACTIVATION" as const, reason: "new starter" };
  it("an activation code is for an account waiting to be activated, a reset code for an active one: the table redeeming a code judges by", () => {
    expect(issueCodeFaults(ok)).toEqual([]);
    expect(issueCodeFaults({ ...ok, target: { ...target, status: "ACTIVE" }, purpose: "RESET" })).toEqual([]);
    expect(codes(issueCodeFaults({ ...ok, target: { ...target, status: "ACTIVE" } }))).toEqual(["NOT_AWAITING_ACTIVATION"]);
    expect(codes(issueCodeFaults({ ...ok, purpose: "RESET" }))).toEqual(["NOT_ACTIVE"]);
    expect(codes(issueCodeFaults({ ...ok, target: { ...target, status: "DISABLED" }, purpose: "RESET" }))).toEqual(["NOT_ACTIVE"]);
  });
  it("nobody issues a code for their own account, and the reason is required", () => {
    expect(codes(issueCodeFaults({ ...ok, target: { ...target, id: "a1", status: "ACTIVE" }, purpose: "RESET" }))).toEqual(["OWN_ACCOUNT"]);
    expect(codes(issueCodeFaults({ ...ok, reason: "  " }))).toEqual(["REASON_REQUIRED"]);
  });
  it("is for an administrator, and not for a person who has left", () => {
    expect(codes(issueCodeFaults({ ...ok, isAdministrator: false }))).toEqual(["NOT_ADMINISTRATOR"]);
    expect(codes(issueCodeFaults({ ...ok, target: { ...target, personActive: false } }))).toEqual(["PERSON_INACTIVE"]);
  });
});

describe("the notice beside an office holder's account", () => {
  it("says nothing for a person who holds nothing, and says the second-person check is not built for one who does", () => {
    expect(officeHolderNotice({ offices: 0, seats: 0, delegations: 0 })).toBeNull();
    const n = officeHolderNotice({ offices: 2, seats: 1, delegations: 0 })!;
    expect(n).toContain("2 offices, 1 committee seat");
    expect(n).toContain("not built yet");
    expect(n).not.toMatch(/\bapproved\b/);
  });
});
