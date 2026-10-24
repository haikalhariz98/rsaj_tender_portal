import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PortalDocumentPage, PortalRow, PortalStart, WaitingRow } from "@/lib/project-docs/portal-read";

vi.mock("./document-drawers", () => ({
  NewDocumentDrawer: ({ organisationName }: { organisationName: string }) => h("button", { "data-org": organisationName }, "New document"),
  UploadVersionDrawer: ({ tone }: { tone?: string }) => h("button", { "data-tone": tone }, "Upload a new version"),
  AskDrawer: ({ organisationName }: { organisationName: string }) => h("button", { "data-org": organisationName }, "Ask for it"),
}));

import { PortalDocumentView } from "./documents/[documentId]/document-view";
import { portalTone } from "./document-words";
import { PortalDocumentsCard } from "./portal-documents-card";
import { WaitingList } from "./waiting-for-you";

const ORG = "Jabatan Contoh";
const OFFICER = "Hassan Bin Ali";
const open = { allowed: true, reasons: [] as string[] };
const shut = (...reasons: string[]) => ({ allowed: false, reasons });
const start = (o: Partial<PortalStart> = {}): PortalStart => ({ create: open, kinds: [], organisationName: ORG, ...o });
const row = (o: Partial<PortalRow> = {}): PortalRow => ({ id: "d1", title: "Method statement", kindLabel: null, latestOn: "2026-10-21", stateLabel: "Waiting for approval", shown: "VERSIONS", waitsOnLabel: `Waiting on ${ORG}`, waitsOnYou: false, href: "/supplier/projects/c1/documents/d1", ...o });
const card = (o: Partial<Parameters<typeof PortalDocumentsCard>[0]> = {}) => renderToStaticMarkup(h(PortalDocumentsCard, { contractId: "c1", rows: [row()], next: null, after: null, start: start(), token: "tok", ...o }));

describe("the contractor's Documents list on a project", () => {
  it("lists a document with its title as a link, the day of its latest version, its state and who it waits on, and offers a new one", () => {
    const html = card({ rows: [row(), row({ id: "d2", title: "Drainage layout", kindLabel: "Work programme", latestOn: null, stateLabel: "Asked for", waitsOnLabel: "Waiting for you", waitsOnYou: true, href: "/supplier/projects/c1/documents/d2" })] });
    expect(html).toContain('href="/supplier/projects/c1/documents/d1"');
    expect(html).toContain("Method statement");
    expect(html).toContain("21 Oct 2026");
    expect(html).toContain("Waiting for approval");
    expect(html).toContain(`Waiting on ${ORG}`);
    expect(html).toContain("Work programme");
    // Asked for, with no version yet: no day is invented.
    expect(html).toContain("Not yet");
    expect(html).toContain("Waiting for you");
    expect(html).toContain("New document");
    expect(html).toContain(`data-org="${ORG}"`);
    // No count, no figure (PW-4), and no pager that counts.
    expect(html).not.toMatch(/\b\d+ (documents?|of \d+)\b|Showing|Rows per page/i);
  });

  it("a document the organisation is still preparing reads as being prepared, with no day and nobody to wait on", () => {
    const html = card({ rows: [row({ id: "d3", title: "Insurance policy", latestOn: null, stateLabel: `Being prepared by ${ORG}`, shown: "BEING_PREPARED", waitsOnLabel: null })] });
    expect(html).toContain(`Being prepared by ${ORG}`);
    expect(html).toContain("Insurance policy");
    expect(html).toContain("Not yet");
    expect(html).toContain("Nobody");
    expect(html).not.toContain("Waiting for approval");
  });

  it("an empty list says so, and still offers a new document", () => {
    const html = card({ rows: [] });
    expect(html).toContain("No documents yet");
    expect(html).toContain("New document");
  });

  it("older documents are a link, never quietly dropped; a later page links back to the newest", () => {
    const first = card({ next: "2026-10-01T00:00:00.000Z|d0" });
    expect(first).toContain("Older documents");
    expect(first).toContain("tab=submissions&amp;docsAfter=2026-10-01T00%3A00%3A00.000Z%7Cd0");
    expect(first).not.toContain(">Newest<");
    const later = card({ after: "x|y" });
    expect(later).toContain(">Newest<");
    expect(later).not.toContain("Older documents");
    expect(card()).not.toContain("Older documents");
  });

  it("a contract or setting that does not allow it blocks the button and says why, in the organisation's words, not hidden", () => {
    const why = `Project files are not set up yet. Ask ${ORG} to set them up.`;
    const html = card({ start: start({ create: shut(why) }), rows: [] });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>New document<\/button>/);
    expect(html).toContain(why);
    expect(html).not.toContain("data-org");
    expect(html).not.toMatch(/Configuration|administrator/i);
  });

  it("without the page's form key nothing can be sent, and the list says so", () => {
    const html = card({ token: null });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>New document<\/button>/);
    expect(html).toContain("Sending is closed.");
  });

  it("names no code", () => {
    expect(card({ rows: [row({ stateLabel: "Approved", waitsOnLabel: null })] })).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
  });
});

