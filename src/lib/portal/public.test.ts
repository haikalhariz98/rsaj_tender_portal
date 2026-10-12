import { describe, expect, it } from "vitest";

import { EXERCISE_STATUSES, type ExerciseStatus } from "@/lib/method/types";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { OPPORTUNITY_SELECT } from "./select";
import { isPublicOpportunity, opportunityState, toPublicOpportunity, type OpportunityRow, type PublicFacts } from "./public";

const NOW = new Date("2026-10-06T04:00:00.000Z");
const CLOSING = new Date("2026-10-15T07:00:00.000Z");
const PUBLISHED = new Date("2026-09-21T01:00:00.000Z");

type Path = "ADVERTISED" | "INVITED" | "NONE";
const facts = (status: ExerciseStatus, path: Path, o: { published?: boolean; restricted?: boolean; closingAt?: Date | null } = {}): PublicFacts => ({
  status,
  restricted: o.restricted ?? false,
  closingAt: o.closingAt === undefined ? CLOSING : o.closingAt,
  window: path === "NONE" ? null : { path, publishedAt: o.published === false ? null : PUBLISHED },
});

/// The statuses an advertised exercise can be public in; a cancelled one is public only once published.
const PUBLIC_WHEN_ADVERTISED: ReadonlySet<ExerciseStatus> = new Set(["ADVERTISED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED", "CANCELLED"]);

describe("isPublicOpportunity: every status, every path, every flag", () => {
  for (const status of EXERCISE_STATUSES) {
    for (const path of ["ADVERTISED", "INVITED", "NONE"] as const) {
      for (const published of [true, false]) {
        for (const restricted of [false, true]) {
          for (const restrictedTender of [false, true]) {
            const expected = path === "ADVERTISED" && published && !restricted && PUBLIC_WHEN_ADVERTISED.has(status);
            it(`${status} · ${path} · ${published ? "published" : "unpublished"} · ${restricted ? "confidential" : "not confidential"} · bidder restriction ${restrictedTender} -> ${expected}`, () => {
              // The bidder restriction is not an input to the rule: it never hides an exercise.
              expect(isPublicOpportunity(facts(status, path, { published, restricted }))).toBe(expected);
            });
          }
        }
      }
    }
  }
  it("an advertised exercise with no closing is not listed (it cannot be shown honestly)", () => {
    expect(isPublicOpportunity(facts("ADVERTISED", "ADVERTISED", { closingAt: null }))).toBe(false);
  });
  it("a cancelled exercise needs no closing, but needs the publication", () => {
    expect(isPublicOpportunity(facts("CANCELLED", "ADVERTISED", { closingAt: null }))).toBe(true);
    expect(isPublicOpportunity(facts("CANCELLED", "ADVERTISED", { published: false }))).toBe(false);
    expect(isPublicOpportunity(facts("CANCELLED", "INVITED"))).toBe(false);
    expect(isPublicOpportunity(facts("CANCELLED", "NONE"))).toBe(false);
  });
  it("the method's flags are not consulted: no window, not public, however it would have been run", () => {
    expect(isPublicOpportunity(facts("ADVERTISED", "NONE"))).toBe(false);
  });
});

describe("opportunityState", () => {
  it("open before the closing, closed from the closing instant on", () => {
    expect(opportunityState({ status: "ADVERTISED", closingAt: CLOSING }, false, NOW)).toBe("OPEN");
    expect(opportunityState({ status: "ADVERTISED", closingAt: CLOSING }, false, CLOSING)).toBe("CLOSED");
  });
  it("every stage after the closing reads as Closed: the opening and the evaluation are not public", () => {
    for (const status of ["OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED"] as const) {
      expect(opportunityState({ status, closingAt: new Date("2026-10-01T07:00:00Z") }, false, NOW)).toBe("CLOSED");
    }
  });
  it("cancelled wins; an issued award moves it to Awarded", () => {
    expect(opportunityState({ status: "CANCELLED", closingAt: CLOSING }, true, NOW)).toBe("CANCELLED");
    expect(opportunityState({ status: "EVALUATED", closingAt: new Date("2026-10-01T07:00:00Z") }, true, NOW)).toBe("AWARDED");
  });
});

