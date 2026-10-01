import { describe, expect, it } from "vitest";

import { nextStep, officeQueue, type QueueStep } from "./queue";

const d = (day: string) => new Date(`${day}T00:00:00Z`);
const s = (sequence: number, roleCode: string, decision: string, over: Partial<QueueStep["steps"][number]> = {}): QueueStep["steps"][number] => ({
  id: `${roleCode}${sequence}`,
  sequence,
  roleCode,
  roleLabel: { HOD: "Head of Department", HODIV: "Head of Division", FD: "Functional Director", QC: "Quotation Committee" }[roleCode] ?? roleCode,
  actingRoleCode: null,
  actingRoleLabel: null,
  act: "R",
  committeeCode: null,
  decision,
  decidedOn: decision === "DONE" ? d("2026-09-20") : null,
  escalation: null,
  escalationReason: null,
  ...over,
});
const route = (id: string, steps: QueueStep["steps"], openedAt = "2026-09-10"): QueueStep => ({ routeId: id, matterLabel: `REQ/${id}`, matterKindLabel: "Requisition", href: `/requisitions/${id}`, steps, openedAt: d(openedAt) });

describe("the office worklist (FR-APR-010, CO-7)", () => {
  it("lists each open route once, at its next step, under the office acting for it", () => {
    const q = officeQueue(
      [
        route("1", [s(1, "HOD", "DONE"), s(2, "HODIV", "PENDING"), s(3, "FD", "PENDING")]),
        route("2", [s(1, "HOD", "PENDING"), s(2, "HODIV", "PENDING")]),
        route("3", [s(1, "HOD", "DONE"), s(2, "HODIV", "PENDING", { actingRoleCode: "FD", actingRoleLabel: "Functional Director", escalation: "NO_AVAILABLE_HOLDER", escalationReason: "Vacant" })]),
      ],
      "2026-10-01",
      () => false,
    );
    expect(q.map((g) => [g.officeLabel, g.items.map((i) => i.matterLabel)])).toEqual([
      ["Functional Director", ["REQ/3"]],
      ["Head of Department", ["REQ/2"]],
      ["Head of Division", ["REQ/1"]],
    ]);
    expect(q[0].items[0]).toMatchObject({ escalatedFrom: "Head of Division", escalation: "NO_AVAILABLE_HOLDER", escalationReason: "Vacant" });
  });

  it("counts waiting days on the organisation's day from the step before's decision, else the route's opening", () => {
    const q = officeQueue([route("1", [s(1, "HOD", "DONE"), s(2, "HODIV", "PENDING")]), route("2", [s(1, "HOD", "PENDING")])], "2026-10-01", () => false);
    const items = q.flatMap((g) => g.items);
    expect(items.find((i) => i.matterLabel === "REQ/1")).toMatchObject({ waitingSince: "2026-09-20", waitingDays: 11 });
    expect(items.find((i) => i.matterLabel === "REQ/2")).toMatchObject({ waitingSince: "2026-09-10", waitingDays: 21 });
  });

  it("does not count days while no time zone is set", () => {
    expect(officeQueue([route("1", [s(1, "HOD", "PENDING")])], null, () => false)[0].items[0].waitingDays).toBeNull();
  });

  it("flags a step whose office has nobody able to act, so it can be escalated (FR-APR-012)", () => {
    const q = officeQueue([route("1", [s(1, "HOD", "PENDING")])], "2026-10-01", (_route, code) => code === "HOD");
    expect(q[0].items[0].noneAvailable).toBe(true);
  });

  it("leaves out a route with nothing left to decide", () => {
    expect(nextStep([s(1, "HOD", "DONE")])).toBeNull();
    expect(officeQueue([route("1", [s(1, "HOD", "DONE")])], "2026-10-01", () => false)).toEqual([]);
  });
});
