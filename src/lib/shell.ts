import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

export interface ShellUser {
  name: string;
  jobTitle: string;
}

/**
 * What the application frame needs on every screen: who is signed in, and how much
 * work is outstanding behind each navigation item.
 *
 * Counts only appear for modules that exist. A nought on an unbuilt module would
 * read as "nothing to do" rather than "nothing here yet".
 *
 * `user` is null until authentication arrives, and callers must say so plainly. It
 * used to fall back to a label reading "Signed out / No user configured", which the
 * dashboard then greeted as a person — "Good afternoon, Signed". Worse, once officers
 * exist this returned whichever name sorts first and presented them as the signed-in
 * user: a guess wearing the shape of a fact.
 */
export async function loadShell(): Promise<{
  user: ShellUser | null;
  counts: Record<string, number>;
}> {
  const fallback = {
    user: null,
    counts: {} as Record<string, number>,
  };

  try {
    const org = await db.organisation.findUnique({
      where: { code: ORGANISATION_CODE },
      select: { id: true },
    });
    if (!org) return fallback;

    const pending = await db.committeeDecision.count({
      where: {
        outcome: "PENDING",
        meeting: { committee: { organisationId: org.id } },
      },
    });

    return {
      // Deliberately not "the first person on record". Nobody is signed in until
      // sign-in exists, and naming an arbitrary officer would misattribute the screen.
      user: null as ShellUser | null,
      counts: pending > 0 ? { "/": pending } : {},
    };
  } catch {
    return fallback;
  }
}