const row = (o: Partial<OpportunityRow> = {}): OpportunityRow => ({
  id: "x1",
  reference: "REF/0018",
  title: "Pipe bridge repainting",
  status: "ADVERTISED",
  restricted: false,
  restrictedTender: false,
  closingAt: CLOSING,
  // SR-10 (ruling 16): the counter sale, which states a place, hours and a payment counter; an online one does not.
  saleMode: "COUNTER",
  sourcingMethodCode: "open_quotation",
  awards: [],
  registrationRequirements: [
    { bodyLabelSnapshot: "the Demo Companies Registry", qualifiers: "", alternativeGroup: 1, sortOrder: 0 },
    { bodyLabelSnapshot: "the Demo Contractors Board", qualifiers: "grade D2", alternativeGroup: 2, sortOrder: 0 },
  ],
  window: {
    path: "ADVERTISED",
    publishedAt: PUBLISHED,
    policySnapshot: { attendance: { mandatoryPermitted: true } },
    purchaseFromDay: new Date("2026-09-21T00:00:00.000Z"),
    purchaseCloseDay: new Date("2026-10-13T00:00:00.000Z"),
    purchasePlace: "Northern Region office",
    inspectionPlace: "Northern Region office",
    inspectionHours: "9am to 4pm",
    feeAmount: { toString: () => "60.00" },
    feePaymentMethods: "Cash",
    submissionPlace: "Tender box",
    noticeText: "NOTICE",
    events: [
      { kind: "SITE_VISIT", startsAt: new Date("2026-10-09T02:00:00Z"), place: "Site", mandatory: true, cancelledAt: null },
      { kind: "BRIEFING", startsAt: new Date("2026-10-07T02:00:00Z"), place: "Office", mandatory: false, cancelledAt: null },
    ],
    addenda: [
      { number: 2, title: "Second", whatChanged: "Later", issuedOn: new Date("2026-10-03T00:00:00Z"), closingChange: { toClosingAt: new Date("2026-10-20T07:00:00Z"), appliedAt: null } },
      { number: 1, title: "First", whatChanged: "Earlier", issuedOn: new Date("2026-10-01T00:00:00Z"), closingChange: { toClosingAt: new Date("2026-10-18T07:00:00Z"), appliedAt: new Date("2026-10-01T05:00:00Z") } },
    ],
    cancellations: [],
  },
  ...o,
});
const ctx = { now: NOW, timeZone: "Asia/Kuala_Lumpur", methodNames: new Map([["open_quotation", "Open quotation"]]), restrictionLabel: "Restricted to bidders on the demo priority register" };

describe("toPublicOpportunity", () => {
  it("is null for an exercise that is not public", () => {
    expect(toPublicOpportunity(row({ window: { ...row().window!, path: "INVITED" } }), ctx)).toBeNull();
    expect(toPublicOpportunity(row({ restricted: true }), ctx)).toBeNull();
    expect(toPublicOpportunity(row({ status: "INVITED" }), ctx)).toBeNull();
    expect(toPublicOpportunity(row({ window: null }), ctx)).toBeNull();
  });
  it("states the closing in the organisation's time, the fee as money, the method by its configured name", () => {
    const p = toPublicOpportunity(row(), ctx)!;
    expect(p.closing).toBe("15 Oct 2026 · 15:00");
    expect(p.detail!.sale.fee).toBe("RM60");
    expect(p.method).toBe("Open quotation");
    expect(p.state).toBe("OPEN");
    expect(p.detail!.sale.state).toBe("OPEN");
    expect(p.detail!.sale.until).toBe("13 October 2026");
  });
  it("with no time zone set the closing is said to be UTC, not passed off as local", () => {
    expect(toPublicOpportunity(row(), { ...ctx, timeZone: null })!.closing).toBe("15 Oct 2026 · 07:00 UTC");
  });
  it("says the fee is not stated rather than showing zero", () => {
    const base = row();
    expect(toPublicOpportunity({ ...base, window: { ...base.window!, feeAmount: null } }, ctx)!.detail!.sale.fee).toBeNull();
  });
  it("lists registrations by group, with the configured label capitalised and its qualifiers", () => {
    expect(toPublicOpportunity(row(), ctx)!.detail!.registrations).toEqual([["The Demo Companies Registry"], ["The Demo Contractors Board (grade D2)"]]);
  });
  it("orders events by time and takes 'mandatory' from the policy the notice was published under", () => {
    const e = toPublicOpportunity(row(), ctx)!.detail!.events;
    expect(e.map((x) => x.kind)).toEqual(["BRIEFING", "SITE_VISIT"]);
    expect(e.map((x) => x.mandatory)).toEqual([false, true]);
    const base = row();
    const unrecorded = toPublicOpportunity({ ...base, window: { ...base.window!, policySnapshot: {} } }, ctx)!;
    expect(unrecorded.detail!.events.every((x) => !x.mandatory)).toBe(true);
    const notPermitted = toPublicOpportunity({ ...base, window: { ...base.window!, policySnapshot: { attendance: { mandatoryPermitted: false } } } }, ctx)!;
    expect(notPermitted.detail!.events.every((x) => !x.mandatory)).toBe(true);
  });
  it("a cancelled event is kept and marked, never mandatory", () => {
    const base = row();
    const p = toPublicOpportunity({ ...base, window: { ...base.window!, events: [{ kind: "SITE_VISIT", startsAt: new Date("2026-10-09T02:00:00Z"), place: "Site", mandatory: true, cancelledAt: new Date("2026-10-05T00:00:00Z") }] } }, ctx)!;
    expect(p.detail!.events).toEqual([expect.objectContaining({ cancelled: true, mandatory: false })]);
  });
  it("addenda in number order; a new closing only once it was applied", () => {
    const a = toPublicOpportunity(row(), ctx)!.detail!.addenda;
    expect(a.map((x) => x.number)).toEqual([1, 2]);
    expect(a[0].newClosing).toBe("18 Oct 2026 · 15:00");
    expect(a[1].newClosing).toBeNull();
  });
  it("a bidder restriction is shown in the organisation's words, and never hides the exercise", () => {
    const p = toPublicOpportunity(row({ restrictedTender: true }), ctx)!;
    expect(p.detail!.restriction).toEqual({ stated: true, label: "Restricted to bidders on the demo priority register" });
    expect(toPublicOpportunity(row({ restrictedTender: true }), { ...ctx, restrictionLabel: null })!.detail!.restriction).toEqual({ stated: true, label: null });
    expect(toPublicOpportunity(row({ restrictedTender: false }), ctx)!.detail!.restriction).toBeNull();
  });
  it("a cancelled exercise is shown only as cancelled: no fee, notice, events or addenda", () => {
    const base = row();
    const p = toPublicOpportunity(row({ status: "CANCELLED", window: { ...base.window!, cancellations: [{ appliedAt: new Date("2026-10-04T05:00:00Z") }] } }), ctx)!;
    expect(p.state).toBe("CANCELLED");
    expect(p.detail).toBeNull();
    expect(p.closing).toBeNull();
    expect(p.cancelledOn).toBe("4 October 2026");
    expect(JSON.stringify(p)).not.toContain("NOTICE");
  });
  it("a cancelled exercise that was never published stays hidden", () => {
    const base = row();
    expect(toPublicOpportunity(row({ status: "CANCELLED", window: { ...base.window!, publishedAt: null } }), ctx)).toBeNull();
  });
  it("an issued award moves it out of Open", () => {
    expect(toPublicOpportunity(row({ awards: [{ status: "DRAFT" }] }), ctx)!.state).toBe("OPEN");
    expect(toPublicOpportunity(row({ awards: [{ status: "ISSUED" }] }), ctx)!.state).toBe("AWARDED");
  });
  it("the projection is plain data: strings, numbers, flags, no dates or decimals", () => {
    const walk = (v: unknown): void => {
      if (v == null) return;
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v === "object") return Object.values(v).forEach(walk);
      expect(["string", "number", "boolean"]).toContain(typeof v);
    };
    walk(toPublicOpportunity(row({ restrictedTender: true }), ctx));
  });
});

