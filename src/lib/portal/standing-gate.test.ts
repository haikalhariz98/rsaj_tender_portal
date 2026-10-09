import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { portalStandingBar, standingBarFinding } from "./standing-gate";

// Decisions log, 2026-10-09, ruling on 1875(3): a rejected, suspended or blacklisted supplier may sign in to read its own status; every act but reading is refused to it with the standing in words.

describe("what a standing lets a supplier do in the portal", () => {
  it("lets an active supplier do both kinds of act", () => {
    expect(portalStandingBar({ status: "REGISTERED", standing: "ACTIVE", kind: "TRANSACT" })).toBeNull();
    expect(portalStandingBar({ status: "REGISTERED", standing: "ACTIVE", kind: "COMPANY_RECORD" })).toBeNull();
  });

  it("refuses a rejected supplier everything but reading, saying its registration was not accepted", () => {
    for (const kind of ["TRANSACT", "COMPANY_RECORD"] as const) {
      const bar = portalStandingBar({ status: "REJECTED", standing: "NOT_REGISTERED", kind });
      expect(bar?.en, kind).toMatch(/registration was not accepted/);
      expect(bar?.en).toMatch(/still sign in and read your status/);
      expect(bar?.ms.length).toBeGreaterThan(20);
    }
  });

  it("refuses a transaction to every standing that bars, naming it in words", () => {
    const named = { BLACKLISTED: /blacklisted/, CANCELLED: /registration cancelled/, SUSPENDED: /suspended/, SUSPENDED_ON_LAPSE: /suspended on lapse/ } as const;
    for (const [standing, words] of Object.entries(named)) {
      const bar = portalStandingBar({ status: "REGISTERED", standing: standing as keyof typeof named, kind: "TRANSACT" });
      expect(bar?.en, standing).toMatch(words);
      expect(bar?.en).toMatch(/on paper/);
    }
  });

  it("keeps the way back open: a suspended supplier may still send the renewal that lifts the suspension, a blacklisted or cancelled one may not", () => {
    expect(portalStandingBar({ status: "REGISTERED", standing: "SUSPENDED", kind: "COMPANY_RECORD" })).toBeNull();
    expect(portalStandingBar({ status: "REGISTERED", standing: "SUSPENDED_ON_LAPSE", kind: "COMPANY_RECORD" })).toBeNull();
    expect(portalStandingBar({ status: "REGISTERED", standing: "BLACKLISTED", kind: "COMPANY_RECORD" })).not.toBeNull();
    expect(portalStandingBar({ status: "REGISTERED", standing: "CANCELLED", kind: "COMPANY_RECORD" })).not.toBeNull();
  });

  it("an applicant that is not registered yet is not barred by standing: it is mid-application", () => {
    expect(portalStandingBar({ status: "APPLICANT", standing: "NOT_REGISTERED", kind: "COMPANY_RECORD" })).toBeNull();
  });

  it("gives every domain the same finding, with both languages in its data", () => {
    const bar = portalStandingBar({ status: "REJECTED", standing: "NOT_REGISTERED", kind: "TRANSACT" })!;
    expect(standingBarFinding(bar)).toEqual({ code: "SUPPLIER_STANDING_BARS", level: "block", data: { en: bar.en, ms: bar.ms } });
  });
});

// ---- the scan: no write act of the portal is left that forgets to ask

const ROOT = path.join(process.cwd(), "src/lib/portal");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) && !/\.(test|fixture)\.ts$/.test(n) ? [p] : [];
  });
const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");

/// The stores that write for a signed-in supplier and ask the standing before they do. Each is held to the call below.
const GATED = [
  "src/lib/portal/bids/acknowledge-store.ts",
  "src/lib/portal/bids/signup-store.ts",
  "src/lib/portal/bids/request-store.ts",
  "src/lib/portal/projects/submission-store.ts",
  "src/lib/portal/projects/certificate-store.ts",
  "src/lib/portal/company/bank-store.ts",
  "src/lib/portal/company/replace-store.ts",
] as const;

/// Stores that write and do not ask, with the reason. A store added to the portal must be in one list or the other.
const EXEMPT: Readonly<Record<string, string>> = {
  "src/lib/portal/projects/diary-store.ts": "its acts run through `inHeldContract` (submission-store.ts), which asks",
  "src/lib/portal/bids/inspection-store.ts": "opening the tender documents is a read, and is logged (log 2026-10-09, 1915)",
  "src/lib/portal/registration/declaration.ts": "the online application of an applicant, not yet on the register: its status is judged by `registration/state.ts`",
  "src/lib/portal/registration/draft-store.ts": "the online application of an applicant, not yet on the register: its status is judged by `registration/state.ts`",
  "src/lib/portal/registration/submit-store.ts": "the online application of an applicant, not yet on the register: its status is judged by `registration/state.ts`",
  "src/lib/portal/registration/upload-store.ts": "the online application of an applicant, not yet on the register: its status is judged by `registration/state.ts`",
};

describe("every write of the portal asks the supplier's standing", () => {
  const writers = walk(ROOT)
    .filter((f) => /\.(create|update|updateMany|upsert|delete|createMany)\(|storeUpload|writeAudit|recordSignature/.test(readFileSync(f, "utf8")))
    .map(rel);

  it("has no writing store that is neither gated nor exempt with a reason", () => {
    const known = new Set<string>([...GATED, ...Object.keys(EXEMPT)]);
    expect(writers.filter((f) => !known.has(f))).toEqual([]);
  });

  it("holds each gated store to the call", () => {
    for (const f of GATED) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src, f).toMatch(/portalStandingBarOf\(tx, actor, "(TRANSACT|COMPANY_RECORD)"/);
      expect(src, f).toMatch(/standingBarFinding\(bar\)/);
    }
  });

  it("holds the diary to the shared gate", () => {
    expect(readFileSync(path.join(process.cwd(), "src/lib/portal/projects/diary-store.ts"), "utf8")).toMatch(/inHeldContract\(/);
  });
});
