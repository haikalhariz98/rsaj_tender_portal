import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";
import { publishSealingWords } from "@/lib/sealing/ceremony";
import { DOWNLOAD_WORDS } from "@/lib/sealing/grants";
import { PEPPER_NOT_HELD_WORDS } from "@/lib/sealing/kdf";
import { LIVE_ISSUE_WORDS, ONLINE_SUBMISSION_WORDS } from "@/lib/sealing/switch";

import { MASKED_ACTOR_WORDS } from "./audit-mask";
import { RECEIPT_WORDS } from "./receipt";
import { RECEIVED_WORDS } from "./received";
import { myBidOpenedWords } from "./roll";
import { PART_UPLOAD_FAULT_WORDS, SUBMIT_FAULT_WORDS, UPLOAD_BUSY_WORDS, WITHDRAW_FAULT_WORDS } from "./words";

/**
 * Ruling 20j and 20s (build plan step 5): no words constant, receipt or My Bids state calls the receipt, or anything about a bid, "signed" or "proof" (or
 * "verified"). Two scans: every words value the module exports, and every string literal in the online-bid and sealing sources (their comments may say what the
 * words must never say; their strings may not). Whole words only: "unsigned" is not "signed".
 */

const FORBIDDEN = /\b(signed|proof|verified)\b/i;

describe("no words call a receipt or a bid signed, proof or verified (20j, 20s)", () => {
  it("every exported words value", () => {
    const values: string[] = [
      ...Object.values(RECEIPT_WORDS),
      ...Object.values(RECEIVED_WORDS),
      ...Object.values(SUBMIT_FAULT_WORDS),
      ...Object.values(WITHDRAW_FAULT_WORDS),
      ...Object.values(PART_UPLOAD_FAULT_WORDS),
      UPLOAD_BUSY_WORDS,
      MASKED_ACTOR_WORDS,
      ...Object.values(LIVE_ISSUE_WORDS),
      ...Object.values(ONLINE_SUBMISSION_WORDS),
      ...Object.values(DOWNLOAD_WORDS),
      PEPPER_NOT_HELD_WORDS,
      ...["KEY_NOT_SET", "KEY_STALE", "RULES_NOT_SET", "PART_TYPES_NOT_SET", "ALTERNATIVES_NOT_STATED", "PEPPER_NOT_SET"].map((code) => publishSealingWords({ code, level: "block", data: { label: "Part", missing: 2 } })),
      ...(["LISTED_NOT_OPENED", "OPENED", "LATE_IN_ROLL", "NOT_IN_ROLL", "REPLACED_OR_WITHDRAWN"] as const).flatMap((state) => Object.values(myBidOpenedWords({ state, digest: "0".repeat(64), organisationName: "Org" })).filter((v): v is string => typeof v === "string")),
    ];
    expect(values.length).toBeGreaterThan(60);
    expect(values.filter((v) => FORBIDDEN.test(v))).toEqual([]);
  });

  it("every string literal in the online-bid and sealing sources", () => {
    const dirs = ["src/lib/bids/online", "src/lib/sealing"].map((d) => path.join(process.cwd(), d));
    const files = dirs.flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).map((n) => path.join(d, n)));
    expect(files.length).toBeGreaterThan(15);
    const hits: string[] = [];
    for (const f of files) {
      const code = lex(readFileSync(f, "utf8"), { only: "comments" });
      code.split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("the scan finds such a word in a string, and not in a comment or inside another word", () => {
    expect(FORBIDDEN.test(lex(`const a = "a signed receipt";`, { only: "comments" }))).toBe(true);
    expect(FORBIDDEN.test(lex(`// never "signed" or "proof"\nconst a = 1;`, { only: "comments" }))).toBe(false);
    expect(FORBIDDEN.test(`an unsigned receipt`)).toBe(false);
  });
});
