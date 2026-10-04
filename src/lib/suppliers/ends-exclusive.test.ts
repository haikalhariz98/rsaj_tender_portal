import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { diffFields } from "@/lib/audit/diff";
import { auditCsv } from "@/lib/audit/export";

import { SUPPLIER_FIELD_NAME } from "./audit-view";
import { blacklistPeriod } from "./blacklist";
import { blacklistEndWords, supplierFaultText } from "./labels";
import { standing, type StandingEventFacts } from "./standing";

/**
 * S-1 (6.15a review): a blacklisting's `endsOn` is exclusive, the free-from day, as every period in the
 * project (budget/periods.ts, effective.ts). Worked example a finance or legal reader can check by hand:
 * effective 1 October 2026 for 60 months stores 1 October 2031; the supplier is blacklisted on
 * 30 September 2031 and free on 1 October 2031.
 */

const event = (endsOn: string | null): StandingEventFacts => ({ id: "b", kind: "BLACKLIST", effectiveOn: "2026-10-01", endsOn, offenceNo: 1, reasonLabel: "False declaration", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: null });
const read = (endsOn: string | null, on: string) => standing({ status: "REGISTERED" }, [event(endsOn)], [], { autoSuspendOnLapse: null }, on);

describe("a first-offence blacklisting's end is exclusive (S-1)", () => {
  it("worked example: effective 2026-10-01 for 60 months stores 2031-10-01", () => {
    const p = blacklistPeriod("2026-10-01", 1, 60).period;
    expect(p).toEqual({ kind: "ENDS", endsOn: "2031-10-01", lastDay: "2031-09-30", months: 60 });
  });

  it("blacklisted on 2031-09-30, the last day; not on 2031-10-01, the free-from day", () => {
    const stored = (blacklistPeriod("2026-10-01", 1, 60).period as { endsOn: string }).endsOn;
    expect(read(stored, "2031-09-30").standing).toBe("BLACKLISTED");
    expect(read(stored, "2031-10-01").standing).toBe("ACTIVE");
    expect(read(stored, "2026-10-01").standing).toBe("BLACKLISTED");
  });

  it("the day it ended is noted with both days, never one ambiguous 'to' day", () => {
    const r = read("2031-10-01", "2031-10-02");
    const note = r.notes.find((n) => n.code === "BLACKLIST_ENDED")!;
    expect(supplierFaultText(note)).toBe("A first-offence blacklisting has ended: last blacklisted day 30 Sep 2031 · free from 01 Oct 2031.");
  });

  it("the screens' words: last blacklisted day and free-from day; no end reads until further notice", () => {
    expect(blacklistEndWords("2031-10-01").en).toBe("Last blacklisted day 30 Sep 2031 · Free from 01 Oct 2031");
    expect(blacklistEndWords(null).en).toBe("Until further notice");
    // Month-end: a period free from 1 March has its last day on 28 February (29 in a leap year).
    expect(blacklistEndWords("2027-03-01").en).toBe("Last blacklisted day 28 Feb 2027 · Free from 01 Mar 2027");
    expect(blacklistEndWords("2028-03-01").en).toBe("Last blacklisted day 29 Feb 2028 · Free from 01 Mar 2028");
  });

  it("no screen says the ambiguous 'To <day>' or 'free from the day after' of a blacklisting any more", () => {
    for (const f of ["src/app/suppliers/page.tsx", "src/app/suppliers/[id]/standing-panels.tsx"]) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/`To \$\{formatDate\(since\.endsOn\)\}`/);
      expect(text).not.toMatch(/free from the day after/);
      expect(text).toMatch(/blacklistEndWords\(/);
    }
  });
});

describe("the audit trail reads the exclusive end correctly (code review #5, M-5)", () => {
  const changes = diffFields(null, { standing: "Blacklisted", effectiveOn: "2026-10-01", lastBlacklistedDay: "2031-09-30", endsOn: "2031-10-01" });

  it("History: last blacklisted day and free from", () => {
    expect(SUPPLIER_FIELD_NAME.lastBlacklistedDay).toBe("Last blacklisted day");
    expect(SUPPLIER_FIELD_NAME.endsOn).toBe("Free from");
  });

  it("the export's 'Ends on (not included)' is now true of the stored day: 1 October 2031 is not blacklisted", () => {
    const csv = auditCsv([{ id: "e1", at: new Date("2026-10-01T02:00:00Z"), entity: "StandingEvent", entityId: "b", entityLabel: "VND-0005 · Blacklisting", action: "CREATE", changes, reason: "", unattributed: true, actorName: null }], "Asia/Kuala_Lumpur");
    expect(csv).toContain('""field"":""Ends on (not included)"",""before"":null,""after"":""2031-10-01""');
    expect(csv).toContain('""field"":""Last blacklisted day"",""before"":null,""after"":""2031-09-30""');
    // And the stored end really is not included: on it the supplier is free.
    expect(read("2031-10-01", "2031-10-01").standing).toBe("ACTIVE");
  });

  it("the action writes the last day and the exclusive end, not the retired inclusive pair", () => {
    const text = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");
    expect(text).toMatch(/lastBlacklistedDay: ends\?\.lastDay \?\? null, endsOn: ends\?\.endsOn \?\? null/);
    expect(text).not.toMatch(/freeFrom: ends/);
  });
});
