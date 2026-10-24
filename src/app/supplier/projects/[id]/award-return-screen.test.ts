import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { parseSubmitBody } from "@/lib/award/online-return-api";
import type { AwardCardView } from "@/lib/portal/projects/award-card";

vi.mock("./award-return-drawer", () => ({
  AcceptDrawer: ({ form }: { form: { resend: boolean } }) => h("button", null, form.resend ? "Send again" : "Accept"),
  AskQuestionDrawer: () => h("button", null, "Ask a question"),
}));

import { AwardQuestionsCard, AwardReturnCard } from "./award-return-card";

const FORM = { scans: [{ key: "ACCEPTANCE_PAGE", label: "Acceptance page" }], isIndent: true, signatories: [], defaultSignatoryId: "", address: "", resend: false };
const view = (o: Partial<AwardCardView> = {}): AwardCardView => ({
  contractId: "c1",
  instrumentLabel: "Work indent and appointment letter",
  title: "Accept the award",
  issuedOn: "2026-10-20",
  commitment: null,
  validUntil: null,
  state: "NONE",
  sentOn: null,
  acceptedOn: null,
  refusedReason: null,
  showAccept: true,
  action: "ACCEPT",
  form: FORM,
  mayAsk: true,
  queries: [],
  ...o,
});
const card = (o: Partial<AwardCardView> = {}, token: string | null = "tok") => renderToStaticMarkup(h(AwardReturnCard, { view: view(o), token }));
const questions = (o: Partial<AwardCardView> = {}) => renderToStaticMarkup(h(AwardQuestionsCard, { view: view(o), token: "tok" }));

describe("the Accept the award card", () => {
  it("shows what was issued and the one primary action", () => {
    const html = card();
    expect(html).toContain("Accept the award");
    expect(html).toContain("Work indent and appointment letter");
    expect(html).toContain("20 Oct 2026");
    expect(html).toContain(">Accept<");
    expect(html).not.toContain("Return the signed documents on paper");
  });

  it("names the purchase order or the indent only when one is recorded", () => {
    expect(card({ commitment: "Purchase order PO-77" })).toContain("Purchase order PO-77");
    expect(card({ commitment: "Indent IN-5", validUntil: "2026-11-03" })).toMatch(/Indent IN-5[\s\S]*Valid until[\s\S]*3 Nov 2026/);
    expect(card()).not.toMatch(/Purchase order|Indent |Finance reference|Valid until/);
  });

  it("waiting, refused and accepted each read as a state line", () => {
    expect(card({ state: "WAITING", action: "NONE", form: null, sentOn: "2026-10-22" })).toContain("Sent 22 Oct 2026 · Being checked");
    const refused = card({ state: "REFUSED", refusedReason: "The stamp is missing.", form: { ...FORM, resend: true } });
    expect(refused).toContain("Returned");
    expect(refused).toContain("The stamp is missing.");
    expect(refused).toContain(">Send again<");
    const done = card({ state: "VERIFIED", action: "NONE", form: null, acceptedOn: "2026-10-23", title: "Award accepted" });
    expect(done).toContain("Accepted 23 Oct 2026");
    expect(done).not.toMatch(/>Accept<|Send again/);
  });

  it("on the organisation's side, the contractor is told to return on paper and no setting is named", () => {
    const html = card({ action: "PAPER", form: null });
    expect(html).toContain("Return the signed documents on paper.");
    const text = html.replace(/<[^>]*>/g, " ");
    expect(html).not.toContain(">Accept<");
    expect(text).not.toMatch(/portal signing|switch|class|time zone|[A-Z]{2,}_[A-Z_]+/i);
  });

  it("an account that may not sign has no Accept button and is told who can", () => {
    const html = card({ action: "NOT_SIGNER", form: null });
    expect(html).not.toMatch(/>Accept<|Send again/);
    expect(html).toContain("Only someone who may sign for your company can accept the award. The office sets who.");
  });

  it("with no form key the button is blocked and says so", () => {
    const html = card({}, null);
    expect(html).toContain("Sending is closed.");
    expect(html).toContain("disabled");
  });

  it("never carries an identity card number (the view has no field for one)", () => {
    expect(card({ state: "WAITING", action: "NONE", form: null, sentOn: "2026-10-22" })).not.toMatch(/\d{6}-\d{2}-\d{4}|IC number/);
  });
});

describe("the Questions card", () => {
  it("lists a question with its answer or a wait, and offers Ask while issued", () => {
    const html = questions({
      queries: [
        { id: "q1", body: "When can we start?", askedOn: "2026-10-21", answer: "On Monday.", answeredOn: "2026-10-22" },
        { id: "q2", body: "Is a bond needed?", askedOn: "2026-10-23", answer: null, answeredOn: null },
      ],
    });
    for (const t of ["When can we start?", "On Monday.", "22 Oct 2026", "Is a bond needed?", "Waiting for an answer", "Ask a question"]) expect(html).toContain(t);
  });

  it("is empty-stated, and after acceptance answers still read but nothing can be asked", () => {
    expect(questions()).toContain("No questions yet");
    const closed = questions({ mayAsk: false, queries: [{ id: "q1", body: "Q", askedOn: "2026-10-21", answer: "A", answeredOn: "2026-10-22" }] });
    expect(closed).not.toContain("Ask a question");
    expect(closed).toContain(">A<");
  });
});

describe("the signatory's error (Wave V review)", () => {
  it("is read under the key the parser writes it to", () => {
    const parsed = parseSubmitBody({ contractId: "c1", files: { ACCEPTANCE_PAGE: "v1" }, page: { signatoryContactId: "" }, password: "x" });
    expect(parsed.ok || Object.keys(parsed.errors)).toContain("page.signatoryContactId");
    expect(readFileSync(join(__dirname, "award-return-drawer.tsx"), "utf8")).toContain(`error={errors["page.signatoryContactId"]}`);
  });
});
