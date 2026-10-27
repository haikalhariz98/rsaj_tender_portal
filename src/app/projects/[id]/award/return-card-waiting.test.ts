import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/attribution-read", () => ({ loadAttributions: async () => ({ read: (_q: unknown, name: string) => ({ en: name }) }) }));
vi.mock("@/app/awards/editors", () => ({ ReturnDrawer: () => h("button", null, "Record the return") }));

import type { Sulit } from "@/lib/auth/sulit-access";
import type { LoadedAward } from "@/lib/award/repo";
import type { ReturnRecord } from "@/lib/award/stage-two";
import { ReturnRecordCard } from "./return-panel";

// Phase 0.2 item 5: while a return sent online waits, the paper acceptance page is not recorded (WV-4), so its card is one line, not ten "Not recorded".
const granted: Sulit<true> = { state: "GRANTED", value: true, basis: "NAMED_ON_RECORD" };
const ret = { signedLetterReceivedOn: null, declarationReceivedOn: null, authorisationReceivedOn: null, signatoryName: "", icNumber: "", occupation: "", address: "", capacity: "", contractorSigned: null, stampAffixed: null, witnessName: "", witnessSigned: null } as unknown as ReturnRecord;
const loaded = (onlineReturns: object[]) =>
  ({ org: { id: "o1", timeZone: "Asia/Kuala_Lumpur" }, award: { id: "a1", status: "ISSUED", instrumentKind: "WORK_INDENT", onlineReturns, attachments: [], returnScanSnapshot: null, awardReturn: { id: "ar1", receivedBy: null, receivedByPersonId: null, whereHeld: "" } } }) as unknown as LoadedAward;
const waiting = { submittedAt: new Date("2026-10-20T01:00:00Z"), verifiedAt: null, refusedAt: null };
const render = async (rows: object[]) => renderToStaticMarkup(await ReturnRecordCard({ sulit: granted, l: loaded(rows), ret, people: [] }));

describe("the paper acceptance card", () => {
  it("is one line while a return sent online waits", async () => {
    const out = await render([waiting]);
    expect(out).toContain("Waiting on the return sent online.");
    expect(out).not.toContain("Not recorded");
    expect(out).not.toContain("Record the return");
  });
  it("keeps every field when there is no online return", async () => {
    const out = await render([]);
    expect(out).not.toContain("Waiting on the return sent online.");
    expect(out).toContain("Contractor&#x27;s signatory");
    expect(out).toContain("Not recorded");
  });
});
