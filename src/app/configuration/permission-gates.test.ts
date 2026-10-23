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

/// What gives authority: who holds an office, a delegation, a role's capabilities, a committee seat. Phase 5b (the plan's 5b line, rulings 1688 and 1689): each is a proposal now,
/// made by a holder of `configuration.draft` (what `stageEdit` asks first, pinned in `registry-scan.test.ts`) and applied by a different holder of `configuration.issue`, so that
/// one administrator can no longer give an office alone. Ruled earlier (decisions log 2026-10-07): ending an office or vacating a seat is gated by the key that gives one, and a
/// reporting line (Phase 3c) decides who may be delegated to, so it is gated by the key that gives a delegation. The scan holds each to being a proposal of its own editor.
const PROPOSES_AUTHORITY: Record<string, string[]> = {
  users: ["saveAssignment", "saveDelegation", "saveReportingLine", "saveOffice", "endAssignment", "setGrant", "savePerson", "setPersonActive"],
  committees: ["saveMember", "vacateSeat"],
};

/// The other configuration editors: each a proposal too (`registry-scan.test.ts` holds every one), named so that a new section is not silently one that is not.
const OTHER_EDITORS = ["audit", "awards", "bid-sealing", "budget", "contracts", "documents", "evaluation", "invitation", "notifications", "numbering", "organisation", "post-award", "reference-data", "requisitions", "routing-sheets", "scope", "suppliers", "templates", "tender-documents"];

describe("the approval route is changed only by someone who holds the permission", () => {
  it("finds the matrix editor's exports, and the issue among them", () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(15);
    expect(MATRIX.filter(([, k]) => k === "configuration.issue").map(([f]) => f)).toEqual(["issueDraft"]);
  });

  it.each([["approval-matrix", MATRIX]] as [string, [string, Key][]][])("%s: each named export asks staffForPermission with its key, first", (dir, named) => {
    const src = source(dir);
    const wrong = named.filter(([fn, key]) => !new RegExp(String.raw`^await\s+staffForPermission\(\s*"${key}"\s*\)`).test(firstAwait(src, fn) ?? "")).map(([fn, key]) => `${dir}/${fn}: not staffForPermission("${key}") first`);
    expect(wrong).toEqual([]);
  });

  it("accounts: every action asks staffForPermission(\"accounts.manage\"), first, and none is left out", () => {
    const src = readFileSync(path.join(CONFIG, "users", "account-actions.ts"), "utf8");
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

  it.each(Object.entries(PROPOSES_AUTHORITY))("%s: each export that gives or ends authority, or records a person, is a proposal of its own editor", (dir, names) => {
    const src = source(dir);
    expect([...names].sort()).toEqual(exportsOf(src).filter((fn) => dir !== "committees" || names.includes(fn)).sort().filter((fn) => names.includes(fn)));
    const wrong = names.filter((fn) => !new RegExp(String.raw`^await\s+stageEdit\(\s*"${dir}\.${fn}"`).test(firstAwait(src, fn) ?? ""));
    expect(wrong).toEqual([]);
  });

  // Ruling of 2026-10-08 (log line 1770): recording a person as away changes who decides their steps, so it needs `configuration.draft`. Every save of a person is a proposal by a holder of
  // that key now, and the sweep button stays open to any signed-in officer who is not an administrator: moveStepsOfAbsentHolders asks no permission key.
  it("the sweep of an absent holder's steps asks no permission key, as before", () => {
    expect(readFileSync(path.join(process.cwd(), "src", "app", "approvals", "actions.ts"), "utf8")).not.toMatch(/staffForPermission\(/);
  });

  // Review of Phase 2c: the queue was open to every signed-in member of staff, with the proposers' reasons (how a person's identity was checked) and the sign-in settings in it.
  it("the changes queue is read only by someone who holds the permission of at least one kind, and is asked before anything is loaded", () => {
    // Plan 5.7: the queue is a tab of My approvals, built only behind the ask.
    const page = lex(readFileSync(path.join(process.cwd(), "src", "app", "approvals", "page.tsx"), "utf8"), { only: "comments" });
    const ask = page.search(/const showQueue = mayReadQueue\(actor\.permissions\)/);
    expect(ask).toBeGreaterThan(-1);
    expect(page.indexOf("<ChangesQueue")).toBeGreaterThan(ask);
    expect(page).toContain("showQueue ?");
    expect(readFileSync(path.join(CONFIG, "changes", "queue-panel.tsx"), "utf8")).toContain("loadChangesView(");
    // And the rows themselves are cut to the kinds the viewer decides, whatever page asks.
    expect(readFileSync(path.join(process.cwd(), "src", "lib", "auth", "changes-view.ts"), "utf8")).toMatch(/kindsReadBy\(actor\.permissions\)/);
  });

  it("every other configuration editor is named, so a new one is not silently ungated", () => {
    const dirs = readdirSync(CONFIG, { withFileTypes: true }).filter((d) => d.isDirectory() && readdirSync(path.join(CONFIG, d.name)).includes("actions.ts")).map((d) => d.name);
    const known = new Set(["approval-matrix", "changes", ...Object.keys(PROPOSES_AUTHORITY), ...OTHER_EDITORS]);
    expect(dirs.filter((d) => !known.has(d))).toEqual([]);
    expect([...known].filter((d) => !dirs.includes(d))).toEqual([]);
  });
});

describe("the Getting-started page is read only by those who work on configuration or its audit trail", () => {
  // Plan 5.1: the gate is one function, shared by Getting started and the six section pages.
  const page = readFileSync(path.join(CONFIG, "section-route.tsx"), "utf8");
  it("sends anyone else Home, and names the three permissions and the administrator", () => {
    expect(readFileSync(path.join(CONFIG, "page.tsx"), "utf8")).toContain("requireSettingsReader()");
    expect(page).toContain("export async function SettingsSectionRoute");
    // Each section page asks the gate itself, first (auth-reach), and hands the reader to SettingsSectionRoute.
    for (const s of ["approvals", "contracts-payments", "people", "purchasing", "suppliers-portal", "system"]) {
      expect(readFileSync(path.join(CONFIG, s, "page.tsx"), "utf8")).toMatch(/const actor = await requireSettingsReader\(\);/);
    }
    expect(page).toMatch(/redirect\("\/"\)/);
    for (const key of ["configuration.draft", "configuration.issue", "audit.read"]) expect(page).toContain(`"${key}"`);
    expect(page).toContain("isAdministrator");
  });
  it("shows the one-person list only to a reader of the audit trail", () => {
    expect(readFileSync(path.join(CONFIG, "audit", "page.tsx"), "utf8")).toMatch(/showOnePerson = exportGate\.ok && /);
  });
});
