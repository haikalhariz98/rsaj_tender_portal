import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { takenUpLink } from "@/lib/project-docs/labels";
import type { DocumentPage, Gate } from "@/lib/project-docs/page-store";
import type { RegisterRow } from "@/lib/project-docs/register";
import type { StaffEarlier } from "@/lib/project-docs/earlier-read";
import type { DocumentsWaitingRow } from "@/lib/project-docs/waiting-read";

vi.mock("@/app/projects/[id]/document-actions", () => ({}));
vi.mock("./document-editors", () => ({
  NewDocumentDrawer: () => h("button", null, "New document"),
  UploadVersionDrawer: () => h("button", null, "Upload a new version"),
  AskDrawer: () => h("button", null, "Ask for it"),
  AddApproverDrawer: () => h("button", null, "Add approver"),
  RemoveApproverDrawer: () => h("button", null, "Remove"),
  ApproveDrawer: () => h("button", null, "Approve"),
  RejectDrawer: () => h("button", null, "Reject"),
  MarkDrawer: ({ label, outcome, tone }: { label: string; outcome: string; tone?: string }) => h("button", { "data-outcome": outcome, "data-tone": tone }, label),
}));
vi.mock("@/app/documents/review-editors", () => ({ AnswerDrawer: ({ label }: { label: string }) => h("button", { "data-answer": label }, "Answer") }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/app/projects/case-view-select", () => ({
  CaseViewSelect: ({ groups, current }: { groups: { options: { value: string; label: string; href: string }[] }[]; current: string }) =>
    h("select", { "data-current": current }, groups.flatMap((g) => g.options).map((o) => h("option", { key: o.value, value: o.href }, o.label))),
}));

import { DocumentsWaitingList } from "@/app/projects/documents-waiting-view";
import { EarlierRecordCard } from "@/components/earlier-record-card";

import { DocumentPageView } from "./documents/[documentId]/document-view";
import { ProjectDocumentsCard } from "./project-documents-card";
import { EarlierRecord } from "./submissions-tab";

const ORG = "Jabatan Contoh";
const open: Gate = { allowed: true, reasons: [] };
const shut = (...reasons: string[]): Gate => ({ allowed: false, reasons });
const NO_WAY = shut("A document of one of the six kinds is taken up or returned, not approved.");
const ACTIONS = { upload: NO_WAY, request: NO_WAY, addApprover: NO_WAY, approve: NO_WAY, reject: NO_WAY, decideVersionId: "v2", markTakenUp: open, markReturned: open };

const page = (o: Partial<DocumentPage> = {}): DocumentPage => ({
  id: "d1",
  contractId: "c1",
  title: "Delay at the culvert",
  note: "",
  side: "CONTRACTOR",
  sideLabel: "The contractor",
  kind: "DELAY_NOTICE",
  kindLabel: "Delay notice",
  state: "RECEIVED",
  stateLabel: "Received",
  waitsOn: "ORGANISATION",
  waitsOnLabel: `Waiting on ${ORG}`,
  final: false,
  createdOn: "2026-10-20",
  versions: [
    { id: "v1", number: 1, label: "Version 1", note: "", uploadedOn: "2026-10-20", uploadedAtText: "20 Oct 2026 · 09:15", uploadedByName: "Binaan Maju", answersRequest: false, signed: false, files: [], decisions: [] },
    { id: "v2", number: 2, label: "Version 2", note: "", uploadedOn: "2026-10-22", uploadedAtText: "22 Oct 2026 · 14:02", uploadedByName: "Binaan Maju", answersRequest: false, signed: false, files: [], decisions: [] },
  ],
  requests: [],
  openRequest: null,
  approvers: [],
  ownVersionApproverNames: [],
  picker: [],
  readerMayAct: true,
  workspaceShut: null,
  actions: ACTIONS,
  classSet: true,
  markWords: { takenUp: "Mark taken up", returned: "Return" },
  takenUpLink: null,
  ...o,
});
const view = (p: DocumentPage) => renderToStaticMarkup(h(DocumentPageView, { page: p, contractNumber: "JKR/2026/01" }));

