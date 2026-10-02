import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatDate, formatOrgDay } from "@/lib/format";

/**
 * Phase 1 carry item 10 and Phase 2 close-out 68-C5: an instant is shown and judged on the
 * organisation's day (formatOrgDay, formatOrgDateTime, dayOf), never as a stored day (formatDate,
 * storedDay, toISOString().slice(0, 10)), which reads it in UTC: 07:30 in Kuala Lumpur is the day
 * before in UTC. The fields below are written only from the server's clock (now, new Date(), or a
 * Prisma default), so a day read of one is always wrong. A field a writer fills with a typed day
 * (a route's openedAt, an award's issuedAt) is a stored day and is not listed.
 */

const INSTANT_FIELDS = ["submittedAt", "frozenAt", "finalisedAt", "clearedAt", "createdAt", "updatedAt", "storedAt", "startedAt", "formedAt", "closedAt", "minutedAt", "withdrawnAt", "publishedAt", "recordedAt", "verdictAt", "requestedAt", "grantedAt", "verifiedAt", "erpSyncedAt"] as const;

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    if (statSync(join(process.cwd(), p)).isDirectory()) return f === "generated" ? [] : walk(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("an instant is never read as a stored day (item 10, 68-C5)", () => {
  it("07:30 in Kuala Lumpur: formatDate shows the UTC day before, formatOrgDay the organisation's day", () => {
    const at = new Date("2026-09-30T23:30:00Z");
    expect(formatDate(at)).toBe("30 Sep 2026");
    expect(formatOrgDay(at, "Asia/Kuala_Lumpur")).toBe("01 Oct 2026");
  });

  it("no formatDate, storedDay or ISO slice of a server-clock field anywhere in src (source scan)", () => {
    const f = INSTANT_FIELDS.join("|");
    const read = new RegExp(`(formatDate|storedDay)\\([A-Za-z_!.?]*\\b(${f})\\b|\\.(${f})!?\\.toISOString\\(\\)\\.slice\\(0, ?10\\)`);
    const hits = walk("src").filter((p) => read.test(readFileSync(join(process.cwd(), p), "utf8")));
    expect(hits).toEqual([]);
  });
});
