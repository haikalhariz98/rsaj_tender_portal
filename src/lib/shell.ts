import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

/**
 * What the application frame needs on every screen: who is signed in, and how much
 * work is outstanding behind each navigation item.
 *
 * Counts only appear for modules that exist. A nought on an unbuilt module would
 * read as "nothing to do" rather than "nothing here yet".
 *
 * The signed-in officer is a placeholder until authentication arrives; it resolves
 * to whoever is on record, and to a generic label when nobody is.
 */
export async function loadShell() {
  const fallback = {
    user: { name: "Signed out", jobTitle: "No user configured" },
    counts: {} as Record<string, number>,
  };

  try {
    const org = await db.organisation.findUnique({
      where: { code: ORGANISATION_CODE },
      select: { id: true },
    });
    if (!org) return fallback;

    const person = await db.person.findFirst({
      where: { organisationId: org.id, isActive: true },
      orderBy: { name: "asc" },
      select: { name: true, jobTitle: true },
    });

    const pending = await db.committeeDecision.count({
      where: {
        outcome: "PENDING",
        meeting: { committee: { organisationId: org.id } },
      },
    });

    return {
      user: person ? { name: person.name, jobTitle: person.jobTitle ?? "Officer" } : fallback.user,
      counts: pending > 0 ? { "/": pending } : {},
    };
  } catch {
    return fallback;
  }
}
