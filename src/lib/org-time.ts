import { dayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

/// The organisation's IANA time zone. Null: nobody has set one, and dates are judged
/// in UTC — never an assumed zone.
export async function organisationTimeZone(): Promise<string | null> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { timeZone: true } });
  return org?.timeZone ?? null;
}

/// The zone and today in it.
export async function organisationToday(now = new Date()) {
  const timeZone = await organisationTimeZone();
  return { timeZone, today: dayIn(now, timeZone) };
}