describe("a document of one of the six kinds, on the staff's page (plan step 6; PW-24)", () => {
  it("offers the two marks, taken up as the one primary, and no approve, reject or approver anywhere (no dead buttons)", () => {
    const html = view(page());
    expect(html).toContain(">Mark taken up<");
    expect(html).toContain(">Return<");
    expect(html).toContain('data-outcome="TAKEN_UP" data-tone="primary"');
    expect(html).toContain('data-outcome="RETURNED"');
    expect(html).not.toMatch(/Approve|Reject|Add approver|Approvers|No approvers/);
    // Nothing is blocked, so nothing is explained under the header.
    expect(html).not.toContain("document-actions-note");
  });

  it("shows the server's own moment for each version", () => {
    const html = view(page());
    expect(html).toContain("20 Oct 2026 · 09:15");
    expect(html).toContain("22 Oct 2026 · 14:02");
  });

  it("says where it is recorded only once it is taken up, only with the loader's link, and never in words without one", () => {
    // The words are the real ones (`takenUpLink`): they say where it IS recorded, so they are not drawn before it is taken up.
    const link = takenUpLink("INTERIM_CLAIM")!;
    const given = { words: link.words, href: "/projects/c1?stage=project&tab=payments&section=valuations" };
    const received = view(page({ kind: "INTERIM_CLAIM", kindLabel: "Interim claim", takenUpLink: given }));
    expect(received).not.toContain(link.words);
    const taken = view(page({ kind: "INTERIM_CLAIM", kindLabel: "Interim claim", state: "TAKEN_UP", stateLabel: "Taken up", takenUpLink: given }));
    expect(taken).toContain(link.words);
    expect(taken).toContain('href="/projects/c1?stage=project&amp;tab=payments&amp;section=valuations"');
    // No link from the loader (a delay notice, defects rectified): no words and no button, at any state.
    const none = view(page({ state: "TAKEN_UP", stateLabel: "Taken up" }));
    expect(none).not.toMatch(/[Rr]ecorded (in|under)|tab=payments/);
  });

  it("on defects rectified the mark and the state read Noted, never Taken up", () => {
    const html = view(page({ kind: "DEFECTS_RECTIFIED", kindLabel: "Defects rectified", markWords: { takenUp: "Mark noted", returned: "Return" }, state: "TAKEN_UP", stateLabel: "Noted" }));
    expect(html).toContain(">Mark noted<");
    expect(html).toContain(">Noted<");
    expect(html).not.toMatch(/Taken up|taken up/);
  });

  it("a mark the reader may not give is blocked with the reason, said once; final and over, no disabled mark is left", () => {
    const why = "Only an approver may mark it.";
    const blocked = view(page({ actions: { ...ACTIONS, markTakenUp: shut(why), markReturned: shut(why) } }));
    expect(blocked).toContain(why);
    expect(blocked).toContain("disabled");
    const over = view(page({ final: true, state: "TAKEN_UP", stateLabel: "Taken up", actions: { ...ACTIONS, markTakenUp: shut("Already marked."), markReturned: shut("Already marked.") } }));
    expect(over).not.toMatch(/Mark taken up|>Return</);
  });

  it("an ordinary document keeps its acts and its approvers, and shows no mark", () => {
    const html = view(
      page({ side: "ORGANISATION", sideLabel: ORG, kind: null, kindLabel: null, state: "WAITING_FOR_APPROVAL", stateLabel: "Waiting for approval", markWords: null, actions: { upload: open, request: open, addApprover: open, approve: open, reject: open, decideVersionId: "v2", markTakenUp: NO_WAY, markReturned: NO_WAY } }),
    );
    expect(html).toContain("Approve");
    expect(html).toContain("Approvers");
    expect(html).not.toMatch(/Mark taken up|Mark noted|>Return</);
  });
});

const record = (o: Partial<StaffEarlier> = {}): StaffEarlier => ({
  id: "e1",
  kindLabel: "Delay notice",
  title: "Delay at the culvert",
  body: "Rain stopped the pour.",
  amount: null,
  aboutDay: "14 Oct 2026",
  sentOn: "15 Oct 2026",
  signed: false,
  routedTo: "Superintending Officer",
  dueText: "Due 19 Oct 2026",
  answerLabel: null,
  answerNote: "",
  answeredOn: null,
  lines: [],
  contractor: "Binaan Maju Sdn Bhd",
  answeredBy: null,
  answerable: true,
  answerShut: null,
  ...o,
});

