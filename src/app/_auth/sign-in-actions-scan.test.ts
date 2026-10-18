import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

/**
 * A source scan of the sign-in and account server actions (Phase 1a). Server actions are public POST endpoints: nothing about a screen having hidden
 * a button protects them. Each exported action here must pass the Origin guard (`refuseForeignPost`) before it does anything, and each action
 * of the account page must ask who is signed in first (`requireStaff`, throwing, never redirecting from an action). Phase 1b widens this to every action.
 */

const APP = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(APP, file), "utf8");

interface Body {
  /// With strings and comments blanked: for finding calls.
  code: string;
  /// As written: for reading an argument.
  raw: string;
}

/// The bodies of a file's exported async functions, by name.
function exported(file: string): Record<string, Body> {
  const src = read(file);
  const m = lex(src);
  const out: Record<string, Body> = {};
  for (const s of spans(m)) {
    if (new RegExp(String.raw`export\s+async\s+function\s+${s.name}\b`).test(src)) out[s.name] = { code: m.slice(s.from, s.to), raw: src.slice(s.from, s.to) };
  }
  return out;
}

const SIGN_IN = exported("sign-in/actions.ts");
const ACCOUNT = exported("account/actions.ts");
const ALL = { ...SIGN_IN, ...ACCOUNT };

describe("the sign-in and account actions", () => {
  it("finds the actions it scans", () => {
    expect(Object.keys(SIGN_IN).sort()).toEqual(["redeemCodeAction", "signInAction", "signOutAction"]);
    expect(Object.keys(ACCOUNT).sort()).toEqual(["acknowledgeResetAction", "changePasswordAction", "signOutEverywhereAction"]);
  });

  it("a successful sign-in is one server redirect, not an href for the form to navigate to (AC-8, AC-9a)", () => {
    // The cookie write re-renders /sign-in, which redirects a signed-in person to /; a client navigation on top of that fetched / twice.
    expect(SIGN_IN.signInAction.code).toContain("redirect(AFTER_SIGN_IN");
    expect(SIGN_IN.signInAction.code).not.toMatch(/href\s*:\s*AFTER_SIGN_IN/);
  });

  it("every one passes the Origin guard", () => {
    for (const [name, { code }] of Object.entries(ALL)) expect(code, name).toContain("refuseForeignPost(");
  });

  it("every action of the account page asks who is signed in first, and throws rather than redirecting", () => {
    // `staffOrSignIn` is the helper that does it for the actions with no state to answer in: it sends nobody-signed-in to sign in.
    expect(read("account/actions.ts")).toMatch(/async function staffOrSignIn\(\)[\s\S]*?requireStaff\(\{ on: "throw" \}\)/);
    for (const [name, { code, raw }] of Object.entries(ACCOUNT)) {
      expect(raw, name).toMatch(/requireStaff\(\{ on: "throw" \}\)|staffOrSignIn\(\)/);
      const asking = Math.min(...["requireStaff(", "staffOrSignIn("].map((c) => code.indexOf(c)).filter((i) => i >= 0));
      expect(asking, name).toBeLessThan(code.indexOf("refuseForeignPost("));
    }
  });

  it("the Origin guard comes before any parse, any service and any cookie", () => {
    for (const [name, { code }] of Object.entries(SIGN_IN)) {
      const guard = code.indexOf("refuseForeignPost(");
      for (const later of ["parseSignIn(", "parseCodeForm(", "authenticate(", "redeemOneTimeCode(", "signOutToken(", "setStaffCookie(", "clearStaffCookie("]) {
        const at = code.indexOf(later);
        if (at >= 0) expect(guard, `${name}: ${later}`).toBeLessThan(at);
      }
    }
  });

  it("no action reads a person from the form: who acts is the session's, never a field", () => {
    for (const [name, { raw }] of Object.entries(ALL)) {
      expect(raw, name).not.toMatch(/\.get\(\s*["'`]\w*(personId|accountId|organisationId)/i);
    }
  });

  it("the actions that need no session are for the staff copy only", () => {
    for (const name of ["signInAction", "redeemCodeAction"]) expect(SIGN_IN[name].code, name).toContain("surfaceOf(");
  });
});
