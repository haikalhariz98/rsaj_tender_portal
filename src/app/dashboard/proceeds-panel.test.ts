import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProceedsFigures, ProceedsRow } from "@/lib/funding/store";
import type { Sen } from "@/lib/money";

import { ProceedsPanel } from "./proceeds-panel";

/** Dashboard › Use of proceeds: a source whose figures cannot be read never prints a committed-of-envelope figure (review finding 1). */

const row = (over: Partial<ProceedsRow> = {}): ProceedsRow => ({
  code: "SUK", label: "Sukuk", envelope: 1_000_000n as Sen, committed: 400_000n as Sen, certified: 0n as Sen, certifiedPartial: false, paid: 0n as Sen, unallocated: 600_000n as Sen, contracts: 1, refused: [], ...over,
});
const view = (selected: ProceedsRow) =>
  renderToStaticMarkup(h(ProceedsPanel, { f: { tab: "proceeds", fy: null as unknown as ProceedsFigures["fy"], rows: [selected], selected: { ...selected, projects: [], awaitingAward: { count: 0, href: "/requisitions" } } } }));

describe("a source's detail header", () => {
  it("reads committed of the envelope", () => {
    expect(view(row())).toContain("RM4,000 of RM10,000");
  });

  it("says it cannot be read when any contract is refused, the same guard as the callout", () => {
    const html = view(row({ refused: [{ contractId: "c1", label: "C/1 · Tank", reason: "IPC 3 cannot be read." }] }));
    expect(html).not.toContain("RM4,000 of RM10,000");
    expect(html).toContain("Cannot be read");
    expect(html).toContain("Some figures cannot be read");
  });
});