describe("an earlier record, read only on the Documents tab (PW-11)", () => {
  const tab = (r: StaffEarlier, status: Parameters<typeof EarlierRecord>[0]["status"] = "ACTIVE") => renderToStaticMarkup(h(EarlierRecord, { record: r, status, backHref: "/projects/c1?stage=project&tab=submissions" }));

  it("shows what was sent, marked an earlier record, and offers the answer while it is unanswered", () => {
    const html = tab(record());
    for (const w of ["Delay at the culvert", "Earlier record", "Delay notice", "Rain stopped the pour.", "15 Oct 2026", "Due 19 Oct 2026", "Superintending Officer", "Not answered yet", "Back to the list"]) expect(html).toContain(w);
    expect(html).toContain('data-answer="Delay notice: Delay at the culvert"');
  });

  it("answered, it is read only: the stored answer, who gave it and when, and no answer drawer", () => {
    const html = tab(record({ answerable: false, answerLabel: "Returned", answerNote: "Resend with the diary.", answeredOn: "17 Oct 2026", answeredBy: "Hassan Bin Ali" }));
    for (const w of ["Returned", "Resend with the diary.", "17 Oct 2026", "Hassan Bin Ali"]) expect(html).toContain(w);
    expect(html).not.toContain("data-answer");
    expect(html).not.toContain("Not answered yet");
  });

  it("where the contract's state shuts the answer it is blocked, with the reason, never hidden", () => {
    const html = tab(record({ answerShut: "The contract is closed." }));
    expect(html).toContain("The contract is closed.");
    expect(html).not.toContain("data-answer");
    expect(html).toContain("disabled");
  });

  it("the contractor's view of the same card names no officer and offers no answer", () => {
    const { contractor, answeredBy, answerable, answerShut, ...fields } = record({ answerLabel: "Taken up", answeredOn: "17 Oct 2026" });
    void [contractor, answeredBy, answerable, answerShut];
    const html = renderToStaticMarkup(h(EarlierRecordCard, { record: fields, label: "Earlier record", backHref: "/supplier/projects/c1?tab=submissions" }));
    expect(html).toContain("Taken up");
    expect(html).not.toMatch(/Hassan|Answer</);
  });

  it("an earlier row in the list carries its mark beside its kind and links to the tab naming it", () => {
    const rows: RegisterRow[] = [{ id: "e1", title: "Delay at the culvert", kindLabel: "Delay notice", latestOn: "2026-10-15", stateLabel: "Received", state: "RECEIVED", waitsOnLabel: `Waiting on ${ORG}`, waitsOn: "ORGANISATION", href: "/projects/c1?stage=project&tab=submissions&earlier=e1", earlier: { label: "Earlier record", record: record() } }];
    const html = renderToStaticMarkup(
      h(ProjectDocumentsCard, { contractId: "c1", orgName: ORG, rows, filter: "ALL", next: null, after: null, start: { classSet: true, create: open, picker: [], noSoResolved: false } }),
    );
    expect(html).toContain("Earlier record");
    expect(html).toContain('href="/projects/c1?stage=project&amp;tab=submissions&amp;earlier=e1"');
  });
});

describe("Documents waiting, the Contracts list's view (PW-11)", () => {
  const wrow = (o: Partial<DocumentsWaitingRow> = {}): DocumentsWaitingRow => ({
    id: "d1",
    contractId: "c1",
    contractNumber: "Contract JKR/2026/01",
    contractor: "Binaan Maju Sdn Bhd",
    title: "Delay at the culvert",
    kindLabel: "Delay notice",
    latestOn: "2026-10-21",
    stateLabel: "Received",
    state: "RECEIVED",
    waitsOnLabel: `Waiting on ${ORG}`,
    href: "/projects/c1/documents/d1",
    ...o,
  });
  const list = (o: Partial<Parameters<typeof DocumentsWaitingList>[0]> = {}) => renderToStaticMarkup(h(DocumentsWaitingList, { rows: [wrow()], next: null, filter: "ALL", after: null, ...o }));

  it("lists what waits with its contract, contractor, kind, day and state; earlier records marked; no count", () => {
    const html = list({ rows: [wrow(), wrow({ id: "e1", title: "Old programme", kindLabel: "Work programme", href: "/projects/c1?stage=project&tab=submissions&earlier=e1", earlier: { label: "Earlier record", record: record() } })] });
    for (const w of ["Documents waiting", "Delay at the culvert", "Contract JKR/2026/01", "Binaan Maju Sdn Bhd", "Delay notice", "21 Oct 2026", "Received", "Old programme", "Earlier record"]) expect(html).toContain(w);
    expect(html).not.toMatch(/\b\d+ (waiting|documents?|of \d+)\b|Showing/);
  });

  it("offers both filters in the loader's words and marks the one in force", () => {
    const all = list();
    expect(all).toContain(">All waiting</option>");
    expect(all).toContain(">Waiting for me</option>");
    expect(all).toContain('data-current="ALL"');
    expect(list({ filter: "MINE" })).toContain('data-current="MINE"');
    // The filter's address keeps `view=submissions`, which the notices and the view button name.
    expect(all).toContain("view=submissions&amp;waiting=MINE");
  });

  it("says which list is empty, and pages by a cursor link without a count", () => {
    expect(list({ rows: [] })).toContain("Nothing is waiting");
    expect(list({ rows: [], filter: "MINE" })).toContain("Nothing is waiting for you");
    const paged = list({ next: "cur2", after: "cur1" });
    expect(paged).toContain("waitingAfter=cur2");
    expect(paged).toContain("Older documents");
    expect(paged).toContain(">Newest<");
  });
});
