import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROJECT_FILES_PER_VERSION } from "./bounds";
import {
  NOTE_MAX,
  REASON_MAX,
  REMARKS_MAX,
  TITLE_MAX,
  addApproverFaults,
  createFaults,
  decideFaults,
  markFaults,
  removeApproverFaults,
  requestFaults,
  uploadFaults,
  type FirstAct,
} from "./faults";
import { documentState } from "./state";
import { story } from "./story.fixture";
import type { Actor, DocumentFacts, Finding } from "./types";

/** What refuses each act (PW-5 to PW-9, PW-25, PW-30), every fault at once, each boundary on both sides, and each database refusal caught first. */

const so = (personId = "so", authorityToday = true): Actor => ({ side: "ORGANISATION", personId, authorityToday });
const clerk = so("clerk", false);
const acc: Actor = { side: "CONTRACTOR", accountId: "acc" };
const codes = (fs: readonly Finding[]) => fs.map((f) => f.code).sort();
const x = (n: number) => "x".repeat(n);

// ------------------------------------------------------------------ create

describe("createFaults", () => {
  const upload = (o: Partial<{ files: number; note: string; kind: "INTERIM_CLAIM" | "STATUTORY_DECLARATION" | null; signed: boolean }> = {}): FirstAct => ({ upload: { files: 1, note: "", kind: null, signed: false, ...o } });
  const ask = (toSide: "CONTRACTOR" | "ORGANISATION" = "CONTRACTOR", note = ""): FirstAct => ({ request: { toSide, note } });
  const base = { actor: so(), classSet: true, title: "Drainage layout", note: "", first: upload(), approvers: [] as { personId: string; authorityToday: boolean }[] };

  it("accepts an organisation upload, an organisation request to the contractor with approvers, and a contractor's upload or request", () => {
    expect(createFaults(base)).toEqual([]);
    expect(createFaults({ ...base, first: ask("CONTRACTOR"), approvers: [{ personId: "engineer", authorityToday: true }] })).toEqual([]);
    expect(createFaults({ ...base, actor: acc, first: upload({ kind: "INTERIM_CLAIM" }) })).toEqual([]);
    expect(createFaults({ ...base, actor: acc, first: ask("ORGANISATION") })).toEqual([]);
  });

  it("returns every fault at once, never only the first", () => {
    const f = createFaults({ actor: clerk, classSet: false, title: " ", note: x(NOTE_MAX + 1), first: upload({ files: 0, note: x(NOTE_MAX + 1), kind: "STATUTORY_DECLARATION" }), approvers: [{ personId: "a", authorityToday: false }, { personId: "a", authorityToday: true }] });
    expect(codes(f)).toEqual(["APPROVER_NO_AUTHORITY", "APPROVER_TWICE", "CLASS_NOT_SET", "DECLARATION_NOT_SIGNED", "KIND_NOT_CONTRACTOR", "KIND_WITH_APPROVERS", "NOTE_TOO_LONG", "NOTE_TOO_LONG", "NO_AUTHORITY", "NO_FILES", "TITLE_REQUIRED"]);
    expect(f.filter((x) => x.code === "NOTE_TOO_LONG").map((x) => x.data?.field)).toEqual(["document", "version"]);
    expect(f.every((x) => x.level === "block")).toBe(true);
  });

  it("an organisation person without PW-5 authority today is refused; a contractor's reach is settled before", () => {
    expect(codes(createFaults({ ...base, actor: clerk }))).toEqual(["NO_AUTHORITY"]);
  });

  it("the project class unset refuses every creation, a request too (PW-14)", () => {
    expect(codes(createFaults({ ...base, classSet: false }))).toEqual(["CLASS_NOT_SET"]);
    expect(codes(createFaults({ ...base, classSet: false, first: ask() }))).toEqual(["CLASS_NOT_SET"]);
  });

  it("title: blank refused (the CHECK), exactly the most accepted, one more refused, measured trimmed", () => {
    expect(codes(createFaults({ ...base, title: "" }))).toEqual(["TITLE_REQUIRED"]);
    expect(createFaults({ ...base, title: x(TITLE_MAX) })).toEqual([]);
    expect(createFaults({ ...base, title: `  ${x(TITLE_MAX)}  ` })).toEqual([]);
    expect(createFaults({ ...base, title: x(TITLE_MAX + 1) })).toEqual([{ code: "TITLE_TOO_LONG", level: "block", data: { limit: TITLE_MAX } }]);
  });

  it("notes: at the most accepted, one more refused, naming which note", () => {
    expect(createFaults({ ...base, note: x(NOTE_MAX) })).toEqual([]);
    expect(createFaults({ ...base, first: ask("CONTRACTOR", x(NOTE_MAX)) })).toEqual([]);
    expect(createFaults({ ...base, first: ask("CONTRACTOR", x(NOTE_MAX + 1)) })[0]?.data).toEqual({ field: "request", limit: NOTE_MAX });
  });

  it("files: none refused, 20 accepted, 21 refused", () => {
    expect(codes(createFaults({ ...base, first: upload({ files: 0 }) }))).toEqual(["NO_FILES"]);
    expect(createFaults({ ...base, first: upload({ files: PROJECT_FILES_PER_VERSION }) })).toEqual([]);
    expect(createFaults({ ...base, first: upload({ files: PROJECT_FILES_PER_VERSION + 1 }) })).toEqual([{ code: "TOO_MANY_FILES", level: "block", data: { limit: 20, files: 21 } }]);
  });

  it("a kind is the contractor's only, never with approvers; a declaration is signed", () => {
    expect(codes(createFaults({ ...base, first: upload({ kind: "INTERIM_CLAIM" }) }))).toEqual(["KIND_NOT_CONTRACTOR"]);
    expect(codes(createFaults({ ...base, actor: acc, first: upload({ kind: "STATUTORY_DECLARATION" }) }))).toEqual(["DECLARATION_NOT_SIGNED"]);
    expect(createFaults({ ...base, actor: acc, first: upload({ kind: "STATUTORY_DECLARATION", signed: true }) })).toEqual([]);
  });

  it("approvers are named by the organisation only, each holding authority today, each once (the partial unique key)", () => {
    expect(codes(createFaults({ ...base, actor: acc, first: ask("ORGANISATION"), approvers: [{ personId: "a", authorityToday: true }] }))).toEqual(["APPROVERS_NOT_ORGANISATION"]);
    expect(createFaults({ ...base, approvers: [{ personId: "a", authorityToday: false }] })).toEqual([{ code: "APPROVER_NO_AUTHORITY", level: "block", data: { personId: "a" } }]);
    expect(codes(createFaults({ ...base, approvers: [{ personId: "a", authorityToday: true }, { personId: "a", authorityToday: true }] }))).toEqual(["APPROVER_TWICE"]);
  });

  it("a request goes to the other side (trigger PA042)", () => {
    expect(codes(createFaults({ ...base, first: ask("ORGANISATION") }))).toEqual(["REQUEST_OWN_SIDE"]);
    expect(codes(createFaults({ ...base, actor: acc, first: ask("CONTRACTOR") }))).toEqual(["REQUEST_OWN_SIDE"]);
  });
});

