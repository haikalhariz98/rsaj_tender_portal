import { describe, expect, it } from "vitest";

import { adminConfers, holds, isGrantable, isPermissionKey, PERMISSION_KEYS, PERMISSIONS, permissionRefusal, permissionState, resolvePermissions, type ResolveInput } from "./permissions";
import type { PermissionKey } from "./types";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = day("2026-10-07");

const input = (over: Partial<ResolveInput> = {}): ResolveInput => ({ isAdministrator: false, assignments: [], grants: [], today: TODAY, ...over });
const office = (roleCode: string, over: Partial<ResolveInput["assignments"][number]> = {}) => ({ roleCode, scope: null, effectiveFrom: day("2026-01-01"), effectiveTo: null, ...over });
const grant = (permissionKey: string, roleCode: string, decision: "GRANTED" | "WITHHELD" = "GRANTED") => ({ permissionKey, roleCode, decision });

const ADMIN_ONLY: PermissionKey[] = ["accounts.manage", "security.policy", "permissions.grant"];
const ADMIN_OR_GRANT: PermissionKey[] = ["configuration.draft", "configuration.issue", "audit.read"];
// Changed for the CPD registration rulings (Phase 4b, 2026-10-07, ruling 6): "sulit.read.creditorProfile", granted only and undecided until the organisation decides, opens a supplier's
// bank details and nothing else. Nothing else in this list moved.
const GRANT_ONLY: PermissionKey[] = ["supplierAccounts.manage", "sulit.read.organisation", "sulit.read.creditorProfile", "acts.recordOnBehalf", "sourcing.participants.manage"];

describe("the closed list of product permissions (ADR 0034 D8)", () => {
  // Phase 3a review: a tenth key, "sourcing.participants.manage" (granted only, like the other transactional ones). Being named on an exercise is what opens its
  // SULIT figures, so naming someone is an authorised act; the nine of the ADR are unchanged and the new one is undecided (refused) until the organisation decides.
  it("is the nine keys of the ADR and the one Phase 3a added, in three kinds", () => {
    expect([...PERMISSION_KEYS].sort()).toEqual([...ADMIN_ONLY, ...ADMIN_OR_GRANT, ...GRANT_ONLY].sort());
    for (const k of ADMIN_ONLY) expect([PERMISSIONS[k].source, isGrantable(k), adminConfers(k)]).toEqual(["ADMINISTRATOR_ONLY", false, true]);
    for (const k of ADMIN_OR_GRANT) expect([PERMISSIONS[k].source, isGrantable(k), adminConfers(k)]).toEqual(["ADMINISTRATOR_OR_GRANT", true, true]);
    for (const k of GRANT_ONLY) expect([PERMISSIONS[k].source, isGrantable(k), adminConfers(k)]).toEqual(["GRANT_ONLY", true, false]);
  });

  it("names every permission in both languages, in words and never as its key", () => {
    for (const k of PERMISSION_KEYS) {
      const { label, lets } = PERMISSIONS[k];
      for (const w of [label, lets]) {
        expect(w.en.length).toBeGreaterThan(5);
        expect(w.ms.length).toBeGreaterThan(5);
        expect(w.en).not.toContain(k);
        expect(w.ms).not.toContain(k);
      }
    }
  });

  it("recognises a key by exact name only", () => {
    expect(isPermissionKey("audit.read")).toBe(true);
    expect(isPermissionKey("constructor")).toBe(false);
    expect(isPermissionKey("toString")).toBe(false);
    expect(isPermissionKey("audit.write")).toBe(false);
  });
});

