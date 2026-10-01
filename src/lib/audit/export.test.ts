import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { auditCsv, entriesOnDays, exportFault, sha256Hex, type ExportRow } from "./export";

const row = (id: string, at: string, over: Partial<ExportRow> = {}): ExportRow => ({
  id,
  at: new Date(at),
  entity: "Requisition",
  entityId: "r1",
  entityLabel: "REQ/1 · Pumps",
  action: "UPDATE",
  changes: [{ field: "status", before: "DRAFT", after: "ENDORSED" }],
  reason: "",
  unattributed: true,
  actorName: null,
  ...over,
});

describe("the audit export (FR-APR-015)", () => {
  it("is the same bytes, and the same digest, for the same rows", () => {
    const rows = [row("a", "2026-09-30T01:00:00Z"), row("b", "2026-09-30T02:00:00Z", { reason: 'Said "no", twice,\nthen yes' })];
    const one = auditCsv(rows, "Asia/Kuala_Lumpur");
    expect(auditCsv(rows, "Asia/Kuala_Lumpur")).toBe(one);
    expect(sha256Hex(one)).toBe(sha256Hex(auditCsv(rows, "Asia/Kuala_Lumpur")));
    expect(sha256Hex(one)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the digest when any byte of the file changes — the file is tamper-evident", () => {
    const file = auditCsv([row("a", "2026-09-30T01:00:00Z")], "Asia/Kuala_Lumpur");
    expect(sha256Hex(file.replace("ENDORSED", "APPROVED"))).not.toBe(sha256Hex(file));
  });

  it("matches the known SHA-256 of a fixed text", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("quotes what CSV must quote, and says an entry was not attributed rather than leaving it blank", () => {
    const file = auditCsv([row("b", "2026-09-30T02:00:00Z", { reason: 'Said "no", then yes' })], "UTC");
    expect(file).toContain('"Said ""no"", then yes"');
    expect(file).toContain("Not attributed: no sign-in");
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("takes the organisation's day, not UTC's: 23:30 UTC on 30 September is 1 October in Kuala Lumpur", () => {
    const rows = [row("a", "2026-09-30T23:30:00Z"), row("b", "2026-09-30T10:00:00Z")];
    expect(entriesOnDays(rows, "2026-10-01", "2026-10-01", "Asia/Kuala_Lumpur").map((r) => r.id)).toEqual(["a"]);
    expect(entriesOnDays(rows, "2026-09-30", "2026-09-30", "Asia/Kuala_Lumpur").map((r) => r.id)).toEqual(["b"]);
  });

  it("orders oldest first, ties by id", () => {
    const rows = [row("b", "2026-09-30T01:00:00Z"), row("a", "2026-09-30T01:00:00Z"), row("c", "2026-09-30T00:00:00Z")];
    expect(entriesOnDays(rows, "2026-09-30", "2026-09-30", "UTC").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("refuses with no time zone, no range, a reversed range, or days not yet over", () => {
    expect(exportFault("2026-09-01", "2026-09-30", null)).toBe("TIME_ZONE_UNSET");
    expect(exportFault(null, "2026-09-30", "2026-10-01")).toBe("RANGE_REQUIRED");
    expect(exportFault("2026-09-30", "2026-09-01", "2026-10-01")).toBe("RANGE_REVERSED");
    expect(exportFault("2026-09-01", "2026-10-02", "2026-10-01")).toBe("RANGE_IN_FUTURE");
    expect(exportFault("2026-09-01", "2026-10-01", "2026-10-01")).toBeNull();
  });
});

describe("the trail is immutable in the application (FR-APR-015)", () => {
  // No application path may alter or delete a trail entry. Demo tooling (prisma/) may,
  // by ruling, until the database itself refuses; nothing under src/ may.
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === "generated" ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
    });
  it("no source under src/ updates, upserts or deletes an audit entry", () => {
    const offenders = files(join(process.cwd(), "src")).filter((f) => /auditEntry\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