// ------------------------------------------------------------------ upload

describe("uploadFaults", () => {
  const up = (doc: DocumentFacts, o: Partial<Parameters<typeof uploadFaults>[0]> = {}) => uploadFaults({ actor: acc, classSet: true, doc, files: 1, note: "", kind: null, signed: false, ...o });

  it("a new version is accepted in every state but the final ones", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(up(s.doc)).toEqual([]); // REQUESTED
    s.addApprover("e");
    s.upload();
    expect(up(s.doc)).toEqual([]); // WAITING_FOR_APPROVAL
    s.decide("e", "REJECTED", "No");
    expect(up(s.doc)).toEqual([]); // REJECTED
    s.upload();
    s.decide("e", "APPROVED");
    expect(up(s.doc)).toEqual([{ code: "FINAL", level: "block", data: { state: "APPROVED", kind: null } }]);
    const k = story("CONTRACTOR");
    k.upload({ kind: "DEFECTS_RECTIFIED" });
    expect(up(k.doc)).toEqual([]); // RECEIVED
    k.mark("RETURNED", "x");
    expect(up(k.doc)).toEqual([]); // RETURNED
    k.upload();
    k.mark("TAKEN_UP");
    expect(up(k.doc)).toEqual([{ code: "FINAL", level: "block", data: { state: "TAKEN_UP", kind: "DEFECTS_RECTIFIED" } }]);
    const shared = story("CONTRACTOR");
    shared.upload();
    expect(up(shared.doc)).toEqual([]); // SHARED
  });

  it("only the document's side uploads (trigger PA041): a contractor never to an organisation document, an organisation person never to a contractor's", () => {
    const org = story("ORGANISATION");
    org.upload();
    expect(up(org.doc)).toEqual([{ code: "NOT_YOUR_SIDE", level: "block", data: { side: "ORGANISATION" } }]);
    const con = story("CONTRACTOR");
    con.request();
    expect(codes(up(con.doc, { actor: so() }))).toEqual(["NOT_YOUR_SIDE"]);
    expect(up(org.doc, { actor: so() })).toEqual([]);
  });

  it("returns every fault at once", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.upload();
    s.decide("e", "APPROVED");
    const f = up(s.doc, { actor: clerk, classSet: false, files: PROJECT_FILES_PER_VERSION + 1, note: x(NOTE_MAX + 1), kind: "STATUTORY_DECLARATION" });
    expect(codes(f)).toEqual(["CLASS_NOT_SET", "DECLARATION_NOT_SIGNED", "FINAL", "KIND_ALREADY_SET", "KIND_NOT_CONTRACTOR", "KIND_WITH_APPROVERS", "NOTE_TOO_LONG", "NO_AUTHORITY", "TOO_MANY_FILES"]);
  });

  it("files: none refused, 20 accepted, 21 refused", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(codes(up(s.doc, { files: 0 }))).toEqual(["NO_FILES"]);
    expect(up(s.doc, { files: 20 })).toEqual([]);
    expect(codes(up(s.doc, { files: 21 }))).toEqual(["TOO_MANY_FILES"]);
  });

  it("a kind only with a contractor document's first version, while no approver is live (trigger PA040)", () => {
    const asked = story("CONTRACTOR");
    asked.request();
    expect(up(asked.doc, { kind: "WORK_PROGRAMME" })).toEqual([]);
    asked.addApprover("e");
    expect(codes(up(asked.doc, { kind: "WORK_PROGRAMME" }))).toEqual(["KIND_WITH_APPROVERS"]);
    const later = story("CONTRACTOR");
    later.upload();
    expect(codes(up(later.doc, { kind: "WORK_PROGRAMME" }))).toEqual(["KIND_ALREADY_SET"]);
    const kinded = story("CONTRACTOR");
    kinded.upload({ kind: "WORK_PROGRAMME" });
    kinded.mark("RETURNED", "x");
    expect(codes(up(kinded.doc, { kind: "WORK_PROGRAMME" }))).toEqual(["KIND_ALREADY_SET"]);
    expect(up(kinded.doc)).toEqual([]);
  });

  it("an approver removed before the first version no longer blocks the kind", () => {
    const s = story("CONTRACTOR");
    s.request();
    const a = s.addApprover("e");
    s.removeApprover(a);
    expect(up(s.doc, { kind: "MATERIALS_ON_SITE" })).toEqual([]);
  });

  it("every version of a statutory declaration is signed, the first and the later ones", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(codes(up(s.doc, { kind: "STATUTORY_DECLARATION" }))).toEqual(["DECLARATION_NOT_SIGNED"]);
    expect(up(s.doc, { kind: "STATUTORY_DECLARATION", signed: true })).toEqual([]);
    s.upload({ kind: "STATUTORY_DECLARATION" });
    s.mark("RETURNED", "Unsigned page");
    expect(codes(up(s.doc))).toEqual(["DECLARATION_NOT_SIGNED"]);
    expect(up(s.doc, { signed: true })).toEqual([]);
  });
});

