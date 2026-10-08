import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decidingDelegates, myStepsOf, officeQueue, type QueueStep } from "./queue";
import { BARRED_WORDS, requesterRelation, routeBarred, routeRequesterId, routeSenderBarredId, type RequesterRouteKind } from "./requester";

const ALL: readonly RequesterRouteKind[] = ["REQUISITION", "NAME_APPROVAL", "APPOINTMENT", "CERTIFICATE", "VARIATION", "CONTRACT_MATTER", "SUPPLIER_APPLICATION", "STANDING_REQUEST", "SPECIAL_PERMISSION"];
const facts = { requisitionRaiserId: "raiser", routeSenderId: "sender", applicationSenderId: "applicant", requestRaiserId: "requester" };

describe("whom a route bars from deciding it (FR-APR-008): the people the decision rule for that kind of route bars", () => {
  it("a requisition's route, the name's and the appointment's bar the officer who raised the requisition, not whoever sent the route", () => {
    for (const kind of ["REQUISITION", "NAME_APPROVAL", "APPOINTMENT"] as const) {
      expect(routeRequesterId(kind, facts), kind).toBe("raiser");
      expect(requesterRelation(kind), kind).toBe("RAISED");
    }
  });

  it("a certificate's, a variation's and a contract matter's route bar whoever sent it, not the original requisitioner", () => {
    for (const kind of ["CERTIFICATE", "VARIATION", "CONTRACT_MATTER"] as const) {
      expect(routeRequesterId(kind, facts), kind).toBe("sender");
      expect(requesterRelation(kind), kind).toBe("SENT");
    }
    // The requisitioner is not barred from a certificate: with no sender recorded, nobody is.
    expect(routeRequesterId("CERTIFICATE", { requisitionRaiserId: "raiser" })).toBeNull();
  });

  it("a supplier's application bars whoever sent it, and a blacklisting or a special permission whoever raised the request", () => {
    expect(routeRequesterId("SUPPLIER_APPLICATION", facts)).toBe("applicant");
    expect(requesterRelation("SUPPLIER_APPLICATION")).toBe("SENT");
    for (const kind of ["STANDING_REQUEST", "SPECIAL_PERMISSION"] as const) {
      expect(routeRequesterId(kind, facts), kind).toBe("requester");
      expect(requesterRelation(kind), kind).toBe("RAISED");
    }
  });

  // Changed for the product owner's ruling of 2026-10-08 on log line 1789. This test used to say the sender of a name or an appointment route is NOT barred (an open question);
  // it is barred now, as the sender already is on a certificate's, a variation's and a contract matter's route, and the raiser of the requisition stays barred too.
  it("the sender of a name or an appointment route is barred as well as the requisition's raiser, and is told 'You sent it'", () => {
    for (const kind of ["NAME_APPROVAL", "APPOINTMENT"] as const) {
      expect(routeRequesterId(kind, facts), kind).toBe("raiser");
      expect(routeSenderBarredId(kind, facts), kind).toBe("sender");
      expect(routeBarred(kind, facts), kind).toEqual([{ personId: "raiser", relation: "RAISED" }, { personId: "sender", relation: "SENT" }]);
    }
    // With no sender recorded nobody is barred on that account; the raiser stays barred.
    expect(routeBarred("NAME_APPROVAL", { requisitionRaiserId: "raiser" })).toEqual([{ personId: "raiser", relation: "RAISED" }]);
    expect(routeBarred("APPOINTMENT", { routeSenderId: "sender" })).toEqual([{ personId: "sender", relation: "SENT" }]);
    // One person who is both is listed once, as the raiser.
    expect(routeBarred("NAME_APPROVAL", { requisitionRaiserId: "same", routeSenderId: "same" })).toEqual([{ personId: "same", relation: "RAISED" }]);
  });

  it("every other kind bars the one person it always did, and a requisition's route does not bar a sender", () => {
    expect(routeSenderBarredId("REQUISITION", facts)).toBeNull();
    for (const kind of ["REQUISITION", "CERTIFICATE", "VARIATION", "CONTRACT_MATTER", "SUPPLIER_APPLICATION", "STANDING_REQUEST", "SPECIAL_PERMISSION"] as const) {
      expect(routeBarred(kind, facts), kind).toHaveLength(1);
      expect(routeBarred(kind, facts)[0]!.personId, kind).toBe(routeRequesterId(kind, facts));
    }
  });

  it("every kind of route says its own words, and none names a code", () => {
    expect(new Set(ALL.map((k) => BARRED_WORDS[requesterRelation(k)]))).toEqual(new Set(["You raised it: you cannot decide it", "You sent it: you cannot decide it"]));
    // The officer who keyed an earlier act for someone else has words of their own (ruling on log line 1792).
    expect(BARRED_WORDS.KEYED).toBe("You recorded it for someone else: you cannot decide it");
  });
});

