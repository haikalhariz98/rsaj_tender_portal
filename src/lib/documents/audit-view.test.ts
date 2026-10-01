import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { attached, detached, filed, holdPlaced, holdReleased, repinAudit, replacedBecause, trailEntry, trailLabel, versionWithdrawn } from "./audit-view";

/**
 * Review carry 6: a new version moving a pin is two trail entries, each under its own
 * attachment's id — the old one closed, the new one created — so either attachment's
 * history reads whole without the other.
 */
describe("a new version moving a pin, as the trail records it", () => {
  const plan = repinAudit({
    purpose: "DOSSIER_EVIDENCE",
    title: "Distributor's letter of sole authority",
    owner: "DEMO/SX/0002/2026",
    reason: "Rescanned with both pages.",
    from: { attachmentId: "att1", versionNo: 1 },
    to: { attachmentId: "att2", versionNo: 2, sha256: "b".repeat(64) },
  });

  it("closes the old attachment under its own id, naming the version that replaced it and why", () => {
    expect(plan[0].entityId).toBe("att1");
    expect(plan[0].action).toBe("UPDATE");
    expect(plan[0].changes).toEqual(detached({ purpose: "DOSSIER_EVIDENCE", title: "Distributor's letter of sole authority", versionNo: 1, reason: "Replaced by version 2: Rescanned with both pages." }));
  });

  it("opens the new attachment as a CREATE under its own id, with the version and fingerprint it pins", () => {
    expect(plan[1].entityId).toBe("att2");
    expect(plan[1].action).toBe("CREATE");
    expect(plan[1].changes).toEqual(attached({ purpose: "DOSSIER_EVIDENCE", title: "Distributor's letter of sole authority", versionNo: 2, sha256: "b".repeat(64), owner: "DEMO/SX/0002/2026" }));
  });

  it("the closed attachment's reason is the one the row stores", () => {
    expect(replacedBecause(2, "Rescanned with both pages.")).toBe("Replaced by version 2: Rescanned with both pages.");
  });
});

describe("attachNewVersion and the demo loader write that shape (source scan)", () => {
  it("both write every entry repinAudit plans, and neither the old single UPDATE", () => {
    for (const p of ["src/app/documents/actions.ts", "prisma/demo-documents.ts"]) {
      const text = readFileSync(`${process.cwd()}/${p}`, "utf8");
      expect(text, p).toMatch(/for \(const e of repinAudit\(/);
      expect(text, p).not.toMatch(/\brepinned\(/);
    }
  });
});

describe("the trail as the drawer reads it", () => {
  const day = (iso: string) => `D(${iso})`;
  const entry = (over: Partial<Parameters<typeof trailEntry>[0]>) => ({ entity: "Document", entityLabel: "Document · T", action: "CREATE", reason: null, changes: [], ...over });

  it("labels a withdrawal as a sentence and shows its reason once", () => {
    const e = trailEntry(entry({ entity: "DocumentVersion", entityLabel: "Document · T · version 1", action: "UPDATE", reason: "The scan was missing its second page.", changes: versionWithdrawn({ versionNo: 1, reason: "The scan was missing its second page." }) }), day);
    expect(e.label).toBe("Version 1 withdrawn");
    expect(e.reason).toBe("The scan was missing its second page.");
    expect(e.changes).toEqual([]);
  });

  it("takes the reason from the changes where the entry has none, and never repeats it as a change", () => {
    const e = trailEntry(entry({ entity: "LegalHold", entityLabel: "Document · T · legal hold", changes: holdPlaced({ reason: "Audit query", placedBy: "A" }) }), day);
    expect(e.label).toBe("Legal hold placed");
    expect(e.reason).toBe("Audit query");
    expect(e.changes.map((c) => c.field)).toEqual(["placedBy"]);
    expect(trailEntry(entry({ entity: "LegalHold", action: "UPDATE", changes: holdReleased({ reason: "Closed", releasedBy: "B" }) }), day).label).toBe("Legal hold released");
  });

  it("names the record an attachment was put on or taken off", () => {
    expect(trailLabel({ entity: "DocumentAttachment", entityLabel: "DEMO/SX/0002/2026 · Dossier evidence", action: "CREATE", changes: [] })).toBe("Attached to DEMO/SX/0002/2026");
    expect(trailLabel({ entity: "DocumentAttachment", entityLabel: "DEMO/SX/0002/2026 · Dossier evidence", action: "UPDATE", changes: [] })).toBe("Taken off DEMO/SX/0002/2026");
  });

  it("does not list the record an attachment went on beneath a label that names it", () => {
    const e = trailEntry(entry({ entity: "DocumentAttachment", entityLabel: "DEMO/SX/1 · Dossier evidence", changes: attached({ purpose: "DOSSIER_EVIDENCE", title: "T", versionNo: 1, sha256: "a".repeat(64), owner: "DEMO/SX/1" }) }), day);
    expect(e.label).toBe("Attached to DEMO/SX/1");
    expect(e.changes.map((c) => c.field)).not.toContain("attachedTo");
  });

  it("reads a day in a change as a day", () => {
    const e = trailEntry(entry({ entity: "DocumentVersion", entityLabel: "Document · T · version 2", changes: [{ field: "receivedOn", before: null, after: "2026-08-12" }, { field: "version", before: null, after: "2" }] }), day);
    expect(e.changes.find((c) => c.field === "receivedOn")?.after).toBe("D(2026-08-12)");
    expect(e.changes.find((c) => c.field === "version")?.after).toBe("2");
  });

  it("says Filed for the status change that files a document", () => {
    expect(trailEntry(entry({ action: "UPDATE", changes: filed() }), day)).toMatchObject({ label: "Filed", changes: [] });
  });
});
