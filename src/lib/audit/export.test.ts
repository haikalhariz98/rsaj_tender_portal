import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { actorDisplayName } from "./actor";
import { auditCsv, entriesOnDays, EXPORT_NEEDS_AUDIT_READ_TEXT, exportFault, exportMayBeMadeBy, recordTypeLabel, sha256Hex, type ExportRow } from "./export";
import { toPosix } from "@/lib/scan/files";

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
    // Phase 1b (the plan changes this wording, and says so): every writer now passes who acted, so an unattributed row is one from before sign-in, and says so. (Phase 1a's interim wording, "who acted was not recorded", was true while existing screens still wrote unattributed rows while signed in.)
    expect(file).toContain("Not attributed: before sign-in");
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("names who acted: a person by name, the system by what ran, never a person gone for a row the system wrote (Phase 1b review)", () => {
    const written = (id: string, who: { actorPerson?: { name: string } | null; actorSystemLabel?: string | null }, unattributed = false) =>
      row(id, "2026-09-30T01:00:00Z", { unattributed, actorName: actorDisplayName(who) });
    const lines = auditCsv(
      [written("sys", { actorSystemLabel: "demo loader" }), written("staff", { actorPerson: { name: "Aminah Rahman" } }), written("old", {}, true), written("gone", {})],
      "UTC",
    ).split("\r\n");
    expect(lines[1].endsWith(",System: demo loader")).toBe(true);
    expect(lines[2].endsWith(",Aminah Rahman")).toBe(true);
    expect(lines[3].endsWith(",Not attributed: before sign-in")).toBe(true);
    // Only a row naming neither person nor system reads as a person no longer on record.
    expect(lines[4].endsWith(",A person no longer on record")).toBe(true);
    expect(lines.filter((l) => l.includes("no longer on record"))).toHaveLength(1);
  });

  // Phase 3b, a deliberate change to this test (with a decisions-log line): the export is for a holder of audit.read, which an administrator holds as one and which the organisation may
  // grant to a role, not for the administrator flag alone (ADR 0034 D14: "the audit export needs audit.read").
  it("is for a holder of the permission to read and export the trail: the trail holds the sign-in accounts' history", () => {
    expect(exportMayBeMadeBy(true)).toBe(true);
    expect(exportMayBeMadeBy(false)).toBe(false);
    expect(EXPORT_NEEDS_AUDIT_READ_TEXT).toMatch(/permission/);
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
      return statSync(p).isDirectory() ? (f === "generated" ? [] : files(p)) : /\.tsx?$/.test(f) ? [toPosix(p)] : [];
    });
  it("no source under src/ updates, upserts or deletes an audit entry", () => {
    const offenders = files(join(process.cwd(), "src")).filter((f) => /auditEntry\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("the export names things in words", () => {
  it("reads a core routing entry by its labels, with no model name or field key", () => {
    const file = auditCsv(
      [
        row("c", "2026-09-30T01:00:00Z", {
          entity: "CoreRoutingLevel",
          entityLabel: "Issue 3 — core routing: Director",
          action: "CREATE",
          changes: [{ field: "approverCode", before: null, after: "Director" }],
        }),
      ],
      "UTC",
    );
    expect(file).toContain("Core routing row,Issue 3 — core routing: Director");
    expect(file).toContain("Approved by");
    expect(file).not.toContain("CoreRoutingLevel");
    expect(file).not.toContain("approverCode");
  });

  it("spaces any other model name", () => {
    expect(recordTypeLabel("CoreRoutingStep")).toBe("Core routing step");
    expect(recordTypeLabel("AuthorityRule")).toBe("Authority rule");
    expect(recordTypeLabel("Requisition")).toBe("Requisition");
  });
});

describe("SULIT values never leave in the file (6.7 review M-3)", () => {
  const sulit = row("s", "2026-11-17T08:00:00Z", {
    entity: "OpenedBid",
    entityLabel: "DEMO/SX/0016/2026 · Offer 1",
    changes: [
      { field: "openingPrice", before: null, after: "RM 612,450.30" },
      { field: "companyEstimate", before: null, after: "RM 640,000.00" },
      { field: "estimatePaperCopy", before: null, after: "RM 640,100.00" },
      { field: "letterQuote", before: "", after: "Envelope marked T/16/3" },
      { field: "status", before: "Received", after: "Opened" },
    ],
  });
  const file = auditCsv([sulit], "Asia/Kuala_Lumpur");
  it("the file's bytes hold none of the figures or the quote", () => {
    for (const v of ["612,450.30", "640,000.00", "640,100.00", "T/16/3"]) expect(file).not.toContain(v);
  });
  it("each SULIT change is still listed, its values stated as withheld; other changes read as before", async () => {
    const { SULIT_WITHHELD } = await import("./export");
    const line = file.split("\r\n")[1];
    const changes = JSON.parse(line.slice(line.indexOf('"['), line.lastIndexOf(']"') + 2).slice(1, -1).replace(/""/g, '"')) as { field: string; before: string | null; after: string | null }[];
    expect(changes.slice(0, 4).map((c) => c.after)).toEqual([SULIT_WITHHELD, SULIT_WITHHELD, SULIT_WITHHELD, SULIT_WITHHELD]);
    expect(changes[0].before).toBeNull();
    expect(changes[3].before).toBe("");
    expect(changes[4]).toMatchObject({ before: "Received", after: "Opened" });
    expect(SULIT_WITHHELD).toMatch(/Withheld: SULIT/);
  });
  it("every registered SULIT field is withheld, by the one registry", async () => {
    const { SULIT_FIELDS } = await import("@/lib/sulit-fields");
    const all = auditCsv([row("t", "2026-11-17T08:00:00Z", { changes: SULIT_FIELDS.map((f) => ({ field: f.field, before: "secret-before", after: "secret-after" })) })], "Asia/Kuala_Lumpur");
    expect(all).not.toMatch(/secret-/);
  });
});

describe("the budget commitment's amount is the department estimate, withheld (6.7 re-review)", () => {
  it("a commitment's audit row: the file lists the change, never the figure", async () => {
    const { SULIT_WITHHELD } = await import("./export");
    const file = auditCsv([row("c", "2026-11-17T08:00:00Z", { entity: "BudgetMovement", entityLabel: "CAP26-050 · commitment for DEMO/REQ/0019", changes: [{ field: "kind", before: null, after: "COMMITMENT" }, { field: "committedEstimate", before: null, after: "640000.00" }] })], "Asia/Kuala_Lumpur");
    expect(file).not.toContain("640000.00");
    expect(file).toContain("Amount committed (the department estimate)");
    expect(file).toContain(SULIT_WITHHELD);
  });
  it("every commitment audit writer uses the registered key, never a plain amount", async () => {
    const { readFileSync } = await import("node:fs");
    // Founder, 2026-10-05: approve() moved, unchanged, from the requisition actions to their approval writer.
    for (const p of ["src/lib/requisition/approval-write.ts", "src/lib/integration/requisition-intake.ts", "prisma/demo-award.ts"]) {
      const src = readFileSync(p, "utf8");
      const audits = src.split("\n").filter((l) => /kind: "COMMITMENT", budgetCode/.test(l));
      expect(audits.length, p).toBeGreaterThan(0);
      for (const l of audits) {
        expect(l, p).toMatch(/committedEstimate:/);
        expect(l, p).not.toMatch(/\bamount:/);
      }
    }
  });
});
