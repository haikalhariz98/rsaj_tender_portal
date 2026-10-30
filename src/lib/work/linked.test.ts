import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EOT_CLAIM_STATES } from "@/lib/time/claim-state";

import { LINKED_CARDS_PINNED } from "./bounds";
import { linkedAddress, linkedCardColumn, linkedMovesWhen, linkedPhase, linkedRegisterHref, parseLinkedAddress, pinnedCards, type LinkedCard } from "./linked";

const today = "2026-11-05";

describe("linkedCardColumn (0008 4.6)", () => {
  it.each([
    [{ kind: "VARIATION", state: "DRAFT" }, "TO_DO"],
    [{ kind: "VARIATION", state: "WITH_SO" }, "IN_PROGRESS"],
    [{ kind: "VARIATION", state: "AWAITING_APPROVAL" }, "IN_REVIEW"],
    [{ kind: "EOT_CLAIM", state: "ANSWERED" }, "IN_PROGRESS"],
    [{ kind: "EOT_CLAIM", state: "SENT" }, "IN_REVIEW"],
    [{ kind: "CERTIFICATE", state: "DRAFT" }, "TO_DO"],
    [{ kind: "CERTIFICATE", state: "IN_ROUTING" }, "IN_REVIEW"],
    [{ kind: "CERTIFICATE", state: "SIGNING" }, "IN_REVIEW"],
  ] as const)("%j sits in %s whatever the date", (s, col) => {
    expect(linkedCardColumn(s, null, today)).toBe(col);
  });

  it("decided and withdrawn show in Done for 14 days, today counted, then leave the board", () => {
    const issued = { kind: "CERTIFICATE", state: "ISSUED" } as const;
    const voided = { kind: "CERTIFICATE", state: "VOID" } as const;
    expect(linkedCardColumn(issued, "2026-11-05", today)).toBe("DONE");
    expect(linkedCardColumn(voided, "2026-10-23", today)).toBe("DONE"); // 13 days back
    expect(linkedCardColumn(voided, "2026-10-22", today)).toBeNull(); // 14 days back
    expect(linkedCardColumn({ kind: "VARIATION", state: "CLOSED" }, null, today)).toBeNull(); // no date: cannot be shown as recent
  });

  it("every EOT state is placed", () => {
    for (const s of EOT_CLAIM_STATES) expect(linkedPhase({ kind: "EOT_CLAIM", state: s })).toBeTruthy();
  });
});

describe("addresses and words", () => {
  it("round-trips a panel address and refuses anything else", () => {
    expect(parseLinkedAddress(linkedAddress("EOT_CLAIM", "c1x"))).toEqual({ kind: "EOT_CLAIM", id: "c1x" });
    expect(parseLinkedAddress("EOT_CLAIM:../x")).toBeNull();
    expect(parseLinkedAddress("NOPE:1")).toBeNull();
    expect(parseLinkedAddress(null)).toBeNull();
  });
  it("opens to its register", () => {
    expect(linkedRegisterHref("k1", "VARIATION", "v1")).toBe("/projects/k1/variations/v1");
    expect(linkedRegisterHref("k1", "EOT_CLAIM", "m1")).toBe("/projects/k1/eot/m1");
    expect(linkedRegisterHref("k1", "CERTIFICATE", "c1")).toBe("/projects/k1/certificates/c1");
  });
  it("a refused drag says the act's words", () => {
    expect(linkedMovesWhen("VARIATION")).toBe("Moves when the variation is decided. Open it to act.");
  });
});

describe("pinnedCards", () => {
  const card = (i: number, column: LinkedCard["column"]): LinkedCard => ({ kind: "VARIATION", id: `v${i}`, label: `Variation ${i}`, stateWords: "x", column, decidedOn: null });
  it("caps at the bound and counts the rest", () => {
    const many = Array.from({ length: LINKED_CARDS_PINNED + 3 }, (_, i) => card(i, "TO_DO"));
    const r = pinnedCards(many);
    expect(r.cards).toHaveLength(LINKED_CARDS_PINNED);
    expect(r.more).toBe(3);
  });
  it("orders by column, then label with numbers as numbers", () => {
    expect(pinnedCards([card(10, "TO_DO"), card(2, "TO_DO"), card(1, "DONE")]).cards.map((c) => c.label)).toEqual(["Variation 2", "Variation 10", "Variation 1"]);
  });
});

describe("linked cards never read a routed value", () => {
  it("no linked file names matterRoutedValue", () => {
    for (const f of ["linked.ts", "linked/load.ts"]) expect(readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n")).not.toContain("matterRoutedValue");
  });
});
