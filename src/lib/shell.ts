import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

/**
 * What the application frame needs on every screen: who is signed in, and how much
 * work is outstanding behind each navigation item.
 *
 * Counts only appear for modules that exist. A badge of nought on an unbuilt module
 * would read as "nothing to do" rather than "nothing here yet".
 */
export async function loadShell() {
  const fallback = {
    user: { name: "Zulkifli bin Abdul Manaf", jobTitle: "Head of Department, C&P" },
    counts: {} as Record<string, number>,
  };

  try {
    const org = await db.organisation.findUnique({
      where: { code: ORGANISATION_CODE },
      select: { id: true },
    });
    if (!org) return fallback;

    // Standing in for authentication: the office that raises most procurement work.
    const person = await db.person.findFirst({
      where: { organisationId: org.id, staffNo: "E-1090" },
      select: { name: true, jobTitle: true },
    });

    const pending = await db.committeeDecision.count({
      where: {
        outcome: "PENDING",
        meeting: { committee: { organisationId: org.id } },
      },
    });

    return {
      user: person
        ? { name: person.name, jobTitle: person.jobTitle ?? "Officer" }
        : fallback.user,
      counts: pending > 0 ? { "/": pending } : {},
    };
  } catch {
    return fallback;
  }
}
