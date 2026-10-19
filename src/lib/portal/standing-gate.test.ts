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

  it("refuses keeping the registration current to every standing that bars, a suspended supplier included (the ruling: every act but reading); its renewal is then given on paper", () => {
    for (const standing of ["SUSPENDED", "SUSPENDED_ON_LAPSE", "BLACKLISTED", "CANCELLED"] as const) {
      const bar = portalStandingBar({ status: "REGISTERED", standing, kind: "COMPANY_RECORD" });
      expect(bar, standing).not.toBeNull();
      expect(bar?.en).toMatch(/on paper/);
    }
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
  // Wave 3a (SR-10): buying and paying for the documents online asks the standing (the buyer's reading, and again at the payment).
  "src/lib/portal/bids/purchase-store.ts",
  "src/lib/portal/projects/submission-store.ts",
  "src/lib/portal/projects/certificate-store.ts",
  "src/lib/portal/company/bank-store.ts",
  "src/lib/portal/company/replace-store.ts",
] as const;

/// Stores that write and do not ask, with the reason. A store added to the portal must be in one list or the other.
const EXEMPT: Readonly<Record<string, string>> = {
  "src/lib/portal/projects/diary-store.ts": "its acts run through `inHeldContract` (submission-store.ts), which asks",
  "src/lib/portal/bids/inspection-store.ts": "opening the tender documents is a read, and is logged (log 2026-10-09, 1915)",
  "src/lib/portal/data-export-store.ts": "the supplier's export of its own data (N2, PDPA right of access) is a read: it writes only its own log row, its audit row and the SULIT access events, and ruling 1875(3) lets a barred supplier read",
  "src/lib/portal/bids/download-store.ts": "downloading what a released purchase releases is a read, and is logged; the release is judged on the request by the rule that opens the documents on screen (SR-10)",
  "src/lib/portal/bids/rate-store.ts": "the per-account throttle counter (SR-10 review SEC-2): it records that an account asked, not an act, and must count a barred supplier's tries too, so it is not gated",
  "src/lib/portal/bids/purchase-paid.ts": "the one writer of paid, called only inside purchase-store.ts (which asks the standing) and an officer's recording of a receipt (a staff act); it reads the register itself on the locked supplier row (SR-10)",
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
