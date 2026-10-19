import { describe, expect, it } from "vitest";

import { finalisedSummary, openingParts, type OpeningPartsInput } from "./card-parts";

// Note 0005 R13 and R14 (2026-10-20): the opening's parts, one line each; the first unfinished part is open.
const base: OpeningPartsInput = {
  kind: "MAIN",
  finalised: false,
  panel: [{ present: true, authorised: true }, { present: true, authorised: true }, { present: false, authorised: false }],
  authorisationsRequired: 2,
  panelSizeSet: true,
  independenceNotSet: false,
  independenceAssumed: false,
  rulesNotSet: false,
  authoriseNow: false,
  boxLockedAt: "3 Oct 2026, 09:55",
  withdrawalActNow: false,
  envelopes: [{ opened: true }, { opened: true }],
  offers: 2,
  checklistCells: 6,
  unanswered: 6,
  notJudged: 0,
  notReturned: 0,
  pages: null,
  signatures: 0,
  signaturesLeft: 3,
  signNow: false,
  outstanding: 2,
};
const byId = (i: OpeningPartsInput, target?: string) => Object.fromEntries(openingParts(i, target).map((p) => [p.id, p]));

describe("openingParts", () => {
  it("opens the first unfinished part and closes the finished ones before it", () => {
    const p = byId(base);
    expect(p.panel.open).toBe(false);
    expect(p.box.open).toBe(false);
    expect(p.envelopes.open).toBe(false);
    expect(p.offers.open).toBe(false);
    expect(p.checklist.open).toBe(true);
    expect(p.schedule.open).toBe(false);
  });

  it("writes the summaries the ruling names", () => {
    const p = byId(base);
    expect(p.panel.summary).toBe("2 of 3 present · 2 authorised");
    expect(p.box.summary).toBe("Locked 3 Oct 2026, 09:55");
    expect(p.envelopes.summary).toBe("2 of 2 opened");
    expect(p.offers.summary).toBe("2 read");
    expect(p.finalising.summary).toBe("2 outstanding");
  });

  it("says Not recorded, as a chip, when the box was never recorded as locked or the schedule has no pages", () => {
    const p = byId({ ...base, boxLockedAt: null });
    expect(p.box.chips).toEqual([{ kind: "badge", text: "Not recorded", tone: "warn" }]);
    expect(byId(base).schedule.chips).toEqual([{ kind: "badge", text: "Not recorded", tone: "warn" }]);
  });

  it("opens a checklist that holds an item whose return rule is not set, wherever it sits, and counts it", () => {
    const p = byId({ ...base, unanswered: 0, notJudged: 2, pages: 4, signatures: 3, signaturesLeft: 0 });
    expect(p.checklist.summary).toBe("2 not judged");
    expect(p.checklist.open).toBe(true);
  });

  it("repeats the price mark on the offers line, and Not checked on the checklist line", () => {
    const p = byId({ ...base, notReturned: 1 });
    expect(p.offers.chips).toEqual([{ kind: "sulit" }]);
    expect(p.checklist.chips).toEqual([{ kind: "badge", text: "Not checked", tone: "warn" }]);
    expect(byId({ ...base, offers: 0 }).offers.chips).toEqual([]);
  });

  it("repeats Not set and Assumed on the panel line, and opens the panel for an independence rule that is not set", () => {
    const p = byId({ ...base, panelSizeSet: false, independenceAssumed: true });
    expect(p.panel.chips.map((c) => (c.kind === "badge" ? c.text : c.kind))).toEqual(["Not set", "Assumed"]);
    expect(p.panel.open).toBe(false);
    expect(byId({ ...base, independenceNotSet: true }).panel.open).toBe(true);
  });

  it("keeps every blocking fault visible: finalising opens whenever one is listed, and closes on none", () => {
    expect(byId(base).finalising.open).toBe(true);
    const clear = byId({ ...base, outstanding: 0, unanswered: 0, pages: 2, signatures: 3, signaturesLeft: 0 });
    expect(clear.finalising.summary).toBe("Nothing outstanding");
    expect(clear.finalising.open).toBe(false);
  });

  it("opens the panel when the viewer has an authorisation to give", () => {
    expect(byId({ ...base, authoriseNow: true }).panel.open).toBe(true);
  });

  it("has no box part for a supplementary opening, and the sequence skips it", () => {
    const ids = openingParts({ ...base, kind: "SUPPLEMENTARY" }).map((p) => p.id);
    expect(ids).not.toContain("box");
    expect(byId({ ...base, kind: "SUPPLEMENTARY", boxLockedAt: null }).panel.open).toBe(false);
  });

  it("opens the part the address points at, and shows no finalising part once finalised", () => {
    expect(byId(base, "panel").panel.open).toBe(true);
    const done = openingParts({ ...base, finalised: true, unanswered: 0, pages: 2, signatures: 3, signaturesLeft: 0 });
    expect(done.map((p) => p.id)).not.toContain("finalising");
    expect(done.every((p) => !p.open)).toBe(true);
  });

  it("opens the panel while the sitting still needs an authorisation", () => {
    const p = byId({ ...base, panel: [{ present: true, authorised: false }, { present: true, authorised: false }] });
    expect(p.panel.open).toBe(true);
    expect(p.box.open).toBe(false);
  });

  it("reads a finalised card as one line", () => {
    expect(finalisedSummary("3 Oct 2026", 5)).toBe("Finalised 3 Oct 2026 · 5 offers");
    expect(finalisedSummary("3 Oct 2026", 1)).toBe("Finalised 3 Oct 2026 · 1 offer");
  });
});
