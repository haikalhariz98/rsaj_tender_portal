import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { faultText } from "@/lib/project-docs/labels";
import type { DocumentPage, Gate, WorkspaceStart } from "@/lib/project-docs/page-store";
import type { RegisterRow } from "@/lib/project-docs/register";

vi.mock("@/app/projects/[id]/document-actions", () => ({}));
vi.mock("./document-editors", () => ({
  NewDocumentDrawer: ({ picker }: { picker: { name: string }[] }) => h("button", { "data-picker": picker.map((p) => p.name).join(",") }, "New document"),
  UploadVersionDrawer: ({ tone }: { tone?: string }) => h("button", { "data-tone": tone }, "Upload a new version"),
  AskDrawer: () => h("button", null, "Ask for it"),
  AddApproverDrawer: () => h("button", null, "Add approver"),
  RemoveApproverDrawer: ({ name }: { name: string }) => h("button", null, `Remove ${name}`),
  ApproveDrawer: ({ tone }: { tone?: string }) => h("button", { "data-tone": tone }, "Approve"),
  RejectDrawer: () => h("button", null, "Reject"),
}));
vi.mock("@/app/projects/case-view-select", () => ({
  CaseViewSelect: ({ groups, current }: { groups: { options: { value: string; label: string; href: string }[] }[]; current: string }) =>
    h("select", { "data-current": current }, groups.flatMap((g) => g.options).map((o) => h("option", { key: o.value, value: o.href }, o.label))),
}));

import { ProjectDocumentsCard } from "./project-documents-card";
import { DocumentPageView } from "./documents/[documentId]/document-view";

const ORG = "Jabatan Contoh";
const open: Gate = { allowed: true, reasons: [] };
/// Plan step 6 (server): the marks of a kind, blocked on an ordinary document, as the loader blocks them.
const NO_KIND = { allowed: false, reasons: ["Only a document of one of the six kinds is taken up or returned."] };
const shut = (...reasons: string[]): Gate => ({ allowed: false, reasons });
const NO_AUTHORITY = faultText({ code: "NO_AUTHORITY", level: "block" }, ORG);
const CLASS_UNSET = faultText({ code: "CLASS_NOT_SET", level: "block" }, ORG);

const start = (o: Partial<WorkspaceStart> = {}): WorkspaceStart => ({ classSet: true, create: open, picker: [{ personId: "p1", name: "Aminah Binti Razak", officeLabel: "Superintending Officer" }], noSoResolved: false, ...o });
const row = (o: Partial<RegisterRow> = {}): RegisterRow => ({ id: "d1", title: "Drainage layout", kindLabel: null, latestOn: "2026-10-21", stateLabel: "Waiting for approval", state: "WAITING_FOR_APPROVAL", waitsOnLabel: `Waiting on ${ORG}`, waitsOn: "ORGANISATION", href: "/projects/c1/documents/d1", ...o });
const card = (o: Partial<Parameters<typeof ProjectDocumentsCard>[0]> = {}) => renderToStaticMarkup(h(ProjectDocumentsCard, { contractId: "c1", orgName: ORG, rows: [row()], filter: "ALL", next: null, after: null, start: start(), ...o }));

