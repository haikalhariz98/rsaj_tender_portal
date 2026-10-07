import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

/**
 * Who may change the approval route (review of Phase 2a, threat model F7 and B12). A signed-in officer who holds no permission must not be able to rewrite the
 * approval matrix, give themselves an office or a delegation, or issue the draft and approve their own requisition. Every edit of the matrix asks for
 * `configuration.draft` (its issue, `configuration.issue`), as do the editors that give authority: an office, a committee seat, a delegation, and a role's capability.
 * The administrator flag confers both permissions, so no administrator is locked out; anyone else holds one only where the organisation has granted it to a role.
 *
 * A source scan, like `auth-reach.test.ts`: the first awaited call of each is `staffForPermission("<key>")`, and no export of the three files is left out unnamed.
 */

const CONFIG = path.join(process.cwd(), "src", "app", "configuration");
const source = (rel: string) => readFileSync(path.join(CONFIG, rel, "actions.ts"), "utf8");
const exportsOf = (src: string) => [...src.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);

const firstAwait = (src: string, fn: string): string | null => {
  const m = lex(src);
  const span = spans(m).find((s) => s.name === fn);
  if (!span) return null;
  const at = m.slice(span.from, span.to).search(/\bawait\b/);
  return at < 0 ? null : src.slice(span.from + at, span.from + at + 80);
};

type Key = "configuration.draft" | "configuration.issue" | "accounts.manage" | "security.policy" | "permissions.grant";

/// Every export of the matrix editor is a draft edit, and the issue.
const MATRIX = exportsOf(source("approval-matrix")).map((fn): [string, Key] => [fn, fn === "issueDraft" ? "configuration.issue" : "configuration.draft"]);

/// Phase 2c: the sign-in accounts are `accounts.manage`'s, and each proposal of a two-person change is its kind's permission. Deciding a change asks only who is signed in
/// (`requireStaff`): the permission that decides it is the kind's, judged in `change-store.ts` against the change as it stands under its lock.
const ACCOUNTS = ["createAccountAction", "disableAccountAction", "enableAccountAction", "unlockAccountAction", "issueCodeAction"].map((fn): [string, Key] => [fn, "accounts.manage"]);
const PROPOSALS: [string, Key][] = [
  ["proposeSecurityPolicy", "security.policy"],
  ["proposePermissionGrant", "permissions.grant"],
  ["proposeAdministratorChange", "accounts.manage"],
  ["proposeAccountCode", "accounts.manage"],
];
const DECISIONS = ["applyChangeAction", "declineChangeAction", "withdrawChangeAction"];

/// What gives authority in the other two: who holds an office, a delegation, a role's capabilities, a committee seat.
const GIVES_AUTHORITY: Record<string, [string, Key][]> = {
  users: [
    ["saveAssignment", "configuration.draft"],
    ["saveDelegation", "configuration.draft"],
    ["saveOffice", "configuration.draft"],
    ["setGrant", "configuration.draft"],
  ],
  committees: [["saveMember", "configuration.draft"]],
};

/// What is left asking only who is signed in, with the reason it is not gated yet. An open item for the product owner: which permission governs it.
const NOT_YET: Record<string, string> = {
  "users.savePerson": "A person's own record (name, staff number): not an authority. Which permission edits a person is the product owner's to say.",
  "users.setPersonActive": "Marks a person as having left or returned: it ends accounts, which `accounts.manage` governs elsewhere. The product owner's to say.",
  "users.endAssignment": "Ends an office: it gives no authority. The product owner's to say whether ending needs the permission too.",
  "committees.saveCommittee": "A committee's own terms: not who sits on it. The product owner's to say.",
  "committees.vacateSeat": "Ends a seat: it gives no authority. The product owner's to say whether ending needs the permission too.",
  "committees.saveNotApprovedOutcome": "What a committee's not-approved outcome does: it routes, and gives no authority. The product owner's to say.",
  "committees.retireNotApprovedOutcome": "As saveNotApprovedOutcome.",
  "committees.saveCommitteePanel": "A committee's panel of its sitting. The product owner's to say.",
};

