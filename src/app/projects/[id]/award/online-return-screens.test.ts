import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { awardOnlineReturn: { findFirst: async () => ({ icNumber: "900101-14-5678" }) } } }));
vi.mock("@/app/awards/editors", () => ({ AnswerQueryDrawer: () => h("button", null, "Answer") }));

import type { Sulit } from "@/lib/auth/sulit-access";
import type { LoadedAward } from "@/lib/award/repo";
import { OnlineReturnCard } from "./online-return-card";
import { QueriesCard } from "./queries-card";

const granted: Sulit<true> = { state: "GRANTED", value: true, basis: "NAMED_ON_RECORD" };
const withheld: Sulit<true> = { state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED", scope: "exercise", words: { en: "Not named." } };
const file = { id: "f1", purpose: "ACCEPTANCE_PAGE", versionId: "v1", detachedAt: null, version: { originalFilename: "page.pdf", byteSize: 1, withdrawnAt: null, documentId: "d1" } };
const ret = (o: object = {}) => ({ id: "r1", submittedAt: new Date("2026-10-20T01:00:00Z"), submittedOn: new Date("2026-10-20T00:00:00Z"), submittedBySupplierAccount: { contact: { name: "Lim Wei" } }, signatoryName: "Lim Wei", occupation: "Director", address: "1 Jalan", capacity: "Director", witnessName: "Aini", contractorSigned: true, stampAffixed: true, witnessSigned: false, verifiedAt: null, verifiedBy: null, refusedAt: null, refusedBy: null, refusedReason: null, files: [file], ...o });
const loaded = (onlineReturns: object[], queries: object[] = [], kind = "WORK_INDENT") => ({ org: { id: "o1", timeZone: "Asia/Kuala_Lumpur" }, award: { instrumentKind: kind, onlineReturns, queries } }) as unknown as LoadedAward;
const facts = (state: "WAITING" | "VERIFIED" | "REFUSED") => ({ state, latest: "r1", verify: { offered: false, blocker: null }, refuse: false }) as const;
const render = async (sulit: Sulit<true>, l: LoadedAward, f: ReturnType<typeof facts>, told: string | null = null) => renderToStaticMarkup(await OnlineReturnCard({ sulit, l, facts: f, nobodyTold: told }));

describe("the Sent online card", () => {
  it("shows who sent it, the day, the typed page and the files to open", async () => {
    const out = await render(granted, loaded([ret()]), facts("WAITING"));
    for (const t of ["Sent online", "Lim Wei", "Waiting to be verified", "Director", "Acceptance page", "page.pdf", "/api/documents/versions/v1"]) expect(out).toContain(t);
  });

  it("reads the identity card number only for a reader the gate grants; otherwise it is withheld and the number is not in the page", async () => {
    expect(await render(granted, loaded([ret()]), facts("WAITING"))).toContain("900101-14-5678");
    const out = await render(withheld, loaded([ret()]), facts("WAITING"));
    expect(out).not.toContain("900101-14-5678");
    expect(out).toContain("Not named.");
  });

  it("a Letter of Acceptance has no typed page", async () => {
    const out = await render(granted, loaded([ret()], [], "LETTER_OF_ACCEPTANCE"), facts("WAITING"));
    expect(out).not.toContain("Identity card number");
  });

  it("has no Verify or Refuse of its own (the header holds them), and says why a refused return was refused", async () => {
    const out = await render(granted, loaded([ret({ refusedAt: new Date("2026-10-21T01:00:00Z"), refusedBy: { name: "Officer Tan" }, refusedReason: "The stamp is missing." })]), facts("REFUSED"));
    expect(out).not.toMatch(/Verify the return|Refuse the return|<button/);
    expect(out).toContain("Officer Tan");
    expect(out).toContain("The stamp is missing.");
  });

  it("says nobody is told when no recipient resolved", async () => {
    expect(await render(granted, loaded([ret()]), facts("WAITING"), "No notification rule names who is told.")).toContain("No notification rule names who is told.");
    expect(await render(granted, loaded([ret()]), facts("WAITING"))).not.toContain("No notification rule names");
  });
});

describe("the Questions card", () => {
  const q = (o: object) => ({ id: "q1", body: "When do we start?", askedAt: new Date("2026-10-20T01:00:00Z"), askedBySupplierAccount: { contact: { name: "Lim Wei" } }, answer: null, answeredAt: null, answeredBy: null, ...o });
  it("draws nothing without questions", () => {
    expect(renderToStaticMarkup(h(QueriesCard, { l: loaded([]), nobodyTold: null }))).toBe("");
  });
  it("offers Answer on an unanswered question and shows an answer given", () => {
    const open = renderToStaticMarkup(h(QueriesCard, { l: loaded([], [q({})]), nobodyTold: "No notification rule names who is told." }));
    expect(open).toContain("When do we start?");
    expect(open).toContain("Answer");
    expect(open).toContain("1 unanswered");
    expect(open).toContain("No notification rule names who is told.");
    const done = renderToStaticMarkup(h(QueriesCard, { l: loaded([], [q({ answer: "On Monday.", answeredAt: new Date("2026-10-21T01:00:00Z"), answeredBy: { name: "Officer Tan" } })]), nobodyTold: null }));
    expect(done).toContain("On Monday.");
    expect(done).toContain("Officer Tan");
    expect(done).not.toContain("<button");
  });
});

describe("where the actions sit (source scan)", () => {
  const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
  it("Verify is the header's fallback action; Refuse and the blocked Cancel are in the menu", () => {
    const view = read("award-view.tsx");
    expect(view).toContain("VerifyOnlineReturnDrawer");
    expect(view).toMatch(/verifyReturn \? \(\s*verifyReturn/);
    expect(view).toMatch(/RefuseOnlineReturnDrawer menu/);
    expect(view).toMatch(/CancelAwardDrawer menu[^>]*waiting=\{waitingDay\}/);
  });
  it("the Return panel offers no paper recording while a return waits", () => {
    expect(read("return-panel.tsx")).toContain('onlineReturnState(award.onlineReturns) !== "WAITING"');
  });
});
