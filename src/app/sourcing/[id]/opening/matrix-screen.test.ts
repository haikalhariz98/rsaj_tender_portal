import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ADDENDUM_DAY_HELD_TEXT, CELL_WORDS } from "@/lib/opening/matrix";
import type { MatrixView } from "@/lib/opening/matrix-read";

vi.mock("./actions", () => ({ recordChecklistAnswer: async () => ({ ok: true }), recordVerdict: async () => ({ ok: true }) }));
vi.mock("./editors", () => ({
  InitialDrawer: ({ own }: { own?: boolean }) => h("button", null, own ? "Confirm this column" : "Initial"),
  VerdictDrawer: ({ options }: { options: { value: string }[] }) => h("button", { "data-options": options.map((o) => o.value).join(",") }, "Record the verdict"),
}));

import { OpeningMatrix } from "./matrix";

const allowed = { allowed: true } as const;
const cell = (itemKey: string, kind: MatrixView["columns"][number]["cells"][number]["kind"], extra: Partial<MatrixView["columns"][number]["cells"][number]> = {}) => ({ itemKey, kind, fileIds: [], acknowledgedOn: null, answer: null, filed: [], ...extra });
const column = (cells: MatrixView["columns"][number]["cells"], extra: Partial<MatrixView["columns"][number]> = {}): MatrixView["columns"][number] => ({
  openedBidId: "ob1", listingNo: 1, of: 1, bidder: "Bidder One", alternativeOf: null, receiptDigest: null, columnRevision: 3, asReadCorrections: 0, cells,
  tally: { present: 0, absent: 0, notApplicable: 0, unanswered: cells.length, total: cells.length }, tallyText: `${cells.length} not answered`,
  decision: null, pass: allowed, reject: allowed, confirmation: { status: "ANSWERING", confirmed: [], awaiting: ["Officer A"], stale: [], mine: allowed }, answer: allowed, ...extra,
});
const view = (cols: MatrixView["columns"], extra: Partial<MatrixView> = {}): MatrixView => ({
  online: true, phase: "CHECKING", rows: [{ key: "form", label: "Form of tender", opened: true }, { key: "addendum:1", label: "Addendum 1", opened: false }, { key: "boq", label: "Bill of quantities", opened: false }],
  columns: cols, viewerIsNamedOfficer: true, namesHeld: false, filingBlocked: null, ...extra,
});
const render = (v: MatrixView) => renderToStaticMarkup(h(OpeningMatrix, { exerciseId: "ex1", openingId: "op1", view: v, viewer: { personId: "p1", name: "Officer A" }, verdicts: { ob1: { options: [{ value: "PASS", label: "Carried" }, { value: "REJECT", label: "Not carried" }], grounds: [], reported: [] } } }));

