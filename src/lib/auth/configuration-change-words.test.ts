import { describe, expect, it } from "vitest";

import { describeChange, lineText, settingChoices, settingValueWords, whatChanges } from "./configuration-change-words";

/**
 * A change in words (Phase 2c): the queue shows what each would do, from what to what, by names. No key, id, code or JSON reaches it.
 */

const names = { accountPerson: "Aminah Binti Ali", roleName: "Procurement Officer" };
const text = (s: ReturnType<typeof describeChange>) => JSON.stringify(s);

describe("a setting reads with its unit, a choice in words, and not set as not set", () => {
  it("says the unit, singular and plural", () => {
    expect(settingValueWords("staffIdleMinutes", 30)).toBe("30 minutes");
    expect(settingValueWords("staffIdleMinutes", 1)).toBe("1 minute");
    expect(settingValueWords("passwordMinLength", 12)).toBe("12 characters");
    expect(settingValueWords("signInDetailRetentionDays", 90)).toBe("90 days");
  });
  it("says a choice in words and never its code", () => {
    expect(settingValueWords("concurrentSessionAction", "REVOKE_OLDEST")).toBe("End the oldest session");
    expect(settingValueWords("paperSignatureRecording", "REFUSED")).toBe("Refused");
    expect(settingChoices("paperSignatureRecording")).toEqual([
      { value: "ALLOWED", label: "Allowed" },
      { value: "REFUSED", label: "Refused" },
    ]);
    expect(settingChoices("staffIdleMinutes")).toBeUndefined();
  });
  it("says not set for a setting nobody has chosen", () => {
    expect(settingValueWords("lockoutMinutes", null)).toBe("Not set");
  });
});

describe("each kind of change reads as what it does", () => {
  it("a setting: its label, what it was and what it becomes", () => {
    const s = describeChange("SECURITY_POLICY", { changes: { staffIdleMinutes: 20, paperSignatureRecording: "ALLOWED" } }, { staffIdleMinutes: 30, paperSignatureRecording: null }, names);
    expect(s.title).toBe("Change the sign-in settings");
    expect(s.lines).toEqual([
      { label: "Staff idle time before a session ends", before: "30 minutes", after: "20 minutes" },
      { label: "Whether a paper decision may be recorded for someone else", before: "Not set", after: "Allowed" },
    ]);
  });

  it("a permission: the role by its name, the permission by its label, undecided and not withheld", () => {
    const s = describeChange("PERMISSION_GRANT", { permissionKey: "configuration.issue", roleCode: "PO", decision: "GRANTED" }, { decision: "UNDECIDED" }, names);
    expect(s.subject).toBe("Procurement Officer");
    expect(s.lines).toEqual([{ label: "Issue configuration", before: "Undecided", after: "Granted" }]);
  });

  it("an administrator change: the person by name, the rights in words", () => {
    const grant = describeChange("ADMINISTRATOR_GRANT", { accountId: "acct_1" }, { exists: true, isAdministrator: false, status: "ACTIVE" }, names);
    expect(grant.subject).toBe("Aminah Binti Ali");
    expect(grant.lines).toEqual([{ label: "Administrator rights", before: "Not an administrator", after: "An administrator" }]);
    const revoke = describeChange("ADMINISTRATOR_REVOKE", { accountId: "acct_1" }, { exists: true, isAdministrator: true, status: "ACTIVE" }, names);
    expect(revoke.lines[0]).toMatchObject({ before: "An administrator", after: "Not an administrator" });
  });

  it("a code: whose, and which, and that the second person hands it over", () => {
    const s = describeChange("ACCOUNT_CODE", { accountId: "acct_1", purpose: "RESET" }, { exists: true, status: "ACTIVE", holdsOffice: true }, names);
    expect(s.subject).toBe("Aminah Binti Ali");
    expect(s.lines[0].after).toMatch(/reset code/);
  });

  it("no kind shows an id, a key, a code or JSON", () => {
    const shown = [
      describeChange("SECURITY_POLICY", { changes: { maxConcurrentSessions: 2, concurrentSessionAction: "REFUSE_NEW" } }, { maxConcurrentSessions: null, concurrentSessionAction: null }, names),
      describeChange("PERMISSION_GRANT", { permissionKey: "audit.read", roleCode: "PO", decision: "WITHHELD" }, { decision: "GRANTED" }, names),
      describeChange("ADMINISTRATOR_GRANT", { accountId: "acct_1" }, { isAdministrator: false }, names),
      describeChange("ACCOUNT_CODE", { accountId: "acct_1", purpose: "ACTIVATION" }, {}, names),
    ]
      .map(text)
      .join(" ");
    for (const leak of ["acct_1", "audit.read", "REFUSE_NEW", "WITHHELD", "ACTIVATION", "maxConcurrentSessions", "concurrentSessionAction", "permissionKey"]) expect(shown, leak).not.toContain(leak);
  });

  it("a payload that no longer fits its kind is said so and shows nothing it holds", () => {
    const s = describeChange("SECURITY_POLICY", { changes: { notASetting: "secret-value" } }, {}, names);
    expect(s.lines[0].after).toMatch(/Cannot be read/);
    expect(text(s)).not.toContain("secret-value");
  });
});

describe("a line of a change", () => {
  it("reads before then after, or after alone where there was nothing before; and a stacked cell has its first line and the rest", () => {
    expect(lineText({ label: "L", before: "a", after: "b" })).toBe("L: a → b");
    expect(lineText({ label: "L", before: null, after: "b" })).toBe("L: b");
    expect(whatChanges([{ label: "A", before: "1", after: "2" }, { label: "B", before: null, after: "3" }])).toEqual({ title: "A: 1 → 2", sub: "B: 3" });
    expect(whatChanges([])).toEqual({ title: "Nothing to show" });
  });
});
