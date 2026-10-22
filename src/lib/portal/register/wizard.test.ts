import { describe, expect, it, vi } from "vitest";

import { HONEYPOT_FIELD } from "@/lib/portal/apply";
import { registrationSummary } from "@/lib/portal/registration/summary";

import { body, config, FILES, heldState, pdf, step1 } from "./fixture";
import { publicApplicationFaults, publicFaultViews } from "./faults";
import { heldDraft } from "./held-draft";
import { ctx as registrationCtx } from "@/lib/portal/registration/fixture";
import { summaryRecordOfHeld } from "./summary-record";
import {
  browserContext,
  firstFaultStep,
  formParts,
  heldBody,
  heldFileChecks,
  heldSummaryState,
  readReply,
  readValues,
  sendApplication,
  sentRows,
  stepCheck,
  summaryListsOf,
  TOKEN_REFRESH_AFTER_MS,
  tokenIsOld,
  wizardReducer,
  type HeldFile,
  type Transport,
} from "./wizard";

/** ADR 0041, plan section 4.2: the public form's own logic, which the page only wires up. */

const NONCE = "A".repeat(22);
const MAC = "B".repeat(43);
const tokenAt = (ms: number, n = NONCE) => `${ms}.${n}.${MAC}`;

describe("the page's state (plan 4.1: one reducer)", () => {
  it("moves on at Next only when nothing blocks, and remembers how far it has come", () => {
    const s = heldState({ step: "company", reached: 0, touched: false });
    const blocked = wizardReducer(s, { type: "next", faults: [{ step: "company", field: "registeredName", level: "block", message: "Enter the company's registered name." }] });
    expect(blocked.step).toBe("company");
    expect(blocked.reached).toBe(0);
    expect(blocked.faults).toHaveLength(1);
    const moved = wizardReducer(s, { type: "next", faults: [] });
    expect(moved).toMatchObject({ step: "documents", reached: 1, faults: [] });
  });

  it("goes back to a step already reached, never on to one not reached (plan 4.2.1)", () => {
    const s = heldState({ step: "documents", reached: 1 });
    expect(wizardReducer(s, { type: "goTo", step: "company" }).step).toBe("company");
    expect(wizardReducer(s, { type: "goTo", step: "epayment" }).step).toBe("documents");
    const back = wizardReducer(heldState({ step: "company", reached: 3 }), { type: "goTo", step: "epayment" });
    expect(back.step).toBe("epayment");
  });

  it("is touched by any change to what is held, and not by moving between steps (REG-4(c))", () => {
    const s = heldState({ touched: false, reached: 4 });
    expect(wizardReducer(s, { type: "goTo", step: "codes" }).touched).toBe(false);
    expect(wizardReducer(s, { type: "hits", hits: [] }).touched).toBe(false);
    expect(wizardReducer(s, { type: "company", value: { ...s.company, registeredName: "X" } }).touched).toBe(true);
    expect(wizardReducer(s, { type: "addStatement", file: pdf("s.pdf") }).touched).toBe(true);
    expect(wizardReducer(s, { type: "terms", confirmed: true }).touched).toBe(true);
  });

  it("drops a removed row's files and codes with it", () => {
    const s = heldState();
    const next = wizardReducer(s, { type: "documents", rows: s.documents.filter((r) => r.id !== "new:works") });
    expect(Object.keys(next.files)).toEqual(["new:reg"]);
    expect(next.chosen).toEqual({});
  });
});

describe("what is sent (plan 4.2.4)", () => {
  it("builds the same body the server parses, the codes by row and every agreement on the text the page showed", () => {
    expect(heldBody(heldState(), config())).toEqual(body());
  });

  it("leaves out a row with nothing typed and no file, and sends one with only a file", () => {
    const s = heldState({ documents: [...heldState().documents, { id: "new:iother", typeId: "t-reg", title: "", reference: "", issuingAuthority: "", expiresOn: "", ratePercent: "", notApplicable: false }] });
    expect(sentRows(s).map((r) => r.id)).toEqual(["new:reg", "new:works"]);
    const withFile = { ...s, files: { ...s.files, "new:iother": [pdf("x.pdf")] } };
    expect(sentRows(withFile).map((r) => r.id)).toEqual(["new:reg", "new:works", "new:iother"]);
  });

  it("sends the application, each row's files, the statement and the bait field, in that order; never the files of a row that does not apply", () => {
    const s = heldState();
    expect(formParts(s, config(), "").map(([n, v]) => [n, typeof v === "string" ? (n === "application" ? "json" : v) : v.name])).toEqual([
      ["application", "json"],
      ["doc.new:reg", "registry.pdf"],
      ["doc.new:works", "board.pdf"],
      ["statement", "statement.pdf"],
      [HONEYPOT_FIELD, ""],
    ]);
    const na = { ...s, documents: s.documents.map((r) => (r.id === "new:reg" ? { ...r, notApplicable: true } : r)) };
    expect(formParts(na, config(), "").map(([n]) => n)).not.toContain("doc.new:reg");
  });

  it("builds the browser's context from the codes the searches named and the applicant's own number and contact", () => {
    const c = browserContext(heldState(), config());
    expect(c.values.map((v) => [v.id, v.code, v.kind])).toEqual([["v-g1", "G1", "GRADE"], ["v-b", "B", "CATEGORY"]]);
    expect(c.supplier).toEqual({ registrationNoKey: "202001000001", contactName: "Aminah Binti Ali" });
  });
});