describe("an administrator holds what the flag confers and no more", () => {
  it("holds the administrator-only keys and the administrator-or-granted keys, and never a granted-only key", () => {
    const held = resolvePermissions(input({ isAdministrator: true }));
    expect([...held].sort()).toEqual([...ADMIN_ONLY, ...ADMIN_OR_GRANT].sort());
    for (const k of GRANT_ONLY) expect(permissionState(k, input({ isAdministrator: true })).state).toBe("ADMINISTRATOR_EXCLUDED");
  });

  it("is not given a granted-only key by a role they somehow hold: administration stays apart from transactions", () => {
    const i = input({ isAdministrator: true, assignments: [office("CEO")], grants: GRANT_ONLY.map((k) => grant(k, "CEO")) });
    expect(resolvePermissions(i).has("sulit.read.organisation")).toBe(false);
    expect(resolvePermissions(i).has("acts.recordOnBehalf")).toBe(false);
  });

  it("holds the flag's keys with no time zone set: the flag does not need today", () => {
    expect(resolvePermissions(input({ isAdministrator: true, today: null })).has("accounts.manage")).toBe(true);
  });

  it("is not made to lose a key by a role withholding it: the flag confers it", () => {
    const i = input({ isAdministrator: true, assignments: [office("CEO")], grants: [grant("audit.read", "CEO", "WITHHELD")] });
    expect(resolvePermissions(i).has("audit.read")).toBe(true);
  });
});

describe("a person who is not an administrator holds what a role they hold has been granted", () => {
  it("holds nothing with no assignments and no grants", () => {
    expect(resolvePermissions(input()).size).toBe(0);
  });

  it("holds a granted key through the role, for the administrator-or-granted and the granted-only kinds", () => {
    const i = input({ assignments: [office("FD")], grants: [grant("audit.read", "FD"), grant("sulit.read.organisation", "FD")] });
    expect([...resolvePermissions(i)].sort()).toEqual(["audit.read", "sulit.read.organisation"]);
    expect(permissionState("audit.read", i)).toEqual({ state: "ROLE", roleCodes: ["FD"] });
  });

  it("holds nothing through a role it has not been granted to", () => {
    const i = input({ assignments: [office("CEO")], grants: [grant("audit.read", "FD")] });
    expect(resolvePermissions(i).size).toBe(0);
    expect(permissionState("audit.read", i)).toEqual({ state: "UNDECIDED" });
  });

  it("never holds an administrator-only key, even with a stored row that grants one: the row is ignored", () => {
    const i = input({ assignments: [office("CEO")], grants: ADMIN_ONLY.map((k) => grant(k, "CEO")) });
    expect(resolvePermissions(i).size).toBe(0);
    for (const k of ADMIN_ONLY) expect(permissionState(k, i)).toEqual({ state: "NOT_GRANTABLE" });
  });

  it("ignores a stored row whose key is not on the closed list", () => {
    const i = input({ assignments: [office("CEO")], grants: [grant("everything.all", "CEO"), grant("__proto__", "CEO"), grant("audit.read", "CEO")] });
    expect([...resolvePermissions(i)]).toEqual(["audit.read"]);
  });

  it("counts an office only on the days it is in force: begun, and not yet ended (the end day is not included)", () => {
    const grants = [grant("audit.read", "FD")];
    const held = (a: ReturnType<typeof office>) => resolvePermissions(input({ assignments: [a], grants })).has("audit.read");
    expect(held(office("FD", { effectiveFrom: day("2026-10-07") }))).toBe(true);
    expect(held(office("FD", { effectiveFrom: day("2026-10-08") }))).toBe(false);
    expect(held(office("FD", { effectiveTo: day("2026-10-08") }))).toBe(true);
    expect(held(office("FD", { effectiveTo: day("2026-10-07") }))).toBe(false);
  });

  it("claims no office where today is not known (no time zone set), so a role carries nothing", () => {
    const i = input({ today: null, assignments: [office("FD")], grants: [grant("audit.read", "FD")] });
    expect(resolvePermissions(i).size).toBe(0);
  });

  it("ignores a delegation: it carries approval authority only, and no product permission", () => {
    // `ResolveInput` has no place for a delegation. A caller that passed one anyway changes nothing.
    const withDelegation = { ...input({ grants: [grant("audit.read", "FD")] }), delegations: [{ roleCode: "FD", effectiveFrom: day("2026-01-01"), effectiveTo: null }] } as ResolveInput;
    expect(resolvePermissions(withDelegation).size).toBe(0);
  });
});