describe("a state's colour", () => {
  const r = { stateLabel: "Shared", shown: "VERSIONS", waitsOnYou: false, waitsOnLabel: null } as const;
  it("asks for action in amber, shows the organisation's work in hand in blue, a final approval in green, and the rest plain", () => {
    expect(portalTone({ ...r, waitsOnYou: true, waitsOnLabel: "Waiting for you", stateLabel: "Rejected" })).toBe("warn");
    expect(portalTone({ ...r, shown: "BEING_PREPARED", stateLabel: `Being prepared by ${ORG}` })).toBe("info");
    expect(portalTone({ ...r, stateLabel: "Approved" })).toBe("ok");
    // The six kinds' final words (plan step 6): taken up, and noted on defects rectified.
    expect(portalTone({ ...r, stateLabel: "Taken up", waitsOnLabel: null })).toBe("ok");
    expect(portalTone({ ...r, stateLabel: "Noted", waitsOnLabel: null })).toBe("ok");
    expect(portalTone({ ...r, waitsOnLabel: `Waiting on ${ORG}`, stateLabel: "Waiting for approval" })).toBe("info");
    expect(portalTone(r)).toBe("neutral");
  });
});

const page = (o: Partial<PortalDocumentPage> = {}): PortalDocumentPage => ({
  id: "d1",
  contractId: "c1",
  title: "Method statement",
  note: "",
  kindLabel: null,
  stateLabel: "Rejected",
  shown: "VERSIONS",
  waitsOnLabel: "Waiting for you",
  waitsOnYou: true,
  fromLabel: "Yours",
  createdOn: "2026-10-20",
  versions: [
    {
      id: "v1",
      number: 1,
      label: "Version 1",
      note: "First issue.",
      uploadedOn: "2026-10-20",
      uploadedAtText: "20 Oct 2026 · 09:15",
      uploadedByName: "Siti Binti Omar",
      answersRequest: false,
      signed: false,
      files: [{ attachmentId: "a1", name: "statement-v1.pdf", bytes: 2048, typeLabel: "PDF", scanLabel: "Not scanned for malware", href: "/supplier/projects/documents/file/a1" }],
      decisions: [{ outcome: "REJECTED", outcomeLabel: "Rejected", remarks: "The levels are wrong.", decidedOn: "2026-10-21", byName: ORG }],
    },
    { id: "v2", number: 2, label: "Version 2", note: "", uploadedOn: "2026-10-22", uploadedAtText: "22 Oct 2026 · 14:02", uploadedByName: "Siti Binti Omar", answersRequest: false, signed: false, files: [{ attachmentId: "a2", name: "statement-v2.pdf", bytes: 4096, typeLabel: "PDF", scanLabel: "Not scanned for malware", href: "/supplier/projects/documents/file/a2" }], decisions: [] },
  ],
  requests: [],
  actions: { upload: open, request: shut(`That cannot be done on this document now.`) },
  // Plan step 6 (server): an ordinary document asks no password and picks no kind; the screen step renders both.
  asksPassword: false,
  mayPickKind: false,
  takesPurposes: false,
  paymentRoute: null,
  workspaceShut: null,
  classSet: true,
  organisationName: ORG,
  ...o,
});
const view = (p: PortalDocumentPage, token: string | null = "tok&key") => renderToStaticMarkup(h(PortalDocumentView, { page: p, contractNumber: "JKR/2026/01", token }));

