import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { portalStatusWords } from "@/lib/work/labels";
import type { PortalGroupView, PortalRow, PortalWork } from "@/lib/work/portal-read";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { WorkItemDrawer, type ItemView } from "./work-drawers";
import { WorkPanel } from "./work-panel";

const ORG = "Jabatan Contoh";
const row = (o: Partial<PortalRow> = {}): PortalRow => ({ ref: "RFI-1", type: "RFI", title: "Drain levels", status: "TO_DO", dueOn: "2026-11-20", late: { state: "DUE" }, group: "WAITING_FOR_YOU", action: "REPLY", heldBy: "You", raisedByYou: false, ...o });
const group = (g: PortalGroupView["group"], rows: PortalRow[]): PortalGroupView => ({ group: g, total: rows.length, rows, more: false });
const work = (w: PortalRow[] = [], o: PortalRow[] = [], c: PortalRow[] = []): PortalWork => ({ orgName: ORG, today: "2026-11-01", canAct: true, groups: [group("WAITING_FOR_YOU", w), group("WITH_ORG", o), group("CLOSED", c)] });
const panel = (pw: PortalWork, o: Partial<Parameters<typeof WorkPanel>[0]> = {}) => renderToStaticMarkup(h(WorkPanel, { contractId: "c1", work: pw, closed: false, wanted: null, item: null, token: "tok", ...o }));

describe("the contractor's Work tab", () => {
  it("draws the groups' rows with a reference, title, due day, where it stands and one button", () => {
    const html = panel(
      work(
        [row(), row({ ref: "RFI-2", title: "Gate detail", action: "SEND_FOR_CHECKING", late: { state: "LATE", days: 2 }, dueOn: "2026-10-30" }), row({ ref: "RFI-4", title: "Slab", action: "ACCEPT_ANSWER", raisedByYou: true, status: "IN_REVIEW" })],
        [row({ ref: "RFI-3", title: "Pile cap", group: "WITH_ORG", status: "IN_REVIEW", heldBy: ORG })],
        [row({ ref: "RFI-9", group: "CLOSED", status: "DONE", action: "OPEN" })],
      ),
    );
    expect(html).toContain("Waiting for you");
    expect(html).toContain(`With ${ORG}`);
    expect(html).toContain("RFI-1");
    expect(html).toContain("Drain levels");
    expect(html).toContain("20 Nov 2026");
    expect(html).toContain("2 days late");
    for (const button of ["Reply", "Send for checking", "Accept answer"]) expect(html).toContain(`>${button}<`);
    expect(html).toContain('href="/supplier/projects/c1?tab=work&amp;item=RFI-2"');
    expect(html).toContain(`Sent to ${ORG} for checking`);
    expect(html).toContain("Sent back to you: see the reply");
    // Closed is a link with its count; its rows are not drawn until it is followed.
    expect(html).toContain("Closed (1)");
    expect(html).not.toContain("RFI-9");
    // No status name and no code.
    expect(html).not.toMatch(/IN_REVIEW|TO_DO|IN_PROGRESS|WAITING_FOR_YOU|WITH_ORG|SEND_FOR_CHECKING|ACCEPT_ANSWER|\bIn review\b|\bTo do\b/);
  });

  it("an Inspection the contractor holds shows Reply, never Send for checking (WB-5)", () => {
    const html = panel(work([row({ ref: "Insp-3", type: "INSPECTION", title: "Rebar check", action: "REPLY" })]));
    expect(html).toContain(">Reply<");
    expect(html).not.toContain("Send for checking");
  });

  it("says what is empty, and draws no Closed link when nothing is closed", () => {
    const html = panel(work());
    expect(html).toContain("Nothing waiting for you.");
    expect(html).toContain(`Nothing with ${ORG}.`);
    expect(html).not.toContain("Closed");
  });

  it("draws the closed list when asked for, and says when an item is not there", () => {
    const html = panel(work([], [], [row({ ref: "RFI-9", group: "CLOSED", status: "DONE", action: "OPEN" })]), { closed: true, wanted: "RFI-77" });
    expect(html).toContain("RFI-9");
    expect(html).toContain("Hide closed");
    expect(html).toContain("That item is not available.");
  });

  it("says when a group is cut short", () => {
    const g = { ...group("WAITING_FOR_YOU", [row()]), total: 80, more: true };
    expect(panel({ ...work(), groups: [g, group("WITH_ORG", []), group("CLOSED", [])] })).toContain("Showing the first 1 of 80.");
  });

  it("words where an item stands without a status name", () => {
    expect(portalStatusWords(row({ group: "CLOSED", status: "DONE" }), ORG)).toBe("Closed");
    expect(portalStatusWords(row({ group: "WITH_ORG", status: "IN_PROGRESS", heldBy: "Siti" }), ORG)).toBe("With Siti");
    expect(portalStatusWords(row({ group: "WITH_ORG", status: "IN_REVIEW" }), ORG)).toBe(`Sent to ${ORG} for checking`);
  });
});

