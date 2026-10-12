/**
 * Demo data for Phase 3c (reporting lines, the staff inbox, the not-approved memo). Invented throughout, like every demo figure, and none of it is a customer's.
 *
 * The product ships these EMPTY: no reporting line, no notification rule. The demonstration sets a few so that the feature can be tried, and says so:
 *
 * - reporting lines for the people who hold the demo's offices, each ASSUMED (so the screen shows "Assumed: a working default, needs sign-off"), and for some
 *   people none at all, so the screen also shows what "Reporting line not set for ..." does. The Chief Executive is recorded as having nobody above them.
 * - one notification rule for the event "a matter not carried", naming the Head of Contract & Procurement, so a not-approved memo can be issued and read.
 *
 * Written only by `npm run demo:load` on a fresh database (ruling 12c, 2026-10-12): these are configuration rows. `npm run demo:inbox` on a loaded database writes nothing and names what is not set. Every row has a demo id. Nothing
 * here deletes a row (the trail is permanent). The notification rule is not written where the organisation already has one for the event.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { NOT_CARRIED_EVENT_KEY } from "../src/lib/committee/labels";

import { DEMO_ACTOR } from "./demo-actor";

const P = "demo_";
const FROM = new Date("2024-01-01T00:00:00.000Z");

/// [subordinate, superior], by demo person id and name; a null superior records the head of the line.
const LINES: readonly [string, string, string | null, string | null][] = [
  [`${P}p1`, "Aisyah Rahman", null, null],
  [`${P}p2`, "Bala Krishnan", `${P}p1`, "Aisyah Rahman"],
  [`${P}p3`, "Chen Wei Ling", `${P}p2`, "Bala Krishnan"],
  [`${P}p5`, "Eng Siew Mei", `${P}p3`, "Chen Wei Ling"],
  [`${P}p4`, "Daniel Anak Jelani", `${P}p5`, "Eng Siew Mei"],
  [`${P}p7`, "Gopal Nair", `${P}p2`, "Bala Krishnan"],
  [`${P}p8`, "Hana Yusof", `${P}p7`, "Gopal Nair"],
  [`${P}p9`, "Imran Hakim", `${P}p7`, "Gopal Nair"],
];
const RULE_ID = `${P}nr_not_carried`;

/// What the demonstration would add and the database lacks, without writing a thing (ruling 12c): the reporting lines of its people, and the rule for a matter not carried.
export async function inboxDemoMissing(db: PrismaClient, organisationId: string): Promise<{ lines: number; rule: boolean }> {
  const existing = new Set((await db.reportingLine.findMany({ where: { organisationId, personId: { in: LINES.map((l) => l[0]) } }, select: { personId: true } })).map((r) => r.personId));
  const rule = (await db.notificationRule.count({ where: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY } })) === 0;
  return { lines: LINES.filter((l) => !existing.has(l[0])).length, rule };
}

/// Returns what it wrote. A second run, or a database where the rows stand, writes nothing.
export async function loadInboxDemo(db: PrismaClient, organisationId: string): Promise<{ lines: number; rule: boolean }> {
  const existing = new Set((await db.reportingLine.findMany({ where: { organisationId, personId: { in: LINES.map((l) => l[0]) } }, select: { personId: true } })).map((r) => r.personId));
  const fresh = LINES.map((l, i) => ({ l, id: `${P}rl${i + 1}` })).filter(({ l }) => !existing.has(l[0]));
  if (fresh.length > 0) {
    await db.reportingLine.createMany({
      data: fresh.map(({ l: [person, , superior], id }) => ({ id, organisationId, personId: person, superiorPersonId: superior, effectiveFrom: FROM, effectiveTo: null, provenance: "ASSUMED" as const, note: "Invented for the demonstration." })),
      skipDuplicates: true,
    });
    await db.auditEntry.createMany({
      data: fresh.map(({ l: [, name, , superiorName], id }) => ({
        id: `${id}_au1`,
        organisationId,
        entity: "ReportingLine",
        entityId: id,
        entityLabel: `${name} reports to ${superiorName ?? "nobody (head of the line)"}`,
        action: "CREATE" as const,
        at: FROM,
        ...DEMO_ACTOR,
        changes: diffFields(null, { person: name, reportsTo: superiorName ?? "Nobody (head of the line)", effectiveFrom: FROM, effectiveTo: null, provenance: "ASSUMED", note: "Invented for the demonstration." }) as object,
      })),
      skipDuplicates: true,
    });
  }
  const hasRule = (await db.notificationRule.count({ where: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY } })) > 0;
  if (!hasRule) {
    await db.notificationRule.create({
      data: {
        id: RULE_ID,
        organisationId,
        eventKey: NOT_CARRIED_EVENT_KEY,
        nameEn: "A matter was not carried (memo to the implementing department)",
        recipientRoleCodes: ["HOD_CP"],
        reminderOffsetDays: [],
        isActive: true,
        provenance: "ASSUMED",
        notes: "Invented for the demonstration.",
        sortOrder: 90,
      },
    });
    await db.auditEntry.create({
      data: {
        id: `${RULE_ID}_au1`,
        organisationId,
        entity: "NotificationRule",
        entityId: RULE_ID,
        entityLabel: "A matter was not carried (memo to the implementing department)",
        action: "CREATE",
        at: FROM,
        ...DEMO_ACTOR,
        changes: diffFields(null, { event: "A matter was not carried", notify: "HOD_CP", reminders: "", sends: true, provenance: "ASSUMED" }) as object,
      },
    });
  }
  return { lines: fresh.length, rule: !hasRule };
}