// ------------------------------------------------------------------ request

describe("requestFaults (PW-30: only to the document's side, only while Shared)", () => {
  const ask = (actor: Actor, doc: DocumentFacts, note = "") => requestFaults({ actor, doc, note });

  it("accepted while Shared, from the other side, on either side's document", () => {
    const con = story("CONTRACTOR");
    con.upload();
    expect(ask(so(), con.doc)).toEqual([]);
    const org = story("ORGANISATION");
    org.upload();
    expect(ask(acc, org.doc)).toEqual([]);
  });

  it("refused to one's own side", () => {
    const con = story("CONTRACTOR");
    con.upload();
    expect(ask(acc, con.doc)).toEqual([{ code: "OWN_SIDE", level: "block", data: { side: "CONTRACTOR" } }]);
  });

  it("a second request while one is open is refused (trigger PA042)", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(codes(ask(so(), s.doc))).toEqual(["ALREADY_WAITING"]);
  });

  it("refused in each state but Shared, with the reason that fits it", () => {
    const rejected = story("CONTRACTOR");
    rejected.addApprover("e");
    rejected.upload();
    expect(codes(ask(so(), rejected.doc))).toEqual(["UNDER_REVIEW"]); // contractor document waiting for approval: the asker has it
    rejected.decide("e", "REJECTED", "No");
    expect(codes(ask(so(), rejected.doc))).toEqual(["ALREADY_WAITING"]); // REJECTED waits on the contractor already
    rejected.upload();
    rejected.decide("e", "APPROVED");
    expect(codes(ask(so(), rejected.doc))).toEqual(["FINAL"]);

    const orgWaiting = story("ORGANISATION");
    orgWaiting.addApprover("e");
    orgWaiting.upload();
    expect(codes(ask(acc, orgWaiting.doc))).toEqual(["ALREADY_WAITING"]); // waits on the organisation, the document's side

    const kind = story("CONTRACTOR");
    kind.upload({ kind: "INTERIM_CLAIM" });
    expect(ask(so(), kind.doc)).toEqual([{ code: "UNDER_REVIEW", level: "block", data: { state: "RECEIVED", kind: "INTERIM_CLAIM" } }]);
    kind.mark("RETURNED", "x");
    expect(codes(ask(so(), kind.doc))).toEqual(["ALREADY_WAITING"]);
    kind.upload();
    kind.mark("TAKEN_UP");
    expect(codes(ask(so(), kind.doc))).toEqual(["FINAL"]);
  });

  it("the founder's loop: a request while Rejected is refused", () => {
    const s = story("CONTRACTOR");
    s.request();
    s.addApprover("e");
    s.upload();
    s.decide("e", "REJECTED", "Invert levels missing at MH3");
    expect(codes(ask(so(), s.doc))).toEqual(["ALREADY_WAITING"]);
  });

  it("every fault at once; the note bound on both sides", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(codes(ask({ side: "CONTRACTOR", accountId: "acc" }, s.doc, x(NOTE_MAX + 1)))).toEqual(["ALREADY_WAITING", "NOTE_TOO_LONG", "OWN_SIDE"]);
    const shared = story("CONTRACTOR");
    shared.upload();
    expect(ask(so(), shared.doc, x(NOTE_MAX))).toEqual([]);
    expect(codes(ask(clerk, shared.doc))).toEqual(["NO_AUTHORITY"]);
  });
});