const view = (o: Partial<ItemView> = {}): ItemView => ({
  ref: "RFI-1",
  title: "Drain levels",
  typeLabel: "RFI",
  status: "TO_DO",
  standing: "Waiting for you",
  dueText: "Due 20 Nov 2026",
  lateText: null,
  description: "Which level?",
  location: "",
  severityLabel: null,
  happenedText: null,
  answer: "",
  mayAnswer: false,
  action: "REPLY",
  actionLabel: "Reply",
  moves: [],
  files: [{ id: "a1", filename: "plan.pdf", href: "/supplier/projects/work/file/a1", byYou: false, onText: "1 Nov 2026" }],
  comments: [{ id: "0", by: ORG, byYou: false, body: "See attached", atText: "2 Nov 2026" }],
  ...o,
});
const drawer = (v: ItemView, o: { canAct?: boolean } = {}) => renderToStaticMarkup(h(WorkItemDrawer, { contractId: "c1", token: "tok", orgName: ORG, canAct: o.canAct ?? true, cannotWhy: "Not now. Ask the procurement office.", item: v }));

describe("the contractor's item drawer", () => {
  it("holds the facts, the files and the replies, with a composer and the one button at the top", () => {
    const html = drawer(view());
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Which level?");
    expect(html).toContain("plan.pdf");
    expect(html).toContain("See attached");
    expect(html).toContain("Your reply");
    expect(html).toContain(">Send<");
    expect(html.indexOf(">Reply<")).toBeLessThan(html.indexOf("Which level?"));
    expect(html).not.toContain("Internal note");
  });

  it("an RFI assigned to the contractor has an editable Answer (WB-6); otherwise it is read only", () => {
    const own = drawer(view({ mayAnswer: true, action: "SEND_FOR_CHECKING", actionLabel: "Send for checking" }));
    expect(own).toMatch(/<textarea[^>]*id="[^"]*-answer"/);
    expect(own).toContain("Save answer");
    const ro = drawer(view({ answer: "Level 2.1" }));
    expect(ro).toContain("Level 2.1");
    expect(ro).not.toContain("Save answer");
    expect(drawer(view())).not.toContain(">Answer<");
  });

  it("offers Ask again beside Accept answer", () => {
    const html = drawer(view({ status: "IN_REVIEW", action: "ACCEPT_ANSWER", actionLabel: "Accept answer", moves: ["MARK_DONE", "SEND_BACK"] }));
    expect(html).toContain("Ask again");
    expect(html).toContain("Accept answer");
  });

  it("offers no act, and says why, where the contract shuts them", () => {
    const html = drawer(view({ answer: "x", mayAnswer: true }), { canAct: false });
    expect(html).toContain("Ask the procurement office.");
    expect(html).not.toContain("Your reply");
    expect(html).not.toContain(">Reply<");
    expect(html).not.toContain("Save answer");
  });

  it("a closed item shows its conversation and offers no button", () => {
    expect(drawer(view({ action: "OPEN", actionLabel: "Open" }))).not.toContain(">Open<");
  });
});
