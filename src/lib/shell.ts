import { db } from "@/lib/db";
import { displayName } from "@/lib/organisation/details";
import { ORGANISATION_CODE, ORGANISATION_NAME } from "@/lib/org";

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
/// How the organisation shows in the frame. `name` is the short name where there is one,
/// else the legal name. `logo` is null until one is uploaded: the product mark is shown.
export interface ShellOrganisation {
  name: string;
  logo: { sha: string; width: number; height: number } | null;
}

export async function loadShell(): Promise<{
  user: ShellUser | null;
  counts: Record<string, number>;
  organisation: ShellOrganisation;
}> {
  // The environment name is only for a deployment with no organisation row yet.
  const fallback = {
    user: null,
    counts: {} as Record<string, number>,
    organisation: { name: ORGANISATION_NAME, logo: null } as ShellOrganisation,
  };

  try {
    const org = await db.organisation.findUnique({
      where: { code: ORGANISATION_CODE },
      select: { id: true, name: true, shortName: true, logo: { select: { sha256: true, width: true, height: true } } },
    });
    if (!org) return fallback;

    const pending = await db.committeeDecision.count({
      where: {
        outcome: "PENDING",
        withdrawnAt: null,
        meeting: { committee: { organisationId: org.id } },
      },
    });

    return {
      // Deliberately not "the first person on record". Nobody is signed in until
      // sign-in exists, and naming an arbitrary officer would misattribute the screen.
      user: null as ShellUser | null,
      counts: pending > 0 ? { "/": pending } : {},
      organisation: {
        name: displayName(org),
        logo: org.logo ? { sha: org.logo.sha256, width: org.logo.width, height: org.logo.height } : null,
      },
    };
  } catch {
    return fallback;
  }
}
