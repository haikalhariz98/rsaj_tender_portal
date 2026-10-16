import { cache } from "react";

import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";

/// The organisation's IANA time zone. Null: nobody has set one — not UTC, and never
/// an assumed zone. The organisation is the signed-in actor's (ADR 0034 D10), never the deployment's.
/// Read once per request (React `cache()`), so the layout, the page and the loaders share one read.
export const organisationTimeZone = cache(async (organisationId: string): Promise<string | null> => {
  const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { timeZone: true } });
  return org?.timeZone ?? null;
});

/// The zone and today in it; today is null while no zone is set.
export async function organisationToday(organisationId: string, now = new Date()) {
  const timeZone = await organisationTimeZone(organisationId);
  return { timeZone, today: todayIn(now, timeZone) };
}