/// Every key name in a Prisma select, however deep.
const keysIn = (select: unknown): string[] => {
  if (!select || typeof select !== "object") return [];
  return Object.entries(select as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysIn(v)]);
};

describe("the one read behind the public pages", () => {
  const keys = keysIn(OPPORTUNITY_SELECT);
  it("names no SULIT field", () => {
    for (const f of SULIT_FIELDS) expect(keys, f.field).not.toContain(f.field);
  });
  it("names no private relation or field: estimate, scope, parties, sales, letters, recipients, attendance, officers, dossier, evaluation", () => {
    for (const k of [
      "estimatedValue", "scopeParts", "amount", "parties", "sales", "letters", "recipients", "attendance", "personInCharge", "personInChargeId", "dossierReference", "justificationText", "evidenceNote", "proposalRecord",
      "classificationSnapshot", "bandSnapshot", "approvalInstances", "committeeDecisions", "evaluation", "envelopes", "bids", "requisition", "recordedBy", "notes", "cancelReason", "reason", "recipients", "attachments", "renderedText", "bidValidityDays", "approvedForTenderingAt",
    ]) {
      expect(keys, k).not.toContain(k);
    }
  });
  it("takes an award's status and nothing else about it, and only issued addenda", () => {
    expect((OPPORTUNITY_SELECT.awards as { select: object }).select).toEqual({ status: true });
    expect(OPPORTUNITY_SELECT.window.select.addenda.where).toEqual({ status: "ISSUED" });
  });
});

describe("SR-10 (ruling 16): an exercise sold online states no counter", () => {
  const ctx = { now: NOW, timeZone: "Asia/Kuala_Lumpur", methodNames: new Map(), restrictionLabel: null };
  it("withholds the place, the hours and how to pay, whatever an earlier record holds, and says it is online", () => {
    const online = toPublicOpportunity(row({ saleMode: "ONLINE" }), ctx);
    const d = online && "detail" in online ? online.detail : null;
    expect(d?.sale).toMatchObject({ online: true, place: "", payment: "", inspectionPlace: "", inspectionHours: "", submissionPlace: "" });
    const counter = toPublicOpportunity(row({ saleMode: "COUNTER" }), ctx);
    const c = counter && "detail" in counter ? counter.detail : null;
    expect(c?.sale.online).toBe(false);
    expect(c?.sale.place).not.toBe("");
  });
});