describe("a document's page in the portal", () => {
  it("heads with the title, the state and who it waits on; versions run newest first with their files and the remarks sent back, by the organisation", () => {
    const html = view(page());
    expect(html).toContain("Method statement");
    expect(html).toContain("Rejected");
    expect(html).toContain("Your document");
    expect(html).toContain("Waiting for you");
    expect(html.indexOf("Version 2")).toBeGreaterThan(-1);
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("statement-v1.pdf");
    expect(html).toContain("PDF · 2 KB");
    expect(html).toContain(">Not scanned<");
    expect(html).toContain("The levels are wrong.");
    expect(html).toContain(`>${ORG}<`);
    expect(html).toContain("22 Oct 2026");
    expect(html).toContain("Contract JKR/2026/01");
    expect(html).toContain('href="/supplier/projects/c1?tab=submissions"');
  });

  it("PW-44: a declaration's version signed with the password says so, from the column, with no moment; an unsigned version says nothing", () => {
    const base = page();
    const signed = view(page({ versions: base.versions.map((v) => (v.number === 2 ? { ...v, signed: true } : v)) }));
    expect(signed.match(/Signed with a password/g)).toHaveLength(1);
    expect(view(base)).not.toContain("Signed with a password");
  });

  it("a file is a plain download link carrying the page's own form key; no key, no link", () => {
    const html = view(page());
    expect(html).toContain('href="/supplier/projects/documents/file/a2?t=tok%26key"');
    expect(html).toContain("download");
    const closed = view(page(), null);
    expect(closed).not.toContain("/supplier/projects/documents/file/");
    expect(closed).toMatch(/<button[^>]*disabled[^>]*>Download<\/button>/);
    expect(closed).toContain("Sending is closed.");
  });

  it("offers what the loader allows, the new version as the one primary action; what it does not allow is blocked with its reason, said once under the header", () => {
    const html = view(page());
    expect(html).toContain('data-tone="primary">Upload a new version');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Ask for it<\/button>/);
    expect(html).toContain("Ask for it: That cannot be done on this document now.");
  });

  it("an organisation's document shows nothing to send: both acts are blocked with the loader's reasons, and no remarks or officer appear", () => {
    const g = shut("It is not yours to send to.");
    const html = view(page({ fromLabel: ORG, stateLabel: "Shared", waitsOnLabel: null, waitsOnYou: false, actions: { upload: g, request: g }, versions: [{ ...page().versions[0]!, uploadedByName: ORG, decisions: [] }] }));
    expect(html).toContain(`${ORG}&#x27;s document`);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Upload a new version<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Ask for it<\/button>/);
    // Said once under the header, not beside each button (the buttons carry it as their title and description only).
    expect(html.split(">It is not yours to send to.<").length - 1).toBe(1);
    expect(html).not.toContain("The levels are wrong.");
    expect(html).not.toContain(OFFICER);
  });

  it("a contract that shuts the workspace says so once", () => {
    const words = "This contract is closed, so nothing more is added to it.";
    const g = shut(words);
    const html = view(page({ workspaceShut: words, actions: { upload: g, request: g } }));
    expect(html.split(words).length - 1).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain("Upload a new version: ");
  });

  it("a document being prepared for the contractor shows the request, not an empty list of versions", () => {
    const html = view(page({ stateLabel: `Being prepared by ${ORG}`, shown: "BEING_PREPARED", waitsOnLabel: null, waitsOnYou: false, fromLabel: ORG, versions: [], requests: [{ id: "r1", toLabel: ORG, byLabel: "Siti Binti Omar", note: "A copy of the policy, please.", requestedOn: "2026-10-22", answeredByVersion: null }] }));
    expect(html).toContain(`Being prepared by ${ORG}`);
    expect(html).toContain(`Asked of ${ORG}`);
    expect(html).toContain("A copy of the policy, please.");
    expect(html).not.toContain("No versions yet");
  });

  it("a request to the contractor reads as asked of you, and a document with nothing yet says so", () => {
    const asked = view(page({ stateLabel: "Asked for", versions: [], requests: [{ id: "r1", toLabel: "You", byLabel: ORG, note: "The section drawings.", requestedOn: "2026-10-22", answeredByVersion: null }] }));
    expect(asked).toContain("Asked of you");
    expect(asked).toContain("The section drawings.");
    expect(view(page({ versions: [], requests: [] }))).toContain("No versions yet");
    // An answered request is shown by the version that answers it, not again as open.
    expect(view(page({ requests: [{ id: "r1", toLabel: "You", byLabel: ORG, note: "Old ask.", requestedOn: "2026-10-19", answeredByVersion: 1 }] }))).not.toContain("Old ask.");
  });

  it("names no code and no staff-only words", () => {
    expect(view(page())).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b|Configuration ›/);
  });
});