// ------------------------------------------------------------------ approvers

describe("addApproverFaults", () => {
  const add = (doc: DocumentFacts, o: Partial<Parameters<typeof addApproverFaults>[0]> = {}) => addApproverFaults({ actor: so(), doc, personId: "engineer", personAuthorityToday: true, ...o });

  it("by the organisation, at creation or any time before approval", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(add(s.doc)).toEqual([]);
    s.upload();
    expect(add(s.doc)).toEqual([]);
  });

  it("a contractor cannot add an approver; an officer without authority, or a person proposed without it, is refused", () => {
    const s = story("CONTRACTOR");
    s.request();
    expect(codes(add(s.doc, { actor: acc }))).toEqual(["NOT_ORGANISATION"]);
    expect(codes(add(s.doc, { actor: clerk }))).toEqual(["NO_AUTHORITY"]);
    expect(add(s.doc, { personAuthorityToday: false })).toEqual([{ code: "APPROVER_NO_AUTHORITY", level: "block", data: { personId: "engineer" } }]);
  });

  it("a live approver once (the partial unique key); removed, they may be named again", () => {
    const s = story("CONTRACTOR");
    s.request();
    const a = s.addApprover("engineer");
    expect(codes(add(s.doc))).toEqual(["ALREADY_APPROVER"]);
    s.addApprover("other");
    s.removeApprover(a);
    expect(add(s.doc)).toEqual([]);
  });

  it("refused once approved, and on a document with a kind (trigger PA043)", () => {
    const s = story("CONTRACTOR");
    s.addApprover("a");
    s.upload();
    s.decide("a", "APPROVED");
    expect(codes(add(s.doc))).toEqual(["FINAL"]);
    const k = story("CONTRACTOR");
    k.upload({ kind: "WORK_PROGRAMME" });
    expect(codes(add(k.doc))).toEqual(["KIND_TAKES_NO_APPROVERS"]);
    k.mark("TAKEN_UP");
    expect(codes(add(k.doc))).toEqual(["FINAL", "KIND_TAKES_NO_APPROVERS"]);
  });

  it("every fault at once", () => {
    const k = story("CONTRACTOR");
    k.upload({ kind: "WORK_PROGRAMME" });
    k.mark("TAKEN_UP");
    expect(codes(add(k.doc, { actor: acc, personAuthorityToday: false }))).toEqual(["APPROVER_NO_AUTHORITY", "FINAL", "KIND_TAKES_NO_APPROVERS", "NOT_ORGANISATION"]);
  });
});

