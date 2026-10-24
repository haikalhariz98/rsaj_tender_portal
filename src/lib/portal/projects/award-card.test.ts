import { describe, expect, it } from "vitest";

import { acceptGate, awardCardView, commitmentLine, expiredLine, toAccept, type AwardCardInput } from "./award-card";

const open = { classSet: true, today: "2026-10-24", paperStarted: false, signingFault: null as string | null };
const input = (o: Partial<AwardCardInput> = {}): AwardCardInput => ({
  contractId: "c1",
  awardStatus: "ISSUED",
  instrument: "WORK_INDENT",
  issuedOn: "2026-10-20",
  commitment: { kind: null, number: null },
  validUntil: null,
  indentExpired: false,
  state: "NONE",
  sentOn: null,
  acceptedOn: null,
  refusedReason: "",
  gate: open,
  signatories: [{ id: "k1", name: "Aminah", designation: "Director" }, { id: "k2", name: "Hassan", designation: "Manager" }],
  signedInContactId: "k2",
  address: "1 Jalan Satu",
  queries: [],
  ...o,
});

describe("the gate on Accept", () => {
  it("is open when nothing stands in the way", () => expect(acceptGate(open)).toBe("OPEN"));
  it("is paper for every reason on the organisation's side", () => {
    for (const f of [{ signingFault: "PORTAL_SIGNING_NOT_SET" }, { signingFault: "PORTAL_SIGNING_OFF" }, { classSet: false }, { today: null }, { paperStarted: true }]) expect(acceptGate({ ...open, ...f })).toBe("PAPER");
  });
  it("is not-a-signer for this contact's own mark, and paper still wins over it", () => {
    expect(acceptGate({ ...open, signingFault: "SIGNER_NOT_AUTHORISED" })).toBe("NOT_SIGNER");
    expect(acceptGate({ ...open, signingFault: "SIGNER_NOT_AUTHORISED_NOT_SET" })).toBe("NOT_SIGNER");
    expect(acceptGate({ ...open, classSet: false, signingFault: "SIGNER_NOT_AUTHORISED" })).toBe("PAPER");
  });
});

describe("what waits for the contractor to accept", () => {
  it("an issued award with nothing waiting and nothing accepted", () => {
    expect(toAccept("ISSUED", "NONE")).toBe(true);
    expect(toAccept("ISSUED", "REFUSED")).toBe(true);
    expect(toAccept("ISSUED", "WAITING")).toBe(false);
    expect(toAccept("ISSUED", "VERIFIED")).toBe(false);
    expect(toAccept("ACCEPTED", "NONE")).toBe(false);
  });
});

describe("the commitment line", () => {
  it("names the kind in the portal's words, and is absent until a number is recorded", () => {
    expect(commitmentLine("PURCHASE_ORDER", "PO-77")).toBe("Purchase order PO-77");
    expect(commitmentLine("INDENT", "IN-5")).toBe("Indent IN-5");
    expect(commitmentLine("PURCHASE_ORDER", null)).toBeNull();
    expect(commitmentLine(null, "")).toBeNull();
  });
});

describe("the card's view", () => {
  it("an indent offers Accept with the signed-in contact as default and the acceptance page", () => {
    const v = awardCardView(input())!;
    expect(v.action).toBe("ACCEPT");
    expect(v.form).toMatchObject({ isIndent: true, defaultSignatoryId: "k2", address: "1 Jalan Satu", resend: false, scans: [{ key: "ACCEPTANCE_PAGE", label: "Acceptance page" }] });
    expect(v.mayAsk).toBe(true);
  });

  it("a Letter of Acceptance asks for its three scans and no page", () => {
    const v = awardCardView(input({ instrument: "LETTER_OF_ACCEPTANCE", validUntil: "2026-11-03" }))!;
    expect(v.form?.isIndent).toBe(false);
    expect(v.form?.scans.map((s) => s.key)).toEqual(["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"]);
    expect(v.validUntil).toBeNull();
  });

  it("a refused return can be sent again, with the officer's reason", () => {
    const v = awardCardView(input({ state: "REFUSED", refusedReason: " The stamp is missing. " }))!;
    expect(v.action).toBe("ACCEPT");
    expect(v.form?.resend).toBe(true);
    expect(v.refusedReason).toBe("The stamp is missing.");
  });

  it("a waiting or accepted return offers nothing", () => {
    expect(awardCardView(input({ state: "WAITING", sentOn: "2026-10-22" }))).toMatchObject({ action: "NONE", form: null, sentOn: "2026-10-22" });
    expect(awardCardView(input({ awardStatus: "ACCEPTED", state: "VERIFIED", acceptedOn: "2026-10-23" }))).toMatchObject({ action: "NONE", showAccept: true, title: "Award accepted", mayAsk: false });
  });

  it("an expired indent offers no Accept, online or on paper, and says when it expired (FR-AWD-006)", () => {
    const v = awardCardView(input({ validUntil: "2026-10-20", indentExpired: true }))!;
    expect(v).toMatchObject({ action: "EXPIRED", form: null, validUntil: "2026-10-20" });
    expect(expiredLine(v.validUntil!)).toBe("The indent expired on 20 Oct 2026.");
    expect(awardCardView(input({ validUntil: "2026-10-20", indentExpired: true, gate: { ...open, classSet: false } }))).toMatchObject({ action: "EXPIRED" });
    // A return already waiting or accepted is not undone by the indent's expiry.
    expect(awardCardView(input({ indentExpired: true, state: "WAITING", sentOn: "2026-10-19" }))).toMatchObject({ action: "NONE" });
  });

  it("paper and not-a-signer draw no form", () => {
    expect(awardCardView(input({ gate: { ...open, classSet: false } }))).toMatchObject({ action: "PAPER", form: null });
    expect(awardCardView(input({ gate: { ...open, signingFault: "SIGNER_NOT_AUTHORISED" } }))).toMatchObject({ action: "NOT_SIGNER", form: null });
  });

  it("an award that is neither issued nor accepted online shows nothing, unless there are questions", () => {
    expect(awardCardView(input({ awardStatus: "ACCEPTED" }))).toBeNull();
    const q = { id: "q1", body: "When?", askedOn: "2026-10-21", answer: "Monday.", answeredOn: "2026-10-22" };
    expect(awardCardView(input({ awardStatus: "ACCEPTED", queries: [q] }))).toMatchObject({ showAccept: false, mayAsk: false, queries: [q] });
  });
});
