import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { NOT_SET_WORDS, purgeCutoff, purgeSignInDetail, purgeSummary } from "./purge";

/**
 * The purge of sign-in addresses (ruling O-1, Phase 5), against the scratch database: it deletes the addresses older than the organisation's period and nothing else, never
 * touches the permanent sign-in events, says nothing is purged while the period is unset, counts a dry run without deleting, and leaves another organisation alone. The
 * database's own trigger refuses the same things for every login, which `trail-integrity.db.test.ts` pins.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-10-09T12:00:00.000Z");

async function anOrganisation(days: number | null) {
  const org = await db.organisation.create({ data: { code: `PG_${randomId()}`, name: "Purge", timeZone: "Asia/Kuala_Lumpur" } });
  await setPolicy(org.id, { ...SETTINGS, addressThrottleMinutes: 30, signInDetailRetentionDays: days });
  const who = await makeAccount(org.id);
  return { org, who };
}
const detailOf = (eventId: string) => db.signInEventDetail.findUnique({ where: { eventId } });
const purgeRows = (organisationId: string) => db.auditEntry.findMany({ where: { organisationId, entity: "SecurityPolicy", actorSystemLabel: "sign-in purge command" } });

describe("the cutoff", () => {
  it("is the number of days before now, to the millisecond", () => {
    expect(purgeCutoff(NOW, 90).toISOString()).toBe("2026-07-11T12:00:00.000Z");
    expect(purgeCutoff(NOW, 1).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });
  it("says in words what a run found or did", () => {
    const base = { ok: true as const, days: 30, cutoff: NOW, candidates: 2, deleted: 2, dryRun: false };
    expect(purgeSummary(base)).toBe("2 sign-in addresses are older than 30 days: 2 deleted. The sign-in events themselves are kept.");
    expect(purgeSummary({ ...base, candidates: 1, deleted: 0, dryRun: true })).toBe("Dry run: 1 sign-in address is older than 30 days. Nothing was deleted.");
  });
});

describe("the purge", () => {
  let ctx: Awaited<ReturnType<typeof anOrganisation>>;
  beforeEach(async () => {
    ctx = await anOrganisation(30);
  });

  it("deletes only what is past the period on the day it is run, and writes one audit row for the run, as the system, with the cutoff and the count", async () => {
    // Events dated relative to the real clock, so that the database's own trigger agrees with the cutoff.
    const real = Date.now();
    const make = async (daysAgo: number) => {
      const event = await db.signInEvent.create({ data: { organisationId: ctx.org.id, store: "STAFF", staffAccountId: ctx.who.account.id, kind: "SIGNED_IN", at: new Date(real - daysAgo * DAY) } });
      await db.signInEventDetail.create({ data: { eventId: event.id, sourceAddress: "198.51.100.9", userAgent: "vitest" } });
      return event.id;
    };
    const old = await make(45);
    const recent = await make(3);
    const outcome = await db.$transaction((tx) => purgeSignInDetail(tx, { organisationId: ctx.org.id, now: new Date(real), dryRun: false }));
    expect(outcome).toMatchObject({ ok: true, days: 30, candidates: 1, deleted: 1, dryRun: false });
    expect(await detailOf(old)).toBeNull();
    expect(await detailOf(recent)).not.toBeNull();
    // The permanent events stay: only the address and the device go.
    expect(await db.signInEvent.count({ where: { organisationId: ctx.org.id } })).toBe(2);
    const rows = await purgeRows(ctx.org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorKind: "SYSTEM", action: "UPDATE", unattributed: false });
    expect(JSON.stringify(rows[0].changes)).toContain("Addresses deleted");
    expect(JSON.stringify(rows[0].changes)).toContain('"after":"1"');
  });

  it("counts a dry run and deletes nothing, writing no audit row", async () => {
    const real = Date.now();
    const event = await db.signInEvent.create({ data: { organisationId: ctx.org.id, store: "STAFF", staffAccountId: ctx.who.account.id, kind: "SIGNED_IN", at: new Date(real - 60 * DAY) } });
    await db.signInEventDetail.create({ data: { eventId: event.id, sourceAddress: "198.51.100.10", userAgent: "vitest" } });
    const outcome = await db.$transaction((tx) => purgeSignInDetail(tx, { organisationId: ctx.org.id, now: new Date(real), dryRun: true }));
    expect(outcome).toMatchObject({ ok: true, candidates: 1, deleted: 0, dryRun: true });
    expect(await detailOf(event.id)).not.toBeNull();
    expect(await purgeRows(ctx.org.id)).toHaveLength(0);
  });

  it("deletes nothing while the period is unset, and says so, and the database would refuse it as well", async () => {
    const lone = await anOrganisation(null);
    const real = Date.now();
    const event = await db.signInEvent.create({ data: { organisationId: lone.org.id, store: "STAFF", staffAccountId: lone.who.account.id, kind: "SIGNED_IN", at: new Date(real - 900 * DAY) } });
    await db.signInEventDetail.create({ data: { eventId: event.id, sourceAddress: "198.51.100.11", userAgent: "vitest" } });
    const outcome = await db.$transaction((tx) => purgeSignInDetail(tx, { organisationId: lone.org.id, now: new Date(real), dryRun: false }));
    expect(outcome).toEqual({ ok: false, kind: "NOT_SET", message: NOT_SET_WORDS });
    expect(await detailOf(event.id)).not.toBeNull();
    await expect(db.signInEventDetail.delete({ where: { eventId: event.id } })).rejects.toThrow();
  });

  it("leaves another organisation's addresses alone, whatever their age", async () => {
    const other = await anOrganisation(30);
    const real = Date.now();
    const theirs = await db.signInEvent.create({ data: { organisationId: other.org.id, store: "STAFF", staffAccountId: other.who.account.id, kind: "SIGNED_IN", at: new Date(real - 500 * DAY) } });
    await db.signInEventDetail.create({ data: { eventId: theirs.id, sourceAddress: "198.51.100.12", userAgent: "vitest" } });
    await db.$transaction((tx) => purgeSignInDetail(tx, { organisationId: ctx.org.id, now: new Date(real), dryRun: false }));
    expect(await detailOf(theirs.id)).not.toBeNull();
  });
});