describe("Waiting for you", () => {
  const w = (o: Partial<WaitingRow> = {}): WaitingRow => ({ contractId: "c1", contractLabel: "JKR/2026/01 · Road works", documentId: "d1", title: "Drainage layout", kindLabel: null, stateLabel: "Asked for", href: "/supplier/projects/c1/documents/d1", ...o });
  const list = (rows: WaitingRow[], withContract: boolean, more: { href: string; label: string } | null = null) => renderToStaticMarkup(h(WaitingList, { rows, withContract, more }));

  it("lists each document as a link with its state, naming the contract only where the list spans contracts; no count and no days waiting", () => {
    const home = list([w(), w({ documentId: "d2", title: "Method statement", stateLabel: "Rejected", href: "/supplier/projects/c2/documents/d2", contractLabel: "JKR/2026/02 · Bridge" })], true);
    expect(home).toContain('href="/supplier/projects/c1/documents/d1"');
    expect(home).toContain("Drainage layout");
    expect(home).toContain("Asked for");
    expect(home).toContain("Rejected");
    expect(home).toContain("JKR/2026/01 · Road works");
    expect(home).toContain("JKR/2026/02 · Bridge");
    const one = list([w()], false);
    expect(one).not.toContain("Road works");
    for (const html of [home, one]) expect(html).not.toMatch(/\b\d+ (documents?|of \d+|days?)\b|overdue|Showing/i);
  });

  it("offers a link to the rest when there are more, and none otherwise", () => {
    expect(list([w()], true, { href: "/supplier/projects", label: "More in My Projects" })).toContain('href="/supplier/projects"');
    expect(list([w()], true)).not.toContain("More in");
  });

  it("is not drawn on the home for nobody, or for a contractor with nothing waiting; the overview says nothing waits only when nothing does", () => {
    const home = readFileSync(join(process.cwd(), "src/app/supplier/waiting-card.tsx"), "utf8");
    expect(home).toMatch(/if \(!actor\) return null;/);
    // The home's rows are an issued award to accept (V4) and the documents waiting: the card is not drawn when both are empty.
    expect(home).toMatch(/if \(rows\.length === 0\) return null;/);
    const page = readFileSync(join(process.cwd(), "src/app/supplier/page.tsx"), "utf8");
    expect(page).toContain("<WaitingForYouCard />");
    // The home asks no sign-in itself: it is a public page, and the card reads the session without sending anyone away.
    expect(page).not.toContain("requireSupplier");
    const panels = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/panels.tsx"), "utf8");
    expect(panels).toMatch(/\(todo\.length > 0 \|\| waiting\.rows\.length === 0\) &&/);
    expect(panels).toContain("loadWaitingForYou(db, actor, { contractId: ctx.contract.id })");
  });
});

