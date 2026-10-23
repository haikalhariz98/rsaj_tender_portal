import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { accountActs, signInStanding } from "@/lib/auth/account-acts";

/**
 * Simplification 5.3: the Sign-in accounts screen is folded into People. Every act that was reachable there is still reachable here: each editor is drawn by the People
 * list, the old address redirects, and `accountActs` offers the same acts the old page did for each state of an account.
 */

const CONFIG = path.join(process.cwd(), "src", "app", "configuration");
const none = { offices: 0, seats: 0, delegations: 0 };
const base = { status: "ACTIVE" as const, isYou: false, isAdministrator: false, personActive: true, lockedUntil: null, failedAttempts: 0, holdings: none, held: none };
const now = new Date("2026-10-24T00:00:00Z");

describe("every account act that was reachable is reachable from People", () => {
  it("draws each editor from the People list, and the old address goes there", () => {
    const panels = readFileSync(path.join(CONFIG, "users", "panels.tsx"), "utf8");
    for (const editor of ["CreateAccount", "IssueCode", "ProposeAccountCode", "ProposeAdministrator", "UnlockAccount", "EnableAccount", "DisableAccount"]) expect(panels, editor).toContain(`<${editor}`);
    expect(readFileSync(path.join(CONFIG, "accounts", "page.tsx"), "utf8")).toContain('redirect("/configuration/users?tab=people")');
  });

  it("offers a code and, for a plain account, the administrator proposal", () => {
    const a = accountActs(base, now);
    expect(a.code).toEqual({ purpose: "RESET", notice: null });
    expect(a).toMatchObject({ admin: "GRANT", unlock: false, enable: false, disable: true });
  });

  it("offers an activation code to an account not yet activated", () => {
    expect(accountActs({ ...base, status: "PENDING_ACTIVATION" }, now).code?.purpose).toBe("ACTIVATION");
  });

  it("sends an administrator's or office holder's code to a second person, and offers to end administration", () => {
    const admin = accountActs({ ...base, isAdministrator: true }, now);
    expect(admin.code?.notice).toBeTruthy();
    expect(admin.admin).toBe("REVOKE");
    const holder = accountActs({ ...base, holdings: { ...none, offices: 1 }, held: { ...none, offices: 1 } }, now);
    expect(holder.code?.notice).toBeTruthy();
    expect(holder.admin).toBeNull();
  });

  it("offers unlock to a locked account, put back to a disabled one, and neither disable nor a code to your own", () => {
    expect(accountActs({ ...base, lockedUntil: new Date("2026-10-25T00:00:00Z") }, now).unlock).toBe(true);
    expect(accountActs({ ...base, failedAttempts: 2 }, now).unlock).toBe(true);
    const off = accountActs({ ...base, status: "DISABLED" }, now);
    expect(off).toMatchObject({ enable: true, disable: false, unlock: false, code: null });
    expect(accountActs({ ...base, isYou: true }, now)).toMatchObject({ code: null, disable: false });
  });

  it("names the standing in the plain words the list shows", () => {
    expect(signInStanding(base, now).text).toBe("Active");
    expect(signInStanding({ ...base, status: "PENDING_ACTIVATION" }, now).text).toBe("Not activated");
    expect(signInStanding({ ...base, lockedUntil: new Date("2026-10-25T00:00:00Z") }, now).text).toBe("Locked");
    expect(signInStanding({ ...base, status: "DISABLED" }, now).text).toBe("Disabled");
  });
});