describe("the Documents list on the Project stage", () => {
  it("lists a document with its title as a link, the day of its latest version, its state and who it waits on, and offers a new one", () => {
    const html = card({ rows: [row(), row({ id: "d2", title: "Method statement", kindLabel: "Work programme", latestOn: null, stateLabel: "Asked for", state: "REQUESTED", waitsOnLabel: "Waiting on the contractor", waitsOn: "CONTRACTOR", href: "/projects/c1/documents/d2" })] });
    expect(html).toContain('href="/projects/c1/documents/d1"');
    expect(html).toContain("Drainage layout");
    expect(html).toContain("21 Oct 2026");
    expect(html).toContain("Waiting for approval");
    expect(html).toContain(`Waiting on ${ORG}`);
    expect(html).toContain("Work programme");
    // Asked for, with no version yet: no day is invented.
    expect(html).toContain("Not yet");
    expect(html).toContain("Waiting on the contractor");
    expect(html).toContain("New document");
    expect(html).toContain('data-picker="Aminah Binti Razak"');
    // No count, no figure (PW-4).
    expect(html).not.toMatch(/\b\d+ (documents?|of \d+)\b/);
  });

  it("offers the four filters in words, the organisation by its configured name, and marks the one in force", () => {
    const html = card({ filter: "CONTRACTOR" });
    for (const w of ["All", "Waiting on the contractor", `Waiting on ${ORG}`, "Approved"]) expect(html).toContain(`>${w}</option>`);
    expect(html).toContain('data-current="CONTRACTOR"');
    // The filters are links the server answers (a filtered list never misses an older document).
    expect(html).toContain("stage=project&amp;tab=submissions&amp;docs=ORGANISATION");
  });

  it("shows every row it is given, with no pager that counts them (PW-4)", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: `d${i}`, title: `Document number ${i}`, href: `/projects/c1/documents/d${i}` }));
    const html = card({ rows });
    for (const r of rows) expect(html).toContain(r.title);
    expect(html).not.toMatch(/Showing|\b\d+ of \d+\b|Rows per page/i);
  });

  it("PW-48: with no S.O. resolved, a warning in the supervision words, beside the class one; never with an S.O.", () => {
    const words = "No S.O. is resolved for this contract yet. Resolve it on the Team tab first.";
    expect(card({ start: start({ noSoResolved: true }) })).toContain(words);
    const both = card({ start: start({ noSoResolved: true, classSet: false, create: shut(NO_AUTHORITY, CLASS_UNSET) }) });
    expect(both).toContain(words);
    expect(both).toContain("Where it is set");
    expect(card()).not.toContain(words);
  });

  it("an empty list says so, and a filtered empty list says which list is empty", () => {
    expect(card({ rows: [] })).toContain("No documents yet");
    expect(card({ rows: [], filter: "APPROVED" })).toContain("No documents in this list");
  });

  it("older documents are a link, never quietly dropped; a later page links back to the newest", () => {
    const first = card({ next: "2026-10-01T00:00:00.000Z|d0" });
    expect(first).toContain("Older documents");
    expect(first).toContain("docsAfter=2026-10-01T00%3A00%3A00.000Z%7Cd0");
    expect(first).not.toContain(">Newest<");
    const later = card({ after: "x|y" });
    expect(later).toContain(">Newest<");
    expect(later).not.toContain("Older documents");
    expect(card()).not.toContain("Older documents");
  });

  it("a reader who may not start one sees the button blocked with the reason, not hidden", () => {
    const html = card({ start: start({ create: shut(NO_AUTHORITY) }) });
    expect(html).toContain('disabled=""');
    expect(html).toContain(`>${NO_AUTHORITY}<`);
    expect(html).not.toContain("data-picker");
  });

  it("with the project class unset nothing can be added, and the setting is named", () => {
    const html = card({ start: start({ classSet: false, create: shut(CLASS_UNSET) }), rows: [] });
    expect(html).toContain("Project files have no document class yet.");
    expect(html).toContain("Configuration › Documents");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("data-picker");
    // It is said once as the callout and once for assistive technology: the reason is not also printed as a second line.
    expect(html.split("Configuration › Documents.<").length - 1).toBe(1);
  });

  it("names no code", () => {
    expect(card({ rows: [row({ stateLabel: "Approved", state: "APPROVED", waitsOnLabel: null, waitsOn: null })] })).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
  });
});

const page = (o: Partial<DocumentPage> = {}): DocumentPage => ({
  id: "d1",
  contractId: "c1",
  title: "Drainage layout",
  note: "",
  side: "ORGANISATION",
  sideLabel: ORG,
  kind: null,
  kindLabel: null,
  state: "WAITING_FOR_APPROVAL",
  stateLabel: "Waiting for approval",
  waitsOn: "ORGANISATION",
  waitsOnLabel: `Waiting on ${ORG}`,
  final: false,
  createdOn: "2026-10-20",
  versions: [
    {
      id: "v1",
      number: 1,
      label: "Version 1",
      note: "First issue.",
      uploadedOn: "2026-10-20",
      uploadedAtText: "20 Oct 2026 · 09:15",
      uploadedByName: "Aminah Binti Razak",
      answersRequest: false,
      signed: false,
      files: [{ versionId: "f1", name: "layout-v1.pdf", bytes: 2048, mediaType: "application/pdf", scanLabel: "Not scanned for malware — scanning not built" }],
      decisions: [{ approverName: "Hassan Bin Ali", outcome: "REJECTED", outcomeLabel: "Rejected", remarks: "The levels are wrong.", decidedOn: "2026-10-21", decidedByName: "Hassan Bin Ali" }],
    },
    {
      id: "v2",
      number: 2,
      label: "Version 2",
      note: "",
      uploadedOn: "2026-10-22",
      uploadedAtText: "22 Oct 2026 · 14:02",
      uploadedByName: "Aminah Binti Razak",
      answersRequest: false,
      signed: false,
      files: [{ versionId: "f2", name: "layout-v2.pdf", bytes: 4096, mediaType: "application/pdf", scanLabel: "Not scanned for malware — scanning not built" }],
      decisions: [],
    },
  ],
  requests: [],
  openRequest: null,
  approvers: [{ id: "a1", personId: "p2", name: "Hassan Bin Ali", live: true, answer: "PENDING", answerLabel: "Waiting", ownVersion: false, addedOn: "2026-10-20", removedOn: null, removeReason: "", remove: open }],
  ownVersionApproverNames: [],
  picker: [{ personId: "p3", name: "Zainab Binti Omar", officeLabel: "Representative" }],
  readerMayAct: true,
  workspaceShut: null,
  actions: { upload: open, request: open, addApprover: open, approve: open, reject: open, decideVersionId: "v2", markTakenUp: NO_KIND, markReturned: NO_KIND },
  classSet: true,
  // Plan step 6 (server): an ordinary document has no marks and no "Taken up" link; the screen step renders them for a kind.
  markWords: null,
  takenUpLink: null,
  ...o,
});
const view = (p: DocumentPage) => renderToStaticMarkup(h(DocumentPageView, { page: p }));

