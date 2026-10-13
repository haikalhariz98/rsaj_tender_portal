import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pepperFault } from "@/lib/sealing/kdf";
import type { WrappedKey } from "@/lib/sealing/types";

import {
  bidUploadMaxConcurrent,
  DEFAULT_BID_UPLOAD_MAX_CONCURRENT,
  demonstrationAllowedByDeployment,
  liveAllowedByDeployment,
  PEPPER_FAULT_WORDS,
  pepperCheckValue,
  pepperConfigured,
  sealingDeployment,
  sealingPepper,
} from "./sealing-deployment";

/**
 * Wave 3b step 6 (ADR 0036 D1, D4, rulings 20e, 20i, 20v, 20w): the deployment's readers, and its notes.
 */

const KEY32 = randomBytes(32).toString("base64");
const KEY31 = randomBytes(31).toString("base64");

describe("the two deployment flags, read live (20i, SEC-1's pattern)", () => {
  it.each(["true", "TRUE", " True ", "1"])("%j allows", (v) => {
    expect(demonstrationAllowedByDeployment({ SEALED_BIDS_DEMONSTRATION_ALLOWED: v })).toBe(true);
    expect(liveAllowedByDeployment({ SEALED_BIDS_LIVE_ALLOWED: v })).toBe(true);
  });

  it.each(["", " ", "yes", "on", "0", "false", "TRUE!", "true1"])("%j refuses", (v) => {
    expect(demonstrationAllowedByDeployment({ SEALED_BIDS_DEMONSTRATION_ALLOWED: v })).toBe(false);
    expect(liveAllowedByDeployment({ SEALED_BIDS_LIVE_ALLOWED: v })).toBe(false);
  });

  it("absent refuses, and each flag is its own", () => {
    expect(sealingDeployment({})).toEqual({ demoAllowed: false, liveAllowed: false });
    expect(sealingDeployment({ SEALED_BIDS_DEMONSTRATION_ALLOWED: "true" })).toEqual({ demoAllowed: true, liveAllowed: false });
    expect(sealingDeployment({ SEALED_BIDS_LIVE_ALLOWED: "1" })).toEqual({ demoAllowed: false, liveAllowed: true });
  });

  it("is read when asked, from the process's environment by default", () => {
    const before = process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED;
    try {
      process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED = "true";
      expect(demonstrationAllowedByDeployment()).toBe(true);
      process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED = "no";
      expect(demonstrationAllowedByDeployment()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED;
      else process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED = before;
    }
  });
});

describe("the bid upload limit (20e)", () => {
  it("defaults to 3 when unset, zero, negative or not a whole number", () => {
    expect(DEFAULT_BID_UPLOAD_MAX_CONCURRENT).toBe(3);
    for (const v of [undefined, "", "0", "-2", "2.5", "three", " "]) expect(bidUploadMaxConcurrent({ BID_UPLOAD_MAX_CONCURRENT: v }), String(v)).toBe(3);
  });
  it("takes a whole number from 1", () => {
    expect(bidUploadMaxConcurrent({ BID_UPLOAD_MAX_CONCURRENT: "5" })).toBe(5);
    expect(bidUploadMaxConcurrent({ BID_UPLOAD_MAX_CONCURRENT: " 1 " })).toBe(1);
  });
});

describe("the sealing pepper (D4, 20v)", () => {
  it("neither set is not set: LIVE is then refused, and a demonstration may wrap without one", () => {
    expect(sealingPepper({})).toEqual({ status: "NOT_SET" });
    expect(pepperConfigured({})).toBe(false);
  });

  it("both or neither: a name without a value, or a value without a name, is not usable, and is never read as unset", () => {
    expect(sealingPepper({ SEALING_PEPPER_ID: "pepper-2026" })).toEqual({ status: "INVALID", fault: "ID_WITHOUT_KEY" });
    expect(sealingPepper({ SEALING_PEPPER: KEY32 })).toEqual({ status: "INVALID", fault: "KEY_WITHOUT_ID" });
    expect(pepperConfigured({ SEALING_PEPPER: KEY32 })).toBe(false);
  });

  it("a short pepper is refused", () => {
    expect(sealingPepper({ SEALING_PEPPER: KEY31, SEALING_PEPPER_ID: "p" })).toEqual({ status: "INVALID", fault: "TOO_SHORT" });
  });

  it("only exact base64 is taken: no URL-safe letters, no missing padding, no spaces inside", () => {
    const urlSafe = KEY32.replace(/\+/g, "-").replace(/\//g, "_");
    const unpadded = randomBytes(32).toString("base64").replace(/=+$/, "");
    for (const bad of ["not base64 at all!", unpadded, KEY32.slice(0, 10) + " " + KEY32.slice(10), urlSafe === KEY32 ? "a-b_c-d_e-f_g-h_i-j_k-l_m-n_o-p_q-r_s-t_u-v_w-x_y-z_AB" : urlSafe]) {
      expect(sealingPepper({ SEALING_PEPPER: bad, SEALING_PEPPER_ID: "p" }), bad).toEqual({ status: "INVALID", fault: "NOT_BASE64" });
    }
  });

  it("a name outside letters, digits, dot, underscore and hyphen is refused", () => {
    for (const id of ["has space", "hash#inside", "x".repeat(65), "slash/no"]) expect(sealingPepper({ SEALING_PEPPER: KEY32, SEALING_PEPPER_ID: id }), id).toEqual({ status: "INVALID", fault: "ID_INVALID" });
  });

  it("set: the key, and an id that is the name with a check value bound to the key's bytes", () => {
    const r = sealingPepper({ SEALING_PEPPER: ` ${KEY32} `, SEALING_PEPPER_ID: "pepper-2026.10" });
    expect(r.status).toBe("SET");
    if (r.status !== "SET") return;
    expect(r.pepper.key.length).toBe(32);
    expect(r.pepper.id).toMatch(/^pepper-2026\.10#[0-9a-f]{16}$/);
    expect(r.pepper.id).toBe(`pepper-2026.10#${pepperCheckValue(r.pepper.key)}`);
    expect(pepperConfigured({ SEALING_PEPPER: KEY32, SEALING_PEPPER_ID: "pepper-2026.10" })).toBe(true);
  });

  it("the same name with other bytes is another pepper: the act refuses it as not held, before any unwrap, never as a wrong passphrase (20v condition 1)", () => {
    const held = sealingPepper({ SEALING_PEPPER: KEY32, SEALING_PEPPER_ID: "pepper-2026" });
    const restoredWrong = sealingPepper({ SEALING_PEPPER: randomBytes(32).toString("base64"), SEALING_PEPPER_ID: "pepper-2026" });
    if (held.status !== "SET" || restoredWrong.status !== "SET") throw new Error("both should read");
    const wrap = { params: { log2N: 17, r: 8, p: 1, salt: new Uint8Array(16) }, pepperId: held.pepper.id, sealed: { iv: new Uint8Array(12), ct: new Uint8Array(32), tag: new Uint8Array(16) } } satisfies WrappedKey;
    expect(pepperFault(wrap, held.pepper)).toBeNull();
    expect(pepperFault(wrap, restoredWrong.pepper)).toBe("PEPPER_NOT_HELD");
    expect(pepperFault(wrap, null)).toBe("PEPPER_NOT_HELD");
  });

  it("every refusal has words", () => {
    for (const w of Object.values(PEPPER_FAULT_WORDS)) expect(w.length).toBeGreaterThan(20);
  });
});

describe("the deployment notes list every condition (build plan step 6)", () => {
  const notes = readFileSync(path.join(process.cwd(), "docs", "notes", "sealed-bids-deployment.md"), "utf8");
  it.each([
    ["core dumps off", /core dumps? (are |is )?(turned )?off/i],
    ["swap off", /swap (is )?(turned )?off/i],
    ["no proxy logs request bodies", /no (reverse )?proxy[^.]*logs? (a )?request bod/i],
    ["HTTPS only", /HTTPS only/],
    ["the scanner on the same host", /scanner runs on the same host/i],
    ["over a local socket", /local socket/i],
    ["a tmpfs temporary directory", /tmpfs/],
    ["no quarantine or copy", /no quarantine/i],
    ["the pepper backed up apart from the database", /backed up apart from the database/i],
    ["losing the pepper loses every exercise wrapped under it", /losing it loses every exercise wrapped under it/i],
    // Ruling 20y restates 20v's condition: the pepper is kept until no opening of any exercise under it can still follow, with its two cases and one pepper at a time.
    ["the pepper kept until no opening under it can still follow (20y)", /kept, unchanged, until no opening of any exercise wrapped under it can still follow/i],
    ["20y's first case: the exercise cancelled", /the exercise is cancelled/i],
    ["20y's second case: the main opening finalised, and every late bid not admitted or opened at a finalised supplementary opening", /main opening is finalised, \*\*and\*\* every late online bid[^.]*not admitted[^.]*supplementary opening that is itself finalised/i],
    ["one pepper at a time, replaced only by the rule (20y)", /One pepper at a time[\s\S]*may replace it only once\s+no exercise wrapped under the old one can still be opened/i],
    ["anonymous refusals left to the edge access log: method, path and status, never a body", /edge access log[^.]*method, path and status[^.]*never a body/i],
    ["20w's qualified words for the access log", /every attempt by a signed-in person; where the rate limit refuses repeated attempts, the first in each window is logged/],
    ["the demonstration flag", /SEALED_BIDS_DEMONSTRATION_ALLOWED/],
    ["the LIVE flag", /SEALED_BIDS_LIVE_ALLOWED/],
    ["the upload limit", /BID_UPLOAD_MAX_CONCURRENT/],
    ["the pepper's variables", /SEALING_PEPPER_ID/],
  ] as const)("%s", (_what, re) => expect(notes).toMatch(re));

  it("never says every attempt is logged without the qualification (20w)", () => {
    expect(notes).not.toMatch(/every attempt is logged/i);
  });

  it(".env.example documents each variable, absent by default", () => {
    const example = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    for (const name of ["SEALED_BIDS_DEMONSTRATION_ALLOWED", "SEALED_BIDS_LIVE_ALLOWED", "BID_UPLOAD_MAX_CONCURRENT", "SEALING_PEPPER", "SEALING_PEPPER_ID"]) {
      expect(example, name).toMatch(new RegExp(`^# ${name}=`, "m"));
      expect(example, name).not.toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