describe("undecided is not withheld, and a withheld decision wins", () => {
  it("tells no decision (undecided) from a withheld one", () => {
    const base = { assignments: [office("FD")] };
    expect(permissionState("audit.read", input(base))).toEqual({ state: "UNDECIDED" });
    expect(permissionState("audit.read", input({ ...base, grants: [grant("audit.read", "FD", "WITHHELD")] }))).toEqual({ state: "WITHHELD", roleCodes: ["FD"] });
  });

  it("refuses a key GRANTED on one held role and WITHHELD on another (the default until the product owner rules: deny wins)", () => {
    const i = input({ assignments: [office("FD"), office("CEO")], grants: [grant("audit.read", "FD"), grant("audit.read", "CEO", "WITHHELD")] });
    expect(resolvePermissions(i).has("audit.read")).toBe(false);
    expect(permissionState("audit.read", i)).toEqual({ state: "WITHHELD", roleCodes: ["CEO"] });
  });

  it("is not made to lose a key by a withheld decision on a role the person does not hold", () => {
    const i = input({ assignments: [office("FD")], grants: [grant("audit.read", "FD"), grant("audit.read", "CEO", "WITHHELD")] });
    expect(resolvePermissions(i).has("audit.read")).toBe(true);
  });
});

describe("an office held only for a department does not carry an organisation's permission (an open item, refused by default)", () => {
  it("is not carried, and says so", () => {
    const i = input({ assignments: [office("HOD", { scope: "FIN" })], grants: [grant("audit.read", "HOD")] });
    expect(resolvePermissions(i).has("audit.read")).toBe(false);
    expect(permissionState("audit.read", i)).toEqual({ state: "SCOPED_ONLY", roleCodes: ["HOD"] });
  });

  it("is carried when the same office is also held organisation-wide", () => {
    const i = input({ assignments: [office("HOD", { scope: "FIN" }), office("HOD")], grants: [grant("audit.read", "HOD")] });
    expect(permissionState("audit.read", i)).toEqual({ state: "ROLE", roleCodes: ["HOD"] });
  });
});

describe("what a refused person is told", () => {
  const states = [
    permissionState("audit.read", input({ assignments: [office("FD")], grants: [grant("audit.read", "FD", "WITHHELD")] })),
    permissionState("audit.read", input({ assignments: [office("FD", { scope: "FIN" })], grants: [grant("audit.read", "FD")] })),
    permissionState("sulit.read.organisation", input({ isAdministrator: true })),
    permissionState("accounts.manage", input()),
    permissionState("audit.read", input()),
  ];

  it("names the permission in words in both languages and never its key", () => {
    for (const s of states) {
      const key: PermissionKey = s.state === "ADMINISTRATOR_EXCLUDED" ? "sulit.read.organisation" : s.state === "NOT_GRANTABLE" ? "accounts.manage" : "audit.read";
      const words = permissionRefusal(key, s, () => "the Finance Director");
      expect(words.en).toContain(PERMISSIONS[key].label.en);
      expect(words.ms).toContain(PERMISSIONS[key].label.ms);
      expect(words.en).not.toContain(key);
      expect(words.ms).not.toContain(key);
    }
  });

  it("says the organisation has not decided, where it has not, and names the role where it has withheld", () => {
    expect(permissionRefusal("audit.read", { state: "UNDECIDED" }).en).toMatch(/not yet decided/);
    expect(permissionRefusal("audit.read", { state: "WITHHELD", roleCodes: ["FD"] }, () => "the Finance Director").en).toMatch(/withheld it from the Finance Director/);
  });

  it("holds() is true only for the two states that hold", () => {
    expect(states.map(holds)).toEqual([false, false, false, false, false]);
    expect(holds({ state: "ADMINISTRATOR" })).toBe(true);
    expect(holds({ state: "ROLE", roleCodes: ["FD"] })).toBe(true);
  });
});
