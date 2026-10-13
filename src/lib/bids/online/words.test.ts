import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Words } from "@/lib/contract/labels";
import { lex } from "@/lib/scan/source";
import { publishSealingWords } from "@/lib/sealing/ceremony";
import { DOWNLOAD_WORDS } from "@/lib/sealing/grants";
import { PEPPER_NOT_HELD_WORDS } from "@/lib/sealing/kdf";
import { LIVE_ISSUE_WORDS, ONLINE_SUBMISSION_WORDS } from "@/lib/sealing/switch";

import { MASKED_ACTOR_WORDS } from "./audit-mask";
import { RECEIPT_WORDS } from "./receipt";
import { RECEIVED_WORDS } from "./received";
import { myBidOpenedWords } from "./roll";
import { PART_UPLOAD_FAULT_WORDS, submissionWarningWords, SUBMIT_FAULT_WORDS, UPLOAD_BUSY_WORDS, WITHDRAW_FAULT_WORDS } from "./words";

/**
 * Ruling 20j and 20s (build plan step 5): no words constant, receipt or My Bids state calls the receipt, or anything about a bid, "signed" or "proof" (or
 * "verified"). Two scans: every words value the module exports, and every string literal in the online-bid and sealing sources (their comments may say what the
 * words must never say; their strings may not). Whole words only in English: "unsigned" is not "signed".
 *
 * Ruling 20ab: the supplier's words are in English and Malay, so the scans read the Malay too, for the same claims: "tandatangan" (which covers
 * "ditandatangani"), "bukti" (which covers "membuktikan"), "disahkan", "mengesahkan" and "pengesahan". A Malay word is matched anywhere in a word, since Malay
 * builds its forms with affixes.
 */

const FORBIDDEN_EN = /\b(signed|proof|verified)\b/i;
const FORBIDDEN_MS = /tandatangan|bukti|disahkan|mengesahkan|pengesahan/i;
const forbidden = (text: string) => FORBIDDEN_EN.test(text) || FORBIDDEN_MS.test(text);

/// A words value as the scan reads it: an English string, or the portal's `Words`, both languages.
const texts = (v: string | Words): string[] => (typeof v === "string" ? [v] : [v.en, v.ms]);

describe("no words call a receipt or a bid signed, proof or verified, in either language (20j, 20s, 20ab)", () => {
  it("every exported words value", () => {
    const values: string[] = [
      ...Object.values(RECEIPT_WORDS),
      ...Object.values(RECEIVED_WORDS),
      ...Object.values(SUBMIT_FAULT_WORDS),
      ...Object.values(WITHDRAW_FAULT_WORDS),
      ...Object.values(PART_UPLOAD_FAULT_WORDS),
      ...(["MANDATORY_PART_MISSING", "ALTERNATIVE_NOT_CONSIDERED", "REPLACE_REUPLOADS_ALL"] as const).map((code) => submissionWarningWords({ code, label: "Part" })),
      UPLOAD_BUSY_WORDS,
      MASKED_ACTOR_WORDS,
      ...Object.values(LIVE_ISSUE_WORDS),
      ...Object.values(ONLINE_SUBMISSION_WORDS),
      ...Object.values(DOWNLOAD_WORDS),
      PEPPER_NOT_HELD_WORDS,
      ...["KEY_NOT_SET", "KEY_STALE", "RULES_NOT_SET", "PART_TYPES_NOT_SET", "ALTERNATIVES_NOT_STATED", "PEPPER_NOT_SET", "CHANNEL_NOT_SET"].map((code) => publishSealingWords({ code, level: "block", data: { label: "Part", missing: 2 } })),
      ...(["LISTED_NOT_OPENED", "OPENED", "LATE_IN_ROLL", "NOT_IN_ROLL", "REPLACED_OR_WITHDRAWN"] as const).flatMap((state) => {
        const w = myBidOpenedWords({ state, digest: "0".repeat(64), organisationName: "Org" });
        return [w.headline, w.detail];
      }),
    ].flatMap(texts);
    expect(values.length).toBeGreaterThan(100);
    expect(values.filter(forbidden)).toEqual([]);
  });

  it("every string literal in the online-bid and sealing sources", () => {
    const dirs = ["src/lib/bids/online", "src/lib/sealing"].map((d) => path.join(process.cwd(), d));
    const files = dirs.flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).map((n) => path.join(d, n)));
    expect(files.length).toBeGreaterThan(15);
    const hits: string[] = [];
    for (const f of files) {
      const code = lex(readFileSync(f, "utf8"), { only: "comments" });
      code.split("\n").forEach((line, i) => {
        if (forbidden(line)) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("the scan finds such a word in a string, in either language, and not in a comment or inside another English word", () => {
    expect(forbidden(lex(`const a = "a signed receipt";`, { only: "comments" }))).toBe(true);
    expect(forbidden(lex(`// never "signed" or "proof"\nconst a = 1;`, { only: "comments" }))).toBe(false);
    expect(forbidden(`an unsigned receipt`)).toBe(false);
    for (const ms of ["Resit yang ditandatangani", "bukti penyerahan", "Bida anda telah disahkan", "portal mengesahkan resit", "pengesahan bida", "ia membuktikan"]) expect(forbidden(lex(`const a = "${ms}";`, { only: "comments" })), ms).toBe(true);
    expect(forbidden(lex(`// jangan "ditandatangani"\nconst a = 1;`, { only: "comments" }))).toBe(false);
  });
});