describe("a Project document's page", () => {
  it("heads with the title, the state, and the side, the kind and who it waits on; versions run newest first, with their files, decisions and remarks", () => {
    const html = view(page({ kind: "WORK_PROGRAMME", kindLabel: "Work programme" }));
    expect(html).toContain("Drainage layout");
    expect(html).toContain("Waiting for approval");
    expect(html).toContain(`${ORG}&#x27;s document`);
    expect(html).toContain("Work programme");
    expect(html).toContain(`Waiting on ${ORG}`);
    expect(html.indexOf("Version 2")).toBeGreaterThan(-1);
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("layout-v1.pdf");
    expect(html).toContain(">2 KB<");
    expect(html).toContain(">Not scanned<");
    expect(html).toContain('href="/api/documents/versions/f2"');
    expect(html).toContain("The levels are wrong.");
    expect(html).toContain("22 Oct 2026");
  });

  it("PW-44: a declaration's version signed with the password says so, from the column, with no moment; an unsigned version says nothing", () => {
    const base = page();
    const signed = view(page({ versions: base.versions.map((v) => (v.number === 1 ? { ...v, signed: true } : v)) }));
    expect(signed.match(/Signed with a password/g)).toHaveLength(1);
    expect(view(base)).not.toContain("Signed with a password");
  });

  it("offers every act the loader allows, the answer as the one primary action", () => {
    const html = view(page());
    for (const w of ["Upload a new version", "Ask for it", "Approve", "Reject", "Add approver", "Remove Hassan Bin Ali"]) expect(html).toContain(`>${w}</button>`);
    expect(html).toContain('data-tone="primary">Approve');
    // Review B11: the answer is the one header button; the other acts sit in the "..." menu.
    expect(html.split('data-tone="primary"').length - 1).toBe(1);
    expect(html).not.toContain('disabled=""');
  });

  it("a reader with no authority reads everything, every act is blocked, and the reason is said once", () => {
    const g = shut(NO_AUTHORITY);
    const html = view(page({ readerMayAct: false, actions: { upload: g, request: g, addApprover: g, approve: g, reject: g, decideVersionId: "v2", markTakenUp: NO_KIND, markReturned: NO_KIND }, approvers: [{ ...page().approvers[0]!, remove: g }] }));
    // Review B11: the header draws only what the reader can use, so no header act is a disabled button; the approvers card still says why Add and Remove are shut.
    for (const w of ["Upload a new version", "Ask for it", "Approve", "Reject"]) expect(html).not.toContain(`>${w}</button>`);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add approver<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Remove Hassan Bin Ali as an approver"[^>]*>Remove<\/button>|<button[^>]*aria-label="Remove Hassan Bin Ali as an approver"[^>]*disabled[^>]*>Remove<\/button>/);
    // Said once, under the approvers, never beside each button.
    expect(html.split(`>${NO_AUTHORITY}<`).length - 1).toBe(1);
    expect(html).toContain("Version 1");
    expect(html).not.toContain("data-tone");
  });

  it("acts blocked for different reasons are named with theirs", () => {
    const html = view(page({ actions: { upload: shut(faultText({ code: "UNDER_REVIEW", level: "block", data: { state: "WAITING_FOR_APPROVAL" } }, ORG)), request: shut("Already asked."), addApprover: open, approve: open, reject: open, decideVersionId: "v2", markTakenUp: NO_KIND, markReturned: NO_KIND } }));
    // Review B11: a shut act is not drawn in the header, so its reason is not either.
    expect(html).not.toContain("Its latest version is waiting for approval.");
    expect(html).not.toContain(">Upload a new version</button>");
  });

  it("says who waits because they uploaded the version, never a silent wait", () => {
    const html = view(page({ ownVersionApproverNames: ["Hassan Bin Ali"], approvers: [{ ...page().approvers[0]!, ownVersion: true }] }));
    expect(html).toContain("Hassan Bin Ali uploaded the latest version, so another approver decides it.");
  });

  it("a removed approver stays on the page, dimmed, with the day and the reason; the picker being empty blocks Add with its reason", () => {
    const [a] = page().approvers;
    const html = view(page({ picker: [], approvers: [a!, { ...a!, id: "a2", personId: "p4", name: "Mohd Faiz", live: false, answer: null, answerLabel: null, removedOn: "2026-10-21", removeReason: "On leave.", remove: shut("not live") }] }));
    expect(html).toContain("Removed 21 Oct 2026: On leave.");
    expect(html).toContain("Nobody else holds authority to approve today.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add approver<\/button>/);
  });

  it("a document that is only asked for shows the request, not an empty list", () => {
    const html = view(page({ state: "REQUESTED", stateLabel: "Asked for", waitsOn: "CONTRACTOR", waitsOnLabel: "Waiting on the contractor", versions: [], approvers: [], openRequest: { id: "r1", toSide: "CONTRACTOR", toLabel: "The contractor", note: "The section drawings, please.", requestedOn: "2026-10-22", answeredByVersion: null }, actions: { upload: shut("x"), request: shut("y"), addApprover: open, approve: shut("z"), reject: shut("z"), decideVersionId: null, markTakenUp: NO_KIND, markReturned: NO_KIND } }));
    expect(html).toContain("Asked of the contractor");
    expect(html).toContain("The section drawings, please.");
    expect(html).toContain("22 Oct 2026");
    expect(html).not.toContain("No versions yet");
    expect(html).toContain("No approvers");
  });

  it("with the project class unset the upload is blocked and the setting is named", () => {
    const html = view(page({ classSet: false, actions: { upload: shut(CLASS_UNSET), request: open, addApprover: open, approve: open, reject: open, decideVersionId: "v2", markTakenUp: NO_KIND, markReturned: NO_KIND } }));
    expect(html).not.toContain(">Upload a new version</button>");
    expect(html).toContain("Configuration › Documents");
  });

  it("a contract that shuts the workspace says so once, whoever reads", () => {
    const words = "This contract is closed, so nothing more is added to it.";
    const g = shut(words);
    const html = view(page({ workspaceShut: words, actions: { upload: g, request: g, addApprover: g, approve: g, reject: g, decideVersionId: "v2", markTakenUp: NO_KIND, markReturned: NO_KIND }, approvers: [{ ...page().approvers[0]!, remove: g }] }));
    expect(html).toContain(words);
    expect(html).not.toContain("Upload a new version: ");
  });
});

describe("the Project stage's Documents tab", () => {
  // The tab loads from the database, so its order is read from the source, as the content guards of the other unauthenticated screens are (the text snapshot needs a signed-in session).
  const src = readFileSync(join(process.cwd(), "src/app/projects/[id]/submissions-tab.tsx"), "utf8");

  it("is one list: the earlier queue and its second listing are gone (plan step 6), the earlier record opens above the list and is read by its id, outside the supervision gate except for its answer (PW-22)", () => {
    expect(src).not.toMatch(/EarlierQueue|SubmissionsPanel|loadReviewQueue/);
    const tab = src.slice(0, src.indexOf("const ANSWER_NOTE"));
    expect(tab.indexOf("<EarlierRecord")).toBeGreaterThan(-1);
    expect(tab.indexOf("<EarlierRecord")).toBeLessThan(tab.indexOf("<ProjectDocumentsCard"));
    expect(src).toContain("loadStaffEarlier(db, { organisationId, contractId, id: earlier })");
    // The tab itself holds no gate: the supervision family's gate wraps the earlier record's answer alone (the workspace is open to Terminated).
    expect(tab).not.toContain("<ActGate");
    expect(src.slice(src.indexOf("export function EarlierRecord("))).toMatch(/actStatusBlocker\("SUPERVISION", status\)[\s\S]*<AnswerDrawer[\s\S]*<ActGate blocker=\{shut\}>[\s\S]*<EarlierRecordCard/);
  });

  it("reads the list through the register's filter and cursor, never the whole contract at once", () => {
    expect(src).toContain("isRegisterFilter(docs)");
    expect(src).toContain("loadRegister(");
    expect(src).toContain("after");
  });
});
