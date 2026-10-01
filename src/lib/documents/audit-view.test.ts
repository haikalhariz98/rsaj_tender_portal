import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { attached, detached, repinAudit, replacedBecause } from "./audit-view";

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
