import { beforeAll, describe, expect, it } from "vitest";

import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, today, type TestOrg } from "@/lib/test-db/contract.fixture";

import { DLP_EVENT_KEY } from "./dlp";
import { dlpSweep } from "./view";

/**
 * F9 (code review of close-out stage B): the DLP reminder is written without anyone opening the contract (`dlpSweep`, run where the inbox is read),
 * and a first reading late in the period writes the latest offset reached only, once.
 */

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("DLS");
  await db.notificationRule.create({ data: { organisationId: o.organisationId, eventKey: DLP_EVENT_KEY, nameEn: "Defects liability period ending", recipientRoleCodes: [o.soRole], reminderOffsetDays: [30, 7] } });
});

describe("dlpSweep", () => {
  it("tells the S.O. office the latest offset reached, once, for a contract nobody has opened", async () => {
    const k = await activeContract(o, { dueIn: -360, status: "PRACTICALLY_COMPLETE" });
    const r = randomId();
    const cert = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "PRACTICAL_COMPLETION", status: "ISSUED", baselineId: k.baselineId, number: `CPC/${r}`, sequence: 1, issuedAt: new Date(), issueSnapshot: {}, openedAt: new Date(), openedOn: D(k.due) } });
    const pc = await db.practicalCompletion.create({ data: { organisationId: o.organisationId, certificateId: cert.id, contractId: k.contractId, completionDate: D(k.due), possessionTakenOn: D(k.due), inspectedOn: D(k.due), attendees: [], testReasons: "Complete.", dlpMonths: 12, dlpStart: D(k.due), dlpEnd: D(dayPlus(today(), 5)), personId: o.so, recordedAt: new Date() } });
    const told = () => db.staffNotice.findMany({ where: { organisationId: o.organisationId, kind: "DLP_ENDING", recipientPersonId: o.so } });
    await dlpSweep(o.organisationId, today());
    const first = await told();
    expect(first.length).toBe(1);
    expect(first[0].occurrence).toBe("7");
    await dlpSweep(o.organisationId, today());
    expect((await told()).length).toBe(1);
    expect(pc.id).toBeTruthy();
  });
});