describe("the Documents tab of a project (plan step 6)", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const src = read("src/app/supplier/projects/[id]/panels.tsx");
  const tab = src.slice(src.indexOf("export async function SubmissionsPanel"));

  it("is named Documents, and its address id is unchanged", () => {
    const page = read("src/app/supplier/projects/[id]/page.tsx");
    expect(page).toContain('{ id: "submissions", label: "Documents"');
    expect(page).not.toContain('label: "Submissions"');
  });

  it("is one list: the earlier list card and every send form are gone, and an earlier record opens read only above the list, read by its id", () => {
    expect(tab).not.toMatch(/SubmitControl|Send a notice|title="Submissions"|submissionsTab\(/);
    expect(src).not.toMatch(/SubmitControl|submissionsTab/);
    expect(tab.indexOf("<EarlierRecordCard")).toBeGreaterThan(-1);
    expect(tab.indexOf("<EarlierRecordCard")).toBeLessThan(tab.indexOf("<PortalDocumentsPanel"));
    expect(tab).toContain("loadPortalEarlier(db, { organisationId: actor.organisationId, contractId: ctx.contract.id, supplierId: actor.supplierId, id: earlier })");
    // The contractor's card is never given an officer.
    expect(tab).not.toContain("answeredBy");
    expect(read("src/app/supplier/projects/[id]/controls.tsx")).not.toContain("SubmitControl");
  });

  it("the Programme and Payments tabs read nothing of a sibling tab now that they send nothing: they point to Documents", () => {
    const programme = src.slice(src.indexOf("export async function ProgrammePanel"), src.indexOf("export async function DiaryPanel"));
    const payments = src.slice(src.indexOf("export async function PaymentsPanel"), src.indexOf("export async function CertificatesPanel"));
    for (const body of [programme, payments]) {
      expect(body).not.toContain("overviewTab(");
      expect(body).toContain("tab=submissions");
    }
  });

  it("a claim sent as a document links to its page with no figure; an earlier claim keeps its stored one", () => {
    const payments = src.slice(src.indexOf("export async function PaymentsPanel"), src.indexOf("export async function CertificatesPanel"));
    expect(payments).toMatch(/c\.href \? <Link href=\{c\.href\}/);
  });

  it("the overview words documents, not submissions", () => {
    const overview = src.slice(src.indexOf("export async function OverviewPanel"), src.indexOf("export async function ProgrammePanel"));
    // The address id `tab=submissions` stays; no word of it is shown.
    expect(overview.replaceAll("tab=submissions", "")).not.toMatch(/ubmissions?\b/);
    expect(overview).toContain("with the office");
  });
});

describe("the contractor's drawers carry the kind and the password (plan step 6; PW-9, PW-10)", () => {
  const drawers = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/document-drawers.tsx"), "utf8");

  it("the password field is a password input that asks the browser for the current password, and is cleared after every answer and on close", () => {
    expect(drawers).toMatch(/type="password" autoComplete="current-password"/);
    expect(drawers.match(/setPassword\(""\)/g)!.length).toBeGreaterThanOrEqual(4);
    expect(drawers).not.toMatch(/localStorage|sessionStorage|defaultValue=\{password/);
  });

  it("never uses the old hints, which describe amounts and days, and never prints a code", () => {
    expect(drawers).not.toMatch(/SUBMISSION_KIND_HINT|KIND_SHAPE/);
    expect(drawers).not.toMatch(/\.code\b/);
  });

  // V7: the kinds offered follow the contract's payment route, so the call is no longer bare `kindChoices()`.
  it("the version drawer is given what the page says: asks the password, may pick a kind, takes purposes, the kinds its route offers", () => {
    const view = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/documents/[documentId]/document-view.tsx"), "utf8");
    expect(view).toContain("asksPassword={page.asksPassword} mayPickKind={page.mayPickKind} takesFiles={page.takesPurposes} kinds={kindChoices(page.paymentRoute)}");
  });

  it("the Payments tab draws the Invoices card from the loader's rows, ahead of the certificates, and the claims list stays interim and materials", () => {
    const panels = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/panels.tsx"), "utf8");
    expect(panels).toContain("{p.invoices.show && <InvoicesCard contractId={ctx.contract.id} rows={p.invoices.rows} />}");
    expect(panels.indexOf("<InvoicesCard")).toBeLessThan(panels.indexOf('title="Payment certificates"'));
    const store = readFileSync(join(process.cwd(), "src/lib/portal/projects/workspace-store.ts"), "utf8");
    expect(store).toContain('kind: { in: ["INTERIM_CLAIM", "MATERIALS_ON_SITE"] }');
    expect(store).toContain("loadSupplyClaims(");
    const card = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/invoices-card.tsx"), "utf8");
    expect(card).toContain("invoiceChip(r)");
    expect(card).toContain("No invoice sent");
    expect(card).not.toMatch(/\.code|formatMoney|senFromDecimal/);
  });

  it("the list hands the new-document drawer the loader's kinds", () => {
    const card = readFileSync(join(process.cwd(), "src/app/supplier/projects/[id]/portal-documents-card.tsx"), "utf8");
    expect(card).toContain("kinds={start.kinds}");
  });
});