describe("removeApproverFaults (PW-25)", () => {
  const remove = (doc: DocumentFacts, approverId: string, o: Partial<Parameters<typeof removeApproverFaults>[0]> = {}) => removeApproverFaults({ actor: so(), doc, approverId, reason: "On leave", ...o });

  it("a live approver who has not decided, with another remaining who has not approved, is removed", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.addApprover("b");
    s.upload();
    expect(remove(s.doc, a)).toEqual([]);
  });

  it("the last approver is refused, even before any version: replace by adding first", () => {
    const s = story("CONTRACTOR");
    s.request();
    const a = s.addApprover("a");
    expect(codes(remove(s.doc, a))).toEqual(["LAST_APPROVER"]);
    s.addApprover("b");
    expect(remove(s.doc, a)).toEqual([]);
  });

  it("refused when only people who already approved the latest version would remain", () => {
    const s = story("CONTRACTOR");
    s.addApprover("a");
    const b = s.addApprover("b");
    s.upload();
    s.decide("a", "APPROVED");
    expect(codes(remove(s.doc, b))).toEqual(["WOULD_APPROVE"]);
    // An approval of an earlier version does not count: Version 2 has none.
    s.decide("b", "REJECTED", "No");
    s.upload();
    expect(remove(s.doc, b)).toEqual([]);
  });

  it("an approver who decided the latest version stays", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.addApprover("b");
    s.upload();
    s.decide("a", "REJECTED", "No");
    expect(codes(remove(s.doc, a))).toEqual(["DECIDED_CURRENT"]);
  });

  it("an approver of another document, or one already removed, is not live here", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.addApprover("b");
    s.removeApprover(a);
    expect(codes(remove(s.doc, a))).toEqual(["NOT_LIVE"]);
    expect(codes(remove(s.doc, "ap-elsewhere"))).toEqual(["NOT_LIVE"]);
  });

  it("refused once approved; a contractor never; a reason always, within its bound", () => {
    const s = story("CONTRACTOR");
    const a = s.addApprover("a");
    s.upload();
    s.decide("a", "APPROVED");
    expect(codes(remove(s.doc, a))).toEqual(["DECIDED_CURRENT", "FINAL", "LAST_APPROVER"]);
    const t = story("CONTRACTOR");
    const b = t.addApprover("b");
    t.addApprover("c");
    expect(codes(remove(t.doc, b, { actor: acc, reason: "  " }))).toEqual(["NOT_ORGANISATION", "REASON_REQUIRED"]);
    expect(codes(remove(t.doc, b, { actor: clerk }))).toEqual(["NO_AUTHORITY"]);
    expect(remove(t.doc, b, { reason: x(REASON_MAX) })).toEqual([]);
    expect(remove(t.doc, b, { reason: x(REASON_MAX + 1) })).toEqual([{ code: "REASON_TOO_LONG", level: "block", data: { limit: REASON_MAX } }]);
  });
});

