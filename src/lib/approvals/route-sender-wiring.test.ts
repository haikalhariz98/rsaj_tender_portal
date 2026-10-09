import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Decisions log, 2026-10-09, ruling on 1860 and 1867(1): the routes that send tender documents, a negotiation and a change to the window record who sent
 * them, so that person is barred from deciding them as the name's sender is (`routeSenderBarredId` reads `submittedByPersonId`). Held by a source scan, as
 * `recall-wiring.test.ts` holds the name route: vitest has no database. None of the three has a recall, so recording the sender changes no recall.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const fn = (src: string, name: string) => {
  const i = src.indexOf(`function ${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  const j = src.indexOf("\nexport async function ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};

describe("the sender of a tender-documents, negotiation or window-change route is recorded", () => {
  it("tender documents: submitPack begins the sender's own act, writes the sender on the route, and attributes it in that transaction", () => {
    const body = fn(read("src/app/sourcing/[id]/documents/actions.ts"), "submitPack");
    expect(body).toMatch(/beginAct\(actor, data, "ApprovalInstance\.submittedBy", \{ personField: "personId", onBehalf: false \}\)/);
    expect(body).toMatch(/submittedByPersonId: act\.subjectPersonId/);
    expect(body).toMatch(/await act\.write\(tx, instance\.id\)/);
  });

  it("negotiation: the route carries the person who asked, and the same act fills the route's own slot", () => {
    const body = fn(read("src/app/sourcing/[id]/evaluation/meeting-actions.ts"), "requestNegotiation");
    expect(body).toMatch(/submittedByPersonId: person!\.id/);
    expect(body).toMatch(/act\.writeAlso\(tx, "ApprovalInstance\.submittedBy", instance\.id\)/);
  });

  it("window change: both asks begin the sender's own act and pass it to the one function that opens the route", () => {
    const src = read("src/app/sourcing/[id]/window/change-actions.ts");
    for (const name of ["requestClosingChange", "requestCancellation"]) {
      const body = fn(src, name);
      expect(body, name).toMatch(/beginAct\(actor, data, "ApprovalInstance\.submittedBy", \{ personField: "personId", onBehalf: false \}\)/);
      expect(body, name).toMatch(/openChangeRoute\(tx, toAuditActor\(actor\), l, [^)]*, act\)/);
    }
    const open = fn(src, "openChangeRoute");
    expect(open).toMatch(/submittedByPersonId: act\.subjectPersonId/);
    expect(open).toMatch(/await act\.write\(tx, instance\.id\)/);
  });

  it("the three decision acts read that sender through the one rule", () => {
    expect(read("src/app/sourcing/[id]/documents/actions.ts")).toMatch(/routeSenderBarredId\("NAME_APPROVAL", \{ routeSenderId: inst\.submittedByPersonId \}\)/);
    expect(read("src/app/sourcing/[id]/evaluation/meeting-actions.ts")).toMatch(/routeSenderBarredId\("NAME_APPROVAL", \{ routeSenderId: full\.submittedByPersonId \}\)/);
    expect(read("src/app/sourcing/[id]/window/change-actions.ts")).toMatch(/routeSenderBarredId\("NAME_APPROVAL", \{ routeSenderId: full\.submittedByPersonId \}\)/);
  });
});