describe("the SR-14 matrix on screen", () => {
  const cells = [cell("form", "CHECK_FILES", { fileIds: ["f1"] }), cell("addendum:1", "ADDENDUM", { acknowledgedOn: "2026-11-13" }), cell("boq", "NOT_RECEIVED")];

  it("before finalising a named officer gets the sealed download, the dated addendum line and Present refused where no file came", () => {
    const html = render(view([column(cells)]));
    expect(html).toContain("Download Offer 1, Form of tender");
    expect(html).toContain("Acknowledged on the portal on");
    expect(html).toContain(CELL_WORDS.NOT_RECEIVED);
    expect(html).not.toContain("/api/opening/filed-file");
    expect(html).toContain("Confirm this column");
    expect(html).toContain('data-options="REJECT"');
    // Present is disabled for the part with no file, and only for it.
    expect(html.match(/disabled=""[^>]*title="[^"]*"[^>]*>Present/g)?.length).toBe(1);
  });

  it("a reader whose names are held reads that the day is held, never 'not acknowledged', and gets no file control", () => {
    const html = render(view([column([cell("form", "CHECK_FILES"), cell("addendum:1", "ADDENDUM"), cell("boq", "NOT_RECEIVED")], { bidder: "Held", answer: { allowed: false, reason: "Only the named opening officers answer." }, confirmation: { status: "ANSWERING", confirmed: [], awaiting: [], stale: [], mine: null } })], { viewerIsNamedOfficer: false, namesHeld: true }));
    expect(html).toContain(ADDENDUM_DAY_HELD_TEXT);
    expect(html).not.toContain("Not acknowledged on the portal");
    expect(html).toContain(CELL_WORDS.CHECK_FILES);
    expect(html).not.toContain("Download Offer");
    expect(html).toContain("Only the named opening officers answer.");
    expect(html).not.toContain("Confirm this column");
  });

  it("after finalising a check file is a button that asks the filed-file route in the page (never a form post to it), and shows the plain hash", () => {
    const html = render(view([column([cell("form", "CHECK_FILES", { fileIds: ["f1"], filed: [{ fileId: "f1", versionId: "v1", plainSha256: "ab".repeat(32) }] }), cell("addendum:1", "ADDENDUM"), cell("boq", "RECEIVED_NOT_CHECKED", { fileIds: ["f2"], filed: [{ fileId: "f2", versionId: "v2", plainSha256: null }] })])], { phase: "FINALISED" }));
    // 20cl: a form post would land the officer on the route's raw refusal, with its code. The control is a button, and a refusal is shown beside it in words.
    expect(html).not.toContain('action="/api/opening/filed-file"');
    expect(html).not.toContain("<form");
    expect(html).toContain("Download Offer 1, Form of tender");
    expect(html).toContain("ab".repeat(32));
    expect(html).toContain('href="/api/documents/versions/v2"');
  });

  it("after finalising, a check file that cannot be filed (the class is not set) shows the words in place of a control that would only be refused", () => {
    const words = "The class that filed bid files take is not set, so this file cannot be filed yet.";
    const html = render(view([column([cell("form", "CHECK_FILES", { fileIds: ["f1"], filed: [{ fileId: "f1", versionId: null, plainSha256: null }] })])], { phase: "FINALISED", filingBlocked: words, rows: [{ key: "form", label: "Form of tender", opened: true }] }));
    expect(html).toContain(words);
    expect(html).toMatch(/disabled=""[^>]*>Download/);
    // Filed already: the control stands whatever the class says now.
    const filed = render(view([column([cell("form", "CHECK_FILES", { fileIds: ["f1"], filed: [{ fileId: "f1", versionId: "v1", plainSha256: null }] })])], { phase: "FINALISED", filingBlocked: words, rows: [{ key: "form", label: "Form of tender", opened: true }] }));
    expect(filed).not.toContain(words);
  });

  it("a held reader's column head says the receipt digest is held, and the decision row says when a decision stands", () => {
    const held = render(view([column(cells, { bidder: "Held" })], { namesHeld: true }));
    expect(held).toContain("Held until the opening is finalised");
    expect(held).not.toContain("No receipt digest on the roll");
    expect(held).toContain("Stands when every named officer has confirmed this column");
  });

  it("a received part not yet filed says so instead of a dead control", () => {
    const html = render(view([column([cell("boq", "RECEIVED_NOT_CHECKED", { fileIds: ["f2"], filed: [{ fileId: "f2", versionId: null, plainSha256: null }] })])], { phase: "FINALISED", rows: [{ key: "boq", label: "Bill of quantities", opened: false }] }));
    expect(html).toContain("has not been filed as a document yet");
  });

  it("a disabled Pass carries its reason, and a column with no item reads the empty tally words", () => {
    const html = render(view([column([], { pass: { allowed: false, reason: "Completeness is not judged." }, tally: { present: 0, absent: 0, notApplicable: 0, unanswered: 0, total: 0 } })], { rows: [] }));
    expect(html).toContain("Completeness is not judged.");
    expect(html).toContain("Checklist result");
  });

  it("a refusal every column gives in the same words is said once, and each button points at it (3c-7 rendered check)", () => {
    const no = { allowed: false as const, reason: "Only the named officers decide." };
    const html = render(view([column([], { openedBidId: "a", pass: no, reject: no }), column([], { openedBidId: "b", listingNo: 2, pass: no, reject: no })], { rows: [] }));
    expect(html.split(">Only the named officers decide.<").length - 1).toBe(1);
    expect(html.split("aria-describedby=\"matrix-refusal-op1-0\"").length - 1).toBe(4);
  });
});
