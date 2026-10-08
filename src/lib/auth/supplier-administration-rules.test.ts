import { describe, expect, it } from "vitest";

import { accountStateWords, IDENTITY_CHECK_MAX, identityCheckFault, issueSupplierCodeFaults, openAccountFaults, unlockSupplierFaults } from "./supplier-administration-rules";

const liveContact = { retired: false, hasAccount: false };
const open = (o: Partial<Parameters<typeof openAccountFaults>[0]> = {}) =>
  openAccountFaults({ permitted: true, loginName: "aini.sampel", loginNameTaken: false, identityCheck: "Seen at the counter", contact: liveContact, ...o });

describe("opening a supplier's portal account", () => {
  it("passes for a permitted officer, a live contact without an account, a good free name and a recorded identity check", () => {
    expect(open()).toEqual({});
  });

  it("is the permission's alone: without it nothing else is judged first", () => {
    expect(open({ permitted: false })["*"]?.code).toBe("SUPPLIER_ACCOUNTS_NOT_PERMITTED");
  });

  it("refuses a contact that is not there, is retired or already has an account, each in words", () => {
    expect(open({ contact: null })["*"]?.code).toBe("NO_SUCH_CONTACT");
    expect(open({ contact: { retired: true, hasAccount: false } })["*"]?.code).toBe("CONTACT_RETIRED");
    expect(open({ contact: { retired: false, hasAccount: true } })["*"]?.code).toBe("CONTACT_HAS_ACCOUNT");
    // A contact that is retired and has an account is retired first: the account is already disabled.
    expect(open({ contact: { retired: true, hasAccount: true } })["*"]?.code).toBe("CONTACT_RETIRED");
  });

  it("holds the sign-in name to the staff store's rule, and refuses a taken one", () => {
    for (const bad of ["", "ab", "a b", "-leading", "x".repeat(65), "has/slash"]) expect(open({ loginName: bad }).loginName?.code, bad).toBe("BAD_LOGIN_NAME");
    for (const good of ["abc", "aini.sampel", "aini@sampel.example", "A_b-c"]) expect(open({ loginName: good }).loginName, good).toBeUndefined();
    expect(open({ loginNameTaken: true }).loginName?.code).toBe("LOGIN_NAME_TAKEN");
  });

  it("will not open an account without the officer's word on how the caller's identity was checked", () => {
    expect(open({ identityCheck: "" }).identityCheck?.code).toBe("IDENTITY_CHECK_REQUIRED");
    expect(open({ identityCheck: "   \n " }).identityCheck?.code).toBe("IDENTITY_CHECK_REQUIRED");
    expect(open({ identityCheck: "x".repeat(IDENTITY_CHECK_MAX + 1) }).identityCheck?.code).toBe("IDENTITY_CHECK_TOO_LONG");
    expect(open({ identityCheck: "x".repeat(IDENTITY_CHECK_MAX) }).identityCheck).toBeUndefined();
    expect(identityCheckFault("Called back on the number on the certificate")).toBeNull();
  });

  it("says every fault in both languages and never as a code", () => {
    const all = Object.values(open({ permitted: false, loginName: "a b", identityCheck: "", contact: null }));
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const f of all) {
      expect(f!.en).toBeTruthy();
      expect(f!.ms).toBeTruthy();
      expect(f!.en).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
    }
  });
});

describe("issuing a code for an existing account", () => {
  const issue = (o: Partial<Parameters<typeof issueSupplierCodeFaults>[0]> = {}) =>
    issueSupplierCodeFaults({ permitted: true, target: { status: "ACTIVE", contactRetired: false }, purpose: "RESET", identityCheck: "Called back", ...o }).map((f) => f.code);

  it("an activation code is for an account waiting for it, and a reset code for an active one", () => {
    expect(issue({ purpose: "RESET", target: { status: "ACTIVE", contactRetired: false } })).toEqual([]);
    expect(issue({ purpose: "ACTIVATION", target: { status: "PENDING_ACTIVATION", contactRetired: false } })).toEqual([]);
    expect(issue({ purpose: "ACTIVATION", target: { status: "ACTIVE", contactRetired: false } })).toEqual(["NOT_AWAITING_ACTIVATION"]);
    expect(issue({ purpose: "ACTIVATION", target: { status: "DISABLED", contactRetired: false } })).toEqual(["NOT_AWAITING_ACTIVATION"]);
    expect(issue({ purpose: "RESET", target: { status: "PENDING_ACTIVATION", contactRetired: false } })).toEqual(["NOT_ACTIVE"]);
    expect(issue({ purpose: "RESET", target: { status: "DISABLED", contactRetired: false } })).toEqual(["NOT_ACTIVE"]);
  });

  it("is refused without the permission, for no account, for a retired contact, and without the identity check", () => {
    expect(issue({ permitted: false })).toEqual(["SUPPLIER_ACCOUNTS_NOT_PERMITTED"]);
    expect(issue({ target: null })).toEqual(["NO_SUCH_SUPPLIER_ACCOUNT"]);
    expect(issue({ target: { status: "ACTIVE", contactRetired: true } })).toEqual(["CONTACT_RETIRED"]);
    expect(issue({ identityCheck: "" })).toEqual(["IDENTITY_CHECK_REQUIRED"]);
    expect(issue({ target: { status: "ACTIVE", contactRetired: true }, identityCheck: "" })).toEqual(["CONTACT_RETIRED", "IDENTITY_CHECK_REQUIRED"]);
  });
});

describe("unlocking an account", () => {
  const now = new Date("2026-10-12T08:00:00Z");
  const unlock = (o: Partial<Parameters<typeof unlockSupplierFaults>[0]> = {}) =>
    unlockSupplierFaults({ permitted: true, target: { failedAttempts: 2, lockedUntil: null }, identityCheck: "Seen", now, ...o }).map((f) => f.code);

  it("unlocks a locked account, or one with wrong passwords counted, and only those", () => {
    expect(unlock({ target: { failedAttempts: 5, lockedUntil: new Date(now.getTime() + 60_000) } })).toEqual([]);
    expect(unlock({ target: { failedAttempts: 2, lockedUntil: null } })).toEqual([]);
    expect(unlock({ target: { failedAttempts: 0, lockedUntil: null } })).toEqual(["NOT_LOCKED"]);
    // A lock that has run its course is not a lock.
    expect(unlock({ target: { failedAttempts: 0, lockedUntil: new Date(now.getTime() - 1) } })).toEqual(["NOT_LOCKED"]);
  });

  it("is the permission's, needs the identity check, and needs an account", () => {
    expect(unlock({ permitted: false })).toEqual(["SUPPLIER_ACCOUNTS_NOT_PERMITTED"]);
    expect(unlock({ target: null })).toEqual(["NO_SUCH_SUPPLIER_ACCOUNT"]);
    expect(unlock({ identityCheck: " " })).toEqual(["IDENTITY_CHECK_REQUIRED"]);
  });
});

describe("an account in words", () => {
  it("says its state and a lock, never the state's name", () => {
    expect(accountStateWords({ status: "ACTIVE", locked: false }).en).toBe("Active");
    expect(accountStateWords({ status: "ACTIVE", locked: true }).en).toMatch(/locked/);
    expect(accountStateWords({ status: "PENDING_ACTIVATION", locked: false }).en).toMatch(/activation code/);
    expect(accountStateWords({ status: "DISABLED", locked: true }).en).toBe("Disabled");
    for (const status of ["ACTIVE", "PENDING_ACTIVATION", "DISABLED"] as const) expect(accountStateWords({ status, locked: false }).ms).toBeTruthy();
  });
});