// ------------------------------------------------------------------ decide

describe("decideFaults", () => {
  const decide = (doc: DocumentFacts, o: Partial<Parameters<typeof decideFaults>[0]> = {}) => decideFaults({ actor: so("e"), doc, versionId: documentState(doc).latest?.id ?? "v1", outcome: "APPROVED", remarks: "", ...o });
  const waiting = () => {
    const s = story("CONTRACTOR");
    s.addApprover("e");
    s.addApprover("f");
    s.upload();
    return s;
  };

  it("Approve with blank remarks is accepted; Reject with blank remarks is refused (the CHECK)", () => {
    const s = waiting();
    expect(decide(s.doc)).toEqual([]);
    expect(decide(s.doc, { outcome: "REJECTED", remarks: " " })).toEqual([{ code: "REMARKS_REQUIRED", level: "block", data: { outcome: "REJECTED" } }]);
    expect(decide(s.doc, { outcome: "REJECTED", remarks: "Wrong" })).toEqual([]);
  });

  it("remarks: the most accepted, one more refused", () => {
    const s = waiting();
    expect(decide(s.doc, { remarks: x(REMARKS_MAX) })).toEqual([]);
    expect(codes(decide(s.doc, { remarks: x(REMARKS_MAX + 1) }))).toEqual(["REMARKS_TOO_LONG"]);
  });

  it("only a live approver of this document decides, as themselves (trigger PA044)", () => {
    const s = waiting();
    expect(codes(decide(s.doc, { actor: so("stranger") }))).toEqual(["NOT_AN_APPROVER"]);
    expect(codes(decide(s.doc, { actor: acc }))).toEqual(["NOT_ORGANISATION"]);
  });

  it("an approver without authority on the day they decide is refused (PW-6: re-checked)", () => {
    expect(codes(decide(waiting().doc, { actor: so("e", false) }))).toEqual(["NO_AUTHORITY"]);
  });

  it("an approver who uploaded the version is refused (trigger PA044)", () => {
    const s = story("ORGANISATION");
    s.addApprover("e");
    s.addApprover("so");
    s.upload({ personId: "so" });
    expect(codes(decide(s.doc, { actor: so("so") }))).toEqual(["OWN_VERSION"]);
    expect(decide(s.doc)).toEqual([]);
  });

  it("only the latest version (trigger PA044), once (the unique key)", () => {
    const s = waiting();
    s.decide("e", "REJECTED", "No");
    s.upload();
    expect(codes(decide(s.doc, { versionId: "v1" }))).toEqual(["ALREADY_DECIDED", "NOT_CURRENT"]);
    expect(codes(decide(s.doc, { versionId: "v9" }))).toEqual(["NOT_CURRENT"]);
    s.decide("e", "APPROVED");
    expect(codes(decide(s.doc))).toEqual(["ALREADY_DECIDED"]);
  });

  it("two approvers: a rejection by the second, then an approval by the first, is NOT_WAITING", () => {
    const s = waiting();
    s.decide("f", "REJECTED", "No");
    expect(decide(s.doc)).toEqual([{ code: "NOT_WAITING", level: "block", data: { state: "REJECTED", kind: null } }]);
  });

  it("a document with a kind can never reach APPROVED: no approver to decide, and never waiting for approval", () => {
    const k = story("CONTRACTOR");
    k.upload({ kind: "INTERIM_CLAIM" });
    expect(codes(decide(k.doc))).toEqual(["NOT_AN_APPROVER", "NOT_WAITING"]);
  });

  it("an approver named while the document is asked for again cannot decide the old version", () => {
    const s = story("ORGANISATION");
    s.upload();
    s.request();
    s.addApprover("e");
    expect(codes(decide(s.doc))).toEqual(["NOT_WAITING"]);
  });

  it("every fault at once", () => {
    const s = waiting();
    s.decide("e", "APPROVED");
    s.decide("f", "APPROVED");
    const f = decide(s.doc, { actor: so("e", false), outcome: "REJECTED", remarks: "", versionId: "v0" });
    expect(codes(f)).toEqual(["NOT_CURRENT", "NOT_WAITING", "NO_AUTHORITY", "REMARKS_REQUIRED"]);
  });
});