describe("the page's check at Next is the server's own (REG-1, plan 8.1)", () => {
  it("finds nothing blocking on a whole application, at every step", () => {
    for (const step of ["company", "documents", "codes", "epayment", "review"] as const) expect(stepCheck(step, heldState(), config()).filter((f) => f.level === "block"), step).toEqual([]);
  });

  it("at step 5 gives exactly the server's findings for the same input", () => {
    const s = heldState({ terms: false, signatoryDesignation: "", creditor: { ...heldState().creditor, bankCode: "" } });
    const server = publicFaultViews(publicApplicationFaults(heldBody(s, config()), heldDraft(heldBody(s, config()), FILES, 1), { ...registrationCtx(), values: browserContext(s, config()).values }, step1()));
    expect(stepCheck("review", s, config())).toEqual(server);
  });

  it("places each step's findings on that step and field, and sends the applicant to the first", () => {
    const s = heldState({ company: { ...heldState().company, registeredName: "" }, files: { "new:reg": [] }, statement: [] });
    expect(stepCheck("company", s, config())).toEqual([{ step: "company", field: "registeredName", level: "block", message: "Enter the company's registered name." }]);
    expect(stepCheck("documents", s, config()).filter((f) => f.level === "block").map((f) => f.field)).toEqual(expect.arrayContaining(["documents.new:reg.file"]));
    expect(stepCheck("epayment", s, config()).filter((f) => f.level === "block").map((f) => f.field)).toContain("creditor.statement");
    expect(firstFaultStep(stepCheck("review", s, config()))).toBe("company");
  });

  it("judges each held file by its type, the size and the quotas across the whole application", () => {
    const big = pdf("big.pdf", 6 * 1024 * 1024);
    const word: HeldFile = { name: "a.docx", size: 10, type: "application/msword" };
    const r = heldFileChecks(heldState({ files: { "new:reg": [big], "new:works": [word, pdf("ok.pdf")] } }), config());
    expect(r.faults.map((f) => f.field)).toEqual(["documents.new:reg.file", "documents.new:works.file"]);
    expect(r.counts).toEqual(new Map([["new:works", 1]]));
    expect(r.statementCount).toBe(1);
    // Four files in all: the fifth, the statement, is over the count.
    const many = heldFileChecks(heldState({ files: { "new:reg": [pdf("1.pdf"), pdf("2.pdf")], "new:works": [pdf("3.pdf"), pdf("4.pdf")] } }), config());
    expect(many.faults).toEqual([expect.objectContaining({ step: "epayment", field: "creditor.statement", level: "block" })]);
  });
});