describe("the decision sites and the worklist read the same helper", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const SITES: Record<string, RequesterRouteKind> = {
    "src/app/requisitions/actions.ts": "REQUISITION",
    "src/app/awards/actions.ts": "APPOINTMENT",
    "src/app/sourcing/actions.ts": "NAME_APPROVAL",
    "src/app/sourcing/[id]/documents/actions.ts": "NAME_APPROVAL",
    "src/app/sourcing/[id]/evaluation/meeting-actions.ts": "NAME_APPROVAL",
    "src/app/sourcing/[id]/window/change-actions.ts": "NAME_APPROVAL",
    "src/lib/certificate/route-write.ts": "CERTIFICATE",
    "src/lib/variation/route-write.ts": "VARIATION",
    "src/lib/matter/route-write.ts": "CONTRACT_MATTER",
    "src/app/suppliers/actions.ts": "SUPPLIER_APPLICATION",
    "src/app/suppliers/link-actions.ts": "SPECIAL_PERMISSION",
    "src/app/suppliers/standing-actions.ts": "STANDING_REQUEST",
  };
  for (const [file, kind] of Object.entries(SITES)) {
    it(`${file} asks for a ${kind} route's requester through the helper`, () => {
      const src = read(file);
      expect(src).toMatch(new RegExp(String.raw`requesterId: routeRequesterId\("${kind}", \{`));
    });
  }

  // Ruling of 2026-10-08 on log line 1789: the five name and appointment decision sites also pass the route's sender, from the same helper the worklist reads.
  for (const [file, kind] of Object.entries(SITES).filter(([, k]) => k === "NAME_APPROVAL" || k === "APPOINTMENT")) {
    it(`${file} also bars the sender of a ${kind} route through the helper`, () => {
      expect(read(file)).toMatch(new RegExp(String.raw`senderId: routeSenderBarredId\("${kind}", \{ routeSenderId: (?:inst|full)\.submittedByPersonId \}\),`));
    });
  }

  it("the worklist reads who keyed each requisition for someone else in ONE batched query over the routes it lists, never one per route (ruling on log line 1792)", () => {
    const src = read("src/lib/approvals/load.ts");
    expect(src.match(/loadRecorders\(/g)).toHaveLength(1);
    // Asked before the loop over the routes, with every requisition at once.
    expect(src.indexOf("loadRecorders(db")).toBeLessThan(src.indexOf("for (const r of routes)"));
    expect(src).toMatch(/entity: "Requisition", slot: "requestingPerson", ids: requisitionIds/);
  });

  it("the worklist bars the people the helper names, and no union of the rules", () => {
    const src = read("src/lib/approvals/load.ts");
    expect(src).toMatch(/routeBarred\(kind,/);
    expect(src).not.toMatch(/requestingPersonId, r\.submittedByPersonId/);
  });
});

describe("the delegates My steps lists are those who would not be refused (FR-APR-018)", () => {
  const delegate = (personId: string, valueCeiling: string | null) => ({ personId, delegation: { valueCeiling } });
  const RM = (n: number) => BigInt(n) * 100n;

  it("keeps a delegate whose ceiling reaches the route's value, and one with no ceiling", () => {
    const got = decidingDelegates([delegate("capped", "50000.00"), delegate("free", null), delegate("big", "5000000.00")], {}, RM(2_000_000));
    expect(got.map((d) => d.personId)).toEqual(["free", "big"]);
  });

  it("keeps a delegate whose ceiling is exactly the value", () => {
    expect(decidingDelegates([delegate("exact", "50000.00")], {}, RM(50_000)).map((d) => d.personId)).toEqual(["exact"]);
  });

  it("keeps nobody on a step only the holder may decide", () => {
    expect(decidingDelegates([delegate("free", null), delegate("big", "5000000.00")], { nonDelegable: true }, RM(10))).toEqual([]);
  });

  it("judges no ceiling where the route's value is not known", () => {
    expect(decidingDelegates([delegate("capped", "50000.00")], {}, null).map((d) => d.personId)).toEqual(["capped"]);
  });

  it("is why a capped delegate is not told 'waiting for you' on a step above their ceiling, and a non-delegable step is never theirs", () => {
    const step = (id: string, nonDelegable = false): QueueStep["steps"][number] => ({
      id, sequence: 1, roleCode: "HOD", roleLabel: "HOD", actingRoleCode: null, actingRoleLabel: null, act: "A", committeeCode: null, decision: "PENDING", decidedOn: null, escalation: null, escalationReason: null, nonDelegable,
    });
    const route = (id: string, value: bigint, nonDelegable = false): QueueStep => ({ routeId: id, matterLabel: `REQ/${id}`, matterKindLabel: "Requisition", href: `/r/${id}`, steps: [step(`s${id}`, nonDelegable)], openedAt: new Date("2026-09-01T00:00:00Z"), value });
    const routes = [route("small", RM(10_000)), route("large", RM(2_000_000)), route("alone", RM(10_000), true)];
    const delegates = [delegate("dina", "50000.00")];
    const groups = officeQueue(routes, "2026-10-01", () => false, (routeId) => {
      const r = routes.find((x) => x.routeId === routeId)!;
      return { holderIds: ["amir"], delegateIds: decidingDelegates(delegates, r.steps[0]!, r.value).map((d) => d.personId) };
    });
    expect(myStepsOf(groups, "dina").map((m) => m.item.matterLabel)).toEqual(["REQ/small"]);
    expect(myStepsOf(groups, "amir").map((m) => m.item.matterLabel).sort()).toEqual(["REQ/alone", "REQ/large", "REQ/small"]);
  });
});