// ------------------------------------------------------------------ mark

describe("markFaults (PW-9)", () => {
  const mark = (doc: DocumentFacts, o: Partial<Parameters<typeof markFaults>[0]> = {}) => markFaults({ actor: so(), doc, versionId: documentState(doc).latest?.id ?? "v1", outcome: "TAKEN_UP", remarks: "", ...o });
  const received = () => {
    const s = story("CONTRACTOR");
    s.upload({ kind: "DELAY_NOTICE" });
    return s;
  };

  it("Taken up needs no remarks; Returned needs them (the CHECK)", () => {
    const s = received();
    expect(mark(s.doc)).toEqual([]);
    expect(codes(mark(s.doc, { outcome: "RETURNED" }))).toEqual(["REMARKS_REQUIRED"]);
    expect(mark(s.doc, { outcome: "RETURNED", remarks: "Cause not stated" })).toEqual([]);
    expect(mark(s.doc, { remarks: x(REMARKS_MAX) })).toEqual([]);
    expect(codes(mark(s.doc, { remarks: x(REMARKS_MAX + 1) }))).toEqual(["REMARKS_TOO_LONG"]);
  });

  it("only on a document with a kind (trigger PA044), on its latest version, once (the partial unique key)", () => {
    const plain = story("CONTRACTOR");
    plain.upload();
    expect(codes(mark(plain.doc))).toEqual(["NO_KIND"]);
    const s = received();
    s.mark("RETURNED", "x");
    expect(codes(mark(s.doc))).toEqual(["ALREADY_MARKED"]);
    s.upload();
    expect(codes(mark(s.doc, { versionId: "v1" }))).toEqual(["ALREADY_MARKED", "NOT_CURRENT"]);
    expect(mark(s.doc)).toEqual([]);
  });

  it("a contractor never marks; an officer without authority is refused; every fault at once", () => {
    const s = received();
    s.mark("TAKEN_UP");
    expect(codes(mark(s.doc, { actor: acc, outcome: "RETURNED" }))).toEqual(["ALREADY_MARKED", "NOT_ORGANISATION", "REMARKS_REQUIRED"]);
    expect(codes(mark(received().doc, { actor: clerk }))).toEqual(["NO_AUTHORITY"]);
  });

  it("OWN_VERSION mirrors trigger PA044 for a version a staff person uploaded", () => {
    const d: DocumentFacts = { ...received().doc, versions: [{ ...received().doc.versions[0]!, uploaderPersonId: "so", uploaderAccountId: null }] };
    expect(codes(mark(d))).toEqual(["OWN_VERSION"]);
  });
});

// ------------------------------------------------------------------ no password step-up but the declaration's (PW-26, PW-10)

describe("no act asks a password but the statutory declaration's version", () => {
  const src = readFileSync(path.join(__dirname, "faults.ts"), "utf8");
  /// The source of one exported function: from its declaration to the next top-level section.
  const body = (name: string) => {
    const start = src.indexOf(`export function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    const end = src.indexOf("\n// ----", start);
    return src.slice(start, end === -1 ? undefined : end);
  };
  it("approving, rejecting, marking and the approver acts take no signature, password or step-up", () => {
    for (const name of ["decideFaults", "markFaults", "addApproverFaults", "removeApproverFaults", "requestFaults"]) expect(body(name), name).not.toMatch(/signed|password|stepUp|step-up|DECLARATION/i);
  });
  it("only creating and uploading know the declaration's signature", () => {
    expect(body("createFaults")).toMatch(/DECLARATION_NOT_SIGNED/);
    expect(body("uploadFaults")).toMatch(/DECLARATION_NOT_SIGNED/);
  });
});