describe("the review is the one registration summary (plan 4.2.3)", () => {
  it("names each code as code — name and each held file as not scanned, from what the page holds", () => {
    const sections = registrationSummary(summaryRecordOfHeld(heldSummaryState(heldState(), config()), { ...summaryListsOf(config()), types: config().context.types }), { day: (d) => d });
    const text = JSON.stringify(sections);
    expect(text).toContain("G1 — Grade 1");
    expect(text).toContain("registry.pdf (Not scanned)");
    expect(text).toContain("Private company");
    expect(text).not.toMatch(/demo_private|bank-a"/);
    expect(sections.find((s) => s.key === "declarations")!.empty).toBe("Nothing has been agreed yet. The agreements are made at Submit.");
  });
});

describe("every answer the route can give is read (step-2 notes)", () => {
  it("received, with its reference, or a dropped bot's", () => {
    expect(readReply(200, { ok: true, reference: "PA-1" })).toEqual({ kind: "ok", reference: "PA-1" });
    expect(readReply(200, { ok: true, reference: null })).toEqual({ kind: "ok", reference: null });
  });

  it("refused by the rules, by step and field, from the first judging or the one in the transaction", () => {
    const faults = [{ step: "review", field: "terms", level: "block", message: "Tick the box." }];
    expect(readReply(422, { ok: false, code: "VALIDATION", message: "Nothing was sent.", faults })).toEqual({ kind: "faults", faults, message: "Nothing was sent." });
  });

  it("out of date and not spent", () => {
    expect(readReply(400, { ok: false, code: "FORM_EXPIRED", message: "Out of date." }).kind).toBe("expired");
  });

  it("no answer, a server error (TRY_AGAIN is a 500) or a gateway's page: not known whether it landed", () => {
    expect(readReply(0, null).kind).toBe("uncertain");
    expect(readReply(500, { ok: false, code: "TRY_AGAIN", message: "Something went wrong." })).toEqual({ kind: "uncertain", message: "Something went wrong." });
    expect(readReply(502, null).kind).toBe("uncertain");
  });

  it("refused before or outside the rules, in the server's own words: closed, busy, too large, no length, unreadable, the boundary and the Origin guard", () => {
    expect(readReply(503, { ok: false, code: "CLOSED", message: "Not open." })).toEqual({ kind: "refused", message: "Not open." });
    expect(readReply(503, { ok: false, code: "BUSY", message: "Too many." })).toEqual({ kind: "refused", message: "Too many." });
    expect(readReply(413, { ok: false, code: "TOO_LARGE", message: "Too large." }).kind).toBe("refused");
    expect(readReply(411, { ok: false, code: "NO_LENGTH", message: "No size." }).kind).toBe("refused");
    expect(readReply(400, { ok: false, code: "UNREADABLE", message: "Unreadable." }).kind).toBe("refused");
    expect(readReply(403, { ok: false, code: "CROSS_SITE", message: "Refused.", error: "Refused." })).toEqual({ kind: "refused", message: "Refused." });
    expect(readReply(401, { ok: false, code: "NOT_SIGNED_IN", message: "Sign in." }).kind).toBe("refused");
    // The boundary's plain-text 404 is no JSON at all.
    expect(readReply(404, null)).toEqual({ kind: "refused", message: "Something went wrong. Nothing was sent. Try again in a few minutes." });
  });

  it("a code search's answer: the hits, or out of date; anything else throws", () => {
    const hit = { id: "v1", code: "G1", name: "Grade 1", kind: "GRADE", bodyId: "b" };
    expect(readValues(200, { ok: true, hits: [hit] })).toEqual({ hits: [hit] });
    expect(readValues(400, { ok: false, code: "FORM_EXPIRED", message: "x" })).toEqual({ expired: true });
    expect(() => readValues(400, { ok: false, code: "VALIDATION", message: "Type at least two characters." })).toThrow();
    expect(() => readValues(500, null)).toThrow();
  });
});

describe("the token: one visit, one application (ADR 0041 D8, plan 3.5)", () => {
  const NOW = Date.UTC(2026, 9, 22, 10, 0, 0);
  const fresh = tokenAt(NOW, "F".repeat(22));
  const transport = (replies: { status: number; body: unknown }[]) => {
    const sent: string[] = [];
    const t: Transport = {
      post: vi.fn(async (token: string) => {
        sent.push(token);
        return replies.shift() ?? { status: 0, body: null };
      }),
      freshToken: vi.fn(async () => fresh),
    };
    return { t, sent };
  };
  const send = (t: Transport, token: string, sentToken: string | null = null) => sendApplication({ token, sentToken, now: NOW, parts: () => [], transport: t, progress: () => undefined });

  it("a token is old an hour before the server would refuse it", () => {
    expect(tokenIsOld(tokenAt(NOW - TOKEN_REFRESH_AFTER_MS + 1000), NOW)).toBe(false);
    expect(tokenIsOld(tokenAt(NOW - TOKEN_REFRESH_AFTER_MS - 1000), NOW)).toBe(true);
    expect(tokenIsOld("garbage", NOW)).toBe(true);
  });

  it("swaps an old token never sent before sending it", async () => {
    const { t, sent } = transport([{ status: 200, body: { ok: true, reference: "PA-1" } }]);
    const r = await send(t, tokenAt(NOW - 23.5 * 3600_000));
    expect(sent).toEqual([fresh]);
    expect(r).toMatchObject({ outcome: { kind: "ok", reference: "PA-1" }, token: fresh, sentToken: null });
  });

  it("with no clear answer, sends again at once with the SAME token, and the server's stored reference is the answer", async () => {
    const mine = tokenAt(NOW - 1000);
    const { t, sent } = transport([{ status: 0, body: null }, { status: 200, body: { ok: true, reference: "PA-1" } }]);
    const r = await send(t, mine);
    expect(sent).toEqual([mine, mine]);
    expect(t.freshToken).not.toHaveBeenCalled();
    expect(r).toMatchObject({ outcome: { kind: "ok", reference: "PA-1" }, sentToken: null });
  });

  it("still no clear answer: the token stays awaiting, and the next Submit sends it again unchanged, however old it has become", async () => {
    const mine = tokenAt(NOW - 1000);
    const first = transport([{ status: 500, body: { ok: false, code: "TRY_AGAIN", message: "x" } }, { status: 0, body: null }]);
    const r1 = await send(first.t, mine);
    expect(r1).toMatchObject({ outcome: { kind: "uncertain" }, token: mine, sentToken: mine });
    // A day later the page's token is long out of date; it is sent as it is, never swapped first.
    const later = transport([{ status: 200, body: { ok: true, reference: "PA-1" } }]);
    const r2 = await sendApplication({ token: mine, sentToken: r1.sentToken, now: NOW + 30 * 3600_000, parts: () => [], transport: later.t, progress: () => undefined });
    expect(later.sent).toEqual([mine]);
    expect(later.t.freshToken).not.toHaveBeenCalled();
    expect(r2.outcome).toEqual({ kind: "ok", reference: "PA-1" });
  });

  it("out of date and not spent: a fresh token, sent once more; refused again, it says so", async () => {
    const mine = tokenAt(NOW - 1000);
    const ok = transport([{ status: 400, body: { ok: false, code: "FORM_EXPIRED", message: "x" } }, { status: 200, body: { ok: true, reference: "PA-2" } }]);
    expect(await send(ok.t, mine)).toMatchObject({ outcome: { kind: "ok", reference: "PA-2" }, token: fresh, sentToken: null });
    expect(ok.sent).toEqual([mine, fresh]);
    const twice = transport([{ status: 400, body: { ok: false, code: "FORM_EXPIRED", message: "x" } }, { status: 400, body: { ok: false, code: "FORM_EXPIRED", message: "Out of date." } }]);
    expect(await send(twice.t, mine)).toMatchObject({ outcome: { kind: "expired", message: "Out of date." }, sentToken: null });
    expect(twice.sent).toHaveLength(2);
  });

  it("a refusal that may have come before the token was read (busy) keeps a token still awaiting", async () => {
    const mine = tokenAt(NOW - 1000);
    const { t } = transport([{ status: 503, body: { ok: false, code: "BUSY", message: "Too many." } }]);
    expect(await send(t, mine, mine)).toMatchObject({ outcome: { kind: "refused" }, sentToken: mine });
  });

  it("no clear answer, then busy (which may come before the token is read): the token stays awaiting and is never swapped next time (review, must 1a)", async () => {
    const mine = tokenAt(NOW - 1000);
    const { t, sent } = transport([{ status: 0, body: null }, { status: 503, body: { ok: false, code: "BUSY", message: "Too many." } }]);
    const r = await send(t, mine);
    expect(sent).toEqual([mine, mine]);
    expect(r).toMatchObject({ outcome: { kind: "refused" }, token: mine, sentToken: mine });
    const later = transport([{ status: 200, body: { ok: true, reference: "PA-1" } }]);
    await sendApplication({ token: r.token, sentToken: r.sentToken, now: NOW + 30 * 3600_000, parts: () => [], transport: later.t, progress: () => undefined });
    expect(later.sent).toEqual([mine]);
    expect(later.t.freshToken).not.toHaveBeenCalled();
  });

  it("an awaiting token out of date, its fresh one unclear, then busy: the FRESH one is what awaits now (review, must 1b)", async () => {
    const old = tokenAt(NOW - 25 * 3600_000);
    const { t, sent } = transport([
      { status: 400, body: { ok: false, code: "FORM_EXPIRED", message: "x" } },
      { status: 0, body: null },
      { status: 503, body: { ok: false, code: "BUSY", message: "Too many." } },
    ]);
    const r = await send(t, old, old);
    expect(sent).toEqual([old, fresh, fresh]);
    expect(r).toMatchObject({ outcome: { kind: "refused" }, token: fresh, sentToken: fresh });
  });

  it("the rules' refusal settles it: the token was not spent", async () => {
    const mine = tokenAt(NOW - 1000);
    const { t } = transport([{ status: 422, body: { ok: false, code: "VALIDATION", message: "x", faults: [] } }]);
    expect(await send(t, mine, mine)).toMatchObject({ outcome: { kind: "faults" }, sentToken: null });
  });
});
