import { describe, expect, it } from "vitest";

import { myStepsOf, officeQueue, waitingForCount, type QueueStep } from "./queue";

const d = (day: string) => new Date(`${day}T00:00:00Z`);
const s = (sequence: number, roleCode: string, over: Partial<QueueStep["steps"][number]> = {}): QueueStep["steps"][number] => ({
  id: `${roleCode}${sequence}`,
  sequence,
  roleCode,
  roleLabel: roleCode,
  actingRoleCode: null,
  actingRoleLabel: null,
  act: "A",
  committeeCode: null,
  decision: "PENDING",
  decidedOn: null,
  escalation: null,
  escalationReason: null,
  ...over,
});
const route = (id: string, steps: QueueStep["steps"], openedAt: string, barredIds: string[] = []): QueueStep => ({ routeId: id, matterLabel: `REQ/${id}`, matterKindLabel: "Requisition", href: `/requisitions/${id}`, steps, openedAt: d(openedAt), barredIds });

describe("my steps (FR-APR-018): the part of the worklist that is one person's", () => {
  const whoHolds: Record<string, { holderIds: string[]; delegateIds: string[] }> = {
    HOD: { holderIds: ["amir"], delegateIds: ["dina"] },
    HODIV: { holderIds: ["bala"], delegateIds: [] },
    FD: { holderIds: ["chen", "amir"], delegateIds: [] },
    QC: { holderIds: ["amir"], delegateIds: [] },
  };
  const deciders = (_r: string, office: string | null) => whoHolds[office ?? ""] ?? { holderIds: [], delegateIds: [] };
  const routes = [
    route("1", [s(1, "HOD")], "2026-09-10"),
    route("2", [s(1, "HODIV")], "2026-09-05"),
    route("3", [s(1, "FD")], "2026-08-01"),
    route("4", [s(1, "QC", { committeeCode: "QC" })], "2026-08-01"),
    route("5", [s(1, "HOD")], "2026-09-20", ["amir"]),
  ];
  const groups = officeQueue(routes, "2026-10-01", () => false, deciders);

  it("lists the steps whose acting office the person holds, oldest wait first, and not other people's", () => {
    expect(myStepsOf(groups, "amir").map((m) => m.item.matterLabel)).toEqual(["REQ/3", "REQ/1", "REQ/5"]);
    expect(myStepsOf(groups, "bala").map((m) => m.item.matterLabel)).toEqual(["REQ/2"]);
    expect(myStepsOf(groups, "nobody")).toEqual([]);
  });

  it("lists a step a person can decide only as the delegate of the office, and says so", () => {
    expect(myStepsOf(groups, "dina").map((m) => [m.item.matterLabel, m.via])).toEqual([["REQ/1", "DELEGATE"], ["REQ/5", "DELEGATE"]]);
  });

  it("never lists a committee's step as anyone's personal step", () => {
    expect(myStepsOf(groups, "amir").some((m) => m.item.matterLabel === "REQ/4")).toBe(false);
  });

  it("keeps a step the person raised in their list but does not count it as waiting for them", () => {
    const mine = myStepsOf(groups, "amir");
    expect(mine.find((m) => m.item.matterLabel === "REQ/5")).toMatchObject({ barred: true, via: "HOLDER" });
    expect(waitingForCount(mine)).toBe(2);
  });

  it("names nobody where no one is given: no step is anyone's", () => {
    expect(myStepsOf(officeQueue(routes, "2026-10-01", () => false), "amir")).toEqual([]);
  });

  it("follows the office a step was escalated to, not the one it was written for", () => {
    const escalated = route("6", [s(1, "HOD", { actingRoleCode: "FD", actingRoleLabel: "FD", escalation: "NO_AVAILABLE_HOLDER" })], "2026-09-01");
    const g = officeQueue([escalated], "2026-10-01", () => false, deciders);
    expect(myStepsOf(g, "chen").map((m) => m.item.matterLabel)).toEqual(["REQ/6"]);
    expect(myStepsOf(g, "dina")).toEqual([]);
  });
});
