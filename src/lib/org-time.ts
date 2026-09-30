import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

/// The organisation's IANA time zone. Null: nobody has set one — not UTC, and never
/// an assumed zone.
export async function organisationTimeZone(): Promise<string | null> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { timeZone: true } });
  return org?.timeZone ?? null;
}

/// The zone and today in it; today is null while no zone is set.
export async function organisationToday(now = new Date()) {
  const timeZone = await organisationTimeZone();
  return { timeZone, today: todayIn(now, timeZone) };
}
