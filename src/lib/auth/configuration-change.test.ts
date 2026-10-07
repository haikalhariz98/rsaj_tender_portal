import { describe, expect, it } from "vitest";

import { CHANGE_KINDS, decisionFaults, isStale, KIND_PERMISSION, KIND_WORDS, parseChange, planChange, secondPersonFault, snapshot, type LiveState, type ParsedChange } from "./configuration-change";
import { EMPTY_POLICY } from "./policy";
import type { PermissionKey, SecurityPolicyValues } from "./types";

const policy = (over: Partial<SecurityPolicyValues> = {}): SecurityPolicyValues => ({ ...EMPTY_POLICY, staffIdleMinutes: 30, staffAbsoluteMinutes: 480, passwordMinLength: 12, addressThrottleMinutes: 30, ...over });
const parsed = (kind: Parameters<typeof parseChange>[0], raw: unknown): ParsedChange => {
  const r = parseChange(kind, raw);
  if (!r.ok) throw new Error(JSON.stringify(r.faults));
  return r.change;
};
const fields = (kind: Parameters<typeof parseChange>[0], raw: unknown) => {
  const r = parseChange(kind, raw);
  return r.ok ? [] : r.faults.map((f) => `${f.field}:${f.code}`);
};

describe("parsing a change narrows it and refuses what it does not know", () => {
  it("refuses a payload that is not an object", () => {
    for (const raw of [null, "x", 3, [], undefined]) expect(fields("SECURITY_POLICY", raw)).toEqual(["*:NOT_AN_OBJECT"]);
  });

  it("refuses an unknown field, in every kind", () => {
    expect(fields("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "FD", decision: "GRANTED", extra: 1 })).toEqual(["extra:UNKNOWN_FIELD"]);
    expect(fields("ADMINISTRATOR_GRANT", { accountId: "a", isAdministrator: true })).toEqual(["isAdministrator:UNKNOWN_FIELD"]);
    expect(fields("ACCOUNT_CODE", { accountId: "a", purpose: "RESET", code: "x" })).toEqual(["code:UNKNOWN_FIELD"]);
    expect(fields("SECURITY_POLICY", { changes: { passwordMinLength: 12 }, note: "x" })).toEqual(["note:UNKNOWN_FIELD"]);
  });

  describe("sign-in settings", () => {
    it("takes whole numbers in the settings' own ranges, and the two named choices", () => {
      expect(parsed("SECURITY_POLICY", { changes: { passwordMinLength: 14, concurrentSessionAction: "REFUSE_NEW", paperSignatureRecording: "ALLOWED" } }).payload).toEqual({
        changes: { passwordMinLength: 14, concurrentSessionAction: "REFUSE_NEW", paperSignatureRecording: "ALLOWED" },
      });
    });

    it("refuses a setting that does not exist, a number out of range, a string for a number, and clearing a setting", () => {
      expect(fields("SECURITY_POLICY", { changes: { colour: 1 } })).toEqual(["colour:UNKNOWN_SETTING"]);
      expect(fields("SECURITY_POLICY", { changes: { passwordMinLength: 7 } })).toEqual(["passwordMinLength:OUT_OF_RANGE"]);
      expect(fields("SECURITY_POLICY", { changes: { staffIdleMinutes: 1.5 } })).toEqual(["staffIdleMinutes:OUT_OF_RANGE"]);
      expect(fields("SECURITY_POLICY", { changes: { staffIdleMinutes: "30" } })).toEqual(["staffIdleMinutes:NOT_A_NUMBER"]);
      expect(fields("SECURITY_POLICY", { changes: { staffIdleMinutes: null } })).toEqual(["staffIdleMinutes:NOT_A_NUMBER"]);
      expect(fields("SECURITY_POLICY", { changes: { paperSignatureRecording: "MAYBE" } })).toEqual(["paperSignatureRecording:BAD_CHOICE"]);
    });

    it("needs at least one setting", () => {
      expect(fields("SECURITY_POLICY", { changes: {} })).toEqual(["changes:NO_CHANGES"]);
      expect(fields("SECURITY_POLICY", {})).toEqual(["changes:NO_CHANGES"]);
    });
  });

  describe("permission grants", () => {
    it("takes a known, grantable key, a role and a decision, and undecided is a decision (it removes the row)", () => {
      expect(parsed("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "FD", decision: "UNDECIDED" }).payload).toEqual({ permissionKey: "audit.read", roleCode: "FD", decision: "UNDECIDED" });
    });

    it("refuses an unknown key, an administrator-only key, a missing role and a bad decision", () => {
      expect(fields("PERMISSION_GRANT", { permissionKey: "toString", roleCode: "FD", decision: "GRANTED" })).toEqual(["permissionKey:UNKNOWN_PERMISSION"]);
      expect(fields("PERMISSION_GRANT", { permissionKey: "accounts.manage", roleCode: "FD", decision: "GRANTED" })).toEqual(["permissionKey:NOT_GRANTABLE"]);
      expect(fields("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: " ", decision: "GRANTED" })).toEqual(["roleCode:ROLE_REQUIRED"]);
      expect(fields("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "FD", decision: "ALLOW" })).toEqual(["decision:BAD_DECISION"]);
    });
  });

  it("takes an account, and for a code its purpose", () => {
    expect(parsed("ADMINISTRATOR_GRANT", { accountId: "a1" }).payload).toEqual({ accountId: "a1" });
    expect(fields("ADMINISTRATOR_REVOKE", {})).toEqual(["accountId:ACCOUNT_REQUIRED"]);
    expect(fields("ACCOUNT_CODE", { accountId: "a1", purpose: "FORGET" })).toEqual(["purpose:BAD_PURPOSE"]);
  });

  it("names every kind in words", () => {
    for (const k of CHANGE_KINDS) {
      expect(KIND_WORDS[k].en.length).toBeGreaterThan(10);
      expect(KIND_WORDS[k].en).not.toMatch(/[A-Z]_[A-Z]/);
    }
  });
});

describe("the snapshot and the STALE check", () => {
  const change = parsed("SECURITY_POLICY", { changes: { passwordMinLength: 14, staffIdleMinutes: 20 } });

  it("holds what the change touches as the proposer saw it", () => {
    expect(snapshot(change, { kind: "SECURITY_POLICY", policy: policy() })).toEqual({ passwordMinLength: 12, staffIdleMinutes: 30 });
  });

  it("holds an unset setting as null, and no policy at all as every touched setting null", () => {
    expect(snapshot(change, { kind: "SECURITY_POLICY", policy: policy({ staffIdleMinutes: null }) })).toEqual({ passwordMinLength: 12, staffIdleMinutes: null });
    expect(snapshot(change, { kind: "SECURITY_POLICY", policy: null })).toEqual({ passwordMinLength: null, staffIdleMinutes: null });
  });

  it("is not stale while the live values read as before, whatever the order of the keys", () => {
    expect(isStale({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  it("is stale when any touched value moved after the proposal, in either direction", () => {
    const before = snapshot(change, { kind: "SECURITY_POLICY", policy: policy() });
    expect(isStale(before, snapshot(change, { kind: "SECURITY_POLICY", policy: policy({ passwordMinLength: 13 }) }))).toBe(true);
    expect(isStale(before, snapshot(change, { kind: "SECURITY_POLICY", policy: policy({ staffIdleMinutes: null }) }))).toBe(true);
  });

  it("is not stale because of a setting the change does not touch", () => {
    const before = snapshot(change, { kind: "SECURITY_POLICY", policy: policy() });
    expect(isStale(before, snapshot(change, { kind: "SECURITY_POLICY", policy: policy({ lockoutMinutes: 5 }) }))).toBe(false);
  });

  it("is stale for a permission whose decision moved, and an account whose standing moved", () => {
    const grant = parsed("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "FD", decision: "GRANTED" });
    expect(isStale(snapshot(grant, { kind: "PERMISSION_GRANT", decision: "UNDECIDED", roleExists: true }), snapshot(grant, { kind: "PERMISSION_GRANT", decision: "WITHHELD", roleExists: true }))).toBe(true);
    const make = parsed("ADMINISTRATOR_GRANT", { accountId: "a1" });
    const live = (status: "ACTIVE" | "DISABLED"): LiveState => ({ kind: "ADMINISTRATOR_GRANT", account: { isAdministrator: false, status, personActive: true }, holdings: { offices: 0, seats: 0, delegations: 0 } });
    expect(isStale(snapshot(make, live("ACTIVE")), snapshot(make, live("ACTIVE")))).toBe(false);
    expect(isStale(snapshot(make, live("ACTIVE")), snapshot(make, live("DISABLED")))).toBe(true);
  });

  it("is stale for an account that was deleted from under the proposal", () => {
    const code = parsed("ACCOUNT_CODE", { accountId: "a1", purpose: "RESET" });
    const there: LiveState = { kind: "ACCOUNT_CODE", account: { isAdministrator: false, status: "ACTIVE", personActive: true }, holdsOffice: true };
    expect(isStale(snapshot(code, there), snapshot(code, { kind: "ACCOUNT_CODE", account: null, holdsOffice: false }))).toBe(true);
  });
});

describe("applying runs the rules of the kind on the live state", () => {
  const none = { offices: 0, seats: 0, delegations: 0 };
  const active = { isAdministrator: false, status: "ACTIVE", personActive: true } as const;

  it("a settings change records what moved, and refuses a combination the settings do not allow", () => {
    const change = parsed("SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    const ok = planChange(change, { kind: "SECURITY_POLICY", policy: policy() });
    expect(ok).toMatchObject({ ok: true, after: { staffIdleMinutes: 20 }, changes: [{ field: "staffIdleMinutes", before: "30", after: "20" }] });
    const tooLong = planChange(parsed("SECURITY_POLICY", { changes: { staffIdleMinutes: 600 } }), { kind: "SECURITY_POLICY", policy: policy() });
    expect(tooLong).toMatchObject({ ok: false, faults: [{ code: "POLICY_FAULT" }] });
  });

  it("a settings change with no policy to change is refused: the first are set by the bootstrap command", () => {
    expect(planChange(parsed("SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } }), { kind: "SECURITY_POLICY", policy: null })).toMatchObject({ ok: false, faults: [{ code: "NO_POLICY" }] });
  });

  it("a grant records the decision, and refuses a role that is gone and a change that changes nothing", () => {
    const change = parsed("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "FD", decision: "GRANTED" });
    expect(planChange(change, { kind: "PERMISSION_GRANT", decision: "UNDECIDED", roleExists: true })).toMatchObject({ ok: true, changes: [{ field: "decision", before: "UNDECIDED", after: "GRANTED" }] });
    expect(planChange(change, { kind: "PERMISSION_GRANT", decision: "GRANTED", roleExists: true })).toMatchObject({ ok: false, faults: [{ code: "NO_CHANGE" }] });
    expect(planChange(change, { kind: "PERMISSION_GRANT", decision: "UNDECIDED", roleExists: false })).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_ROLE" }] });
  });

  it("making an administrator is refused for a person who holds an office, and for an account not active", () => {
    const change = parsed("ADMINISTRATOR_GRANT", { accountId: "a1" });
    expect(planChange(change, { kind: "ADMINISTRATOR_GRANT", account: active, holdings: none })).toMatchObject({ ok: true, changes: [{ field: "isAdministrator", before: "no", after: "yes" }] });
    const holds = planChange(change, { kind: "ADMINISTRATOR_GRANT", account: active, holdings: { ...none, offices: 1 } });
    expect(holds).toMatchObject({ ok: false });
    expect(holds.ok ? [] : holds.faults.map((f) => f.code)).toEqual(["ADMINISTRATOR_HOLDS_NOTHING"]);
    const disabled = planChange(change, { kind: "ADMINISTRATOR_GRANT", account: { ...active, status: "DISABLED" }, holdings: none });
    expect(disabled.ok ? [] : disabled.faults.map((f) => f.code)).toEqual(["NOT_ACTIVE"]);
    const already = planChange(change, { kind: "ADMINISTRATOR_GRANT", account: { ...active, isAdministrator: true }, holdings: none });
    expect(already.ok ? [] : already.faults.map((f) => f.code)).toEqual(["ALREADY_ADMINISTRATOR"]);
  });

  it("taking administration away is refused for the only active administrator", () => {
    const change = parsed("ADMINISTRATOR_REVOKE", { accountId: "a1" });
    const admin = { ...active, isAdministrator: true };
    expect(planChange(change, { kind: "ADMINISTRATOR_REVOKE", account: admin, activeAdministrators: 2 })).toMatchObject({ ok: true });
    const last = planChange(change, { kind: "ADMINISTRATOR_REVOKE", account: admin, activeAdministrators: 1 });
    expect(last.ok ? [] : last.faults.map((f) => f.code)).toEqual(["LAST_ADMINISTRATOR"]);
    const not = planChange(change, { kind: "ADMINISTRATOR_REVOKE", account: active, activeAdministrators: 3 });
    expect(not.ok ? [] : not.faults.map((f) => f.code)).toEqual(["NOT_ADMINISTRATOR"]);
  });

  it("a code is for an activation of a pending account or a reset of an active one", () => {
    const reset = parsed("ACCOUNT_CODE", { accountId: "a1", purpose: "RESET" });
    const activation = parsed("ACCOUNT_CODE", { accountId: "a1", purpose: "ACTIVATION" });
    const pending = { ...active, status: "PENDING_ACTIVATION" } as const;
    expect(planChange(reset, { kind: "ACCOUNT_CODE", account: active, holdsOffice: true })).toMatchObject({ ok: true });
    expect(planChange(activation, { kind: "ACCOUNT_CODE", account: pending, holdsOffice: true })).toMatchObject({ ok: true });
    expect(planChange(reset, { kind: "ACCOUNT_CODE", account: pending, holdsOffice: true })).toMatchObject({ ok: false, faults: [{ code: "NOT_ACTIVE" }] });
    expect(planChange(activation, { kind: "ACCOUNT_CODE", account: active, holdsOffice: true })).toMatchObject({ ok: false, faults: [{ code: "NOT_AWAITING_ACTIVATION" }] });
  });

  it("refuses a state read for another kind of change", () => {
    expect(planChange(parsed("ADMINISTRATOR_GRANT", { accountId: "a" }), { kind: "ACCOUNT_CODE", account: null, holdsOffice: false })).toMatchObject({ ok: false, faults: [{ code: "WRONG_STATE" }] });
  });
});

describe("who decides a change", () => {
  const change = { kind: "SECURITY_POLICY", status: "PROPOSED", proposedByPersonId: "maker" } as const;
  const decider = (personId: string, ...permissions: PermissionKey[]) => ({ personId, permissions: new Set(permissions) });

  it("is a different Person from the proposer who holds the kind's permission", () => {
    expect(decisionFaults(change, decider("checker", "security.policy"))).toEqual([]);
  });

  it("is never the proposer, even one who holds the permission: compared by Person", () => {
    expect(decisionFaults(change, decider("maker", "security.policy")).map((f) => f.code)).toEqual(["PROPOSER_IS_DECIDER"]);
  });

  it("needs the permission of the kind, each kind its own", () => {
    expect(decisionFaults(change, decider("checker")).map((f) => f.code)).toEqual(["NOT_PERMITTED"]);
    expect(KIND_PERMISSION).toEqual({
      SECURITY_POLICY: "security.policy",
      PERMISSION_GRANT: "permissions.grant",
      ADMINISTRATOR_GRANT: "accounts.manage",
      ADMINISTRATOR_REVOKE: "accounts.manage",
      ACCOUNT_CODE: "accounts.manage",
    });
  });

  it("is decided once: a decided or withdrawn change is not decided again", () => {
    for (const status of ["APPLIED", "DECLINED", "WITHDRAWN", "STALE"]) {
      expect(decisionFaults({ ...change, status }, decider("checker", "security.policy")).map((f) => f.code)).toEqual(["NOT_PROPOSED"]);
    }
  });

  it("says a second person is needed where nobody but the proposer could decide, and does not fake one", () => {
    expect(secondPersonFault(["maker"], "maker")?.code).toBe("SECOND_PERSON_NEEDED");
    expect(secondPersonFault([], "maker")?.code).toBe("SECOND_PERSON_NEEDED");
    expect(secondPersonFault(["maker", "checker"], "maker")).toBeNull();
  });
});