/// The other configuration editors, none of which asks for a permission yet (each asks only who is signed in). Named, so that a new editor is not silently one.
const OTHER_EDITORS = ["audit", "awards", "budget", "contracts", "documents", "evaluation", "invitation", "notifications", "numbering", "organisation", "post-award", "reference-data", "requisitions", "routing-sheets", "scope", "suppliers", "templates", "tender-documents"];

describe("the approval route is changed only by someone who holds the permission", () => {
  it("finds the matrix editor's exports, and the issue among them", () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(15);
    expect(MATRIX.filter(([, k]) => k === "configuration.issue").map(([f]) => f)).toEqual(["issueDraft"]);
  });

  it.each([
    ["approval-matrix", MATRIX],
    ...Object.entries(GIVES_AUTHORITY),
  ] as [string, [string, Key][]][])("%s: each named export asks staffForPermission with its key, first", (dir, named) => {
    const src = source(dir);
    const wrong = named.filter(([fn, key]) => !new RegExp(String.raw`^await\s+staffForPermission\(\s*"${key}"\s*\)`).test(firstAwait(src, fn) ?? "")).map(([fn, key]) => `${dir}/${fn}: not staffForPermission("${key}") first`);
    expect(wrong).toEqual([]);
  });

  it("accounts: every action asks staffForPermission(\"accounts.manage\"), first, and none is left out", () => {
    const src = source("accounts");
    expect(exportsOf(src).sort()).toEqual(ACCOUNTS.map(([f]) => f).sort());
    const wrong = ACCOUNTS.filter(([fn, key]) => !new RegExp(String.raw`^await\s+staffForPermission\(\s*"${key}"\s*\)`).test(firstAwait(src, fn) ?? "")).map(([fn]) => fn);
    expect(wrong).toEqual([]);
  });

  it("changes: each proposal asks its kind's permission first, each decision asks who is signed in first, and nothing else is exported", () => {
    const src = source("changes");
    expect(exportsOf(src).sort()).toEqual([...PROPOSALS.map(([f]) => f), ...DECISIONS].sort());
    const proposals = PROPOSALS.filter(([fn, key]) => !new RegExp(String.raw`^await\s+staffForPermission\(\s*"${key}"\s*\)`).test(firstAwait(src, fn) ?? "")).map(([fn]) => fn);
    expect(proposals).toEqual([]);
    const decisions = DECISIONS.filter((fn) => !/^await\s+requireStaff\(\)/.test(firstAwait(src, fn) ?? ""));
    expect(decisions).toEqual([]);
  });

  it("every export of the users and committees editors is gated or named, with its reason, as not gated yet", () => {
    for (const dir of Object.keys(GIVES_AUTHORITY)) {
      const gated = new Set(GIVES_AUTHORITY[dir].map(([f]) => f));
      const rest = exportsOf(source(dir)).filter((f) => !gated.has(f));
      expect(rest.filter((f) => !NOT_YET[`${dir}.${f}`]).map((f) => `${dir}.${f}`)).toEqual([]);
    }
    for (const [key, why] of Object.entries(NOT_YET)) {
      const [dir, fn] = key.split(".");
      expect(exportsOf(source(dir)), key).toContain(fn);
      expect(GIVES_AUTHORITY[dir].map(([f]) => f), key).not.toContain(fn);
      expect(why.length, key).toBeGreaterThan(15);
    }
  });

  it("every other configuration editor is named, so a new one is not silently ungated", () => {
    const dirs = readdirSync(CONFIG, { withFileTypes: true }).filter((d) => d.isDirectory() && readdirSync(path.join(CONFIG, d.name)).includes("actions.ts")).map((d) => d.name);
    const known = new Set(["approval-matrix", "accounts", "changes", ...Object.keys(GIVES_AUTHORITY), ...OTHER_EDITORS]);
    expect(dirs.filter((d) => !known.has(d))).toEqual([]);
    expect([...known].filter((d) => !dirs.includes(d))).toEqual([]);
  });
});
