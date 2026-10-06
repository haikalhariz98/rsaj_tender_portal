import { db } from "@/lib/db";
import { displayName } from "@/lib/organisation/details";
import { ORGANISATION_CODE, ORGANISATION_NAME } from "@/lib/org";

export interface ShellUser {
  name: string;
  /// As the person's record has it. Null where none is recorded: nothing is made up to fill the line.
  jobTitle: string | null;
}

/**
 * What the application frame needs on every screen: who is signed in, and how much
 * work is outstanding behind each navigation item.
 *
 * Counts only appear for modules that exist. A nought on an unbuilt module would
 * read as "nothing to do" rather than "nothing here yet".
 *
 * Who is signed in is not decided here: the layout asks `currentStaffOrNull` (src/app/_auth/actor.ts)
 * and passes the person on, so that this module stays free of the request. Nothing here may ever
 * name a person who is not the one signed in (it once returned whichever name sorted first).
 */
/// How the organisation shows in the frame. `name` is the short name where there is one,
/// else the legal name. `logo` is null until one is uploaded: the product mark is shown.
export interface ShellOrganisation {
  name: string;
  logo: { sha: string; width: number; height: number } | null;
}

/// `counts: false` is for whoever is not signed in: the frame still names the organisation, but how much work is outstanding is the staff's to see (Phase 1b: the layout is a loader too).
export async function loadShell(opts: { counts: boolean }): Promise<{
  counts: Record<string, number>;
  organisation: ShellOrganisation;
}> {
  // The environment name is only for a deployment with no organisation row yet.
  const fallback = {
    counts: {} as Record<string, number>,
    organisation: { name: ORGANISATION_NAME, logo: null } as ShellOrganisation,
  };

  try {
    const org = await db.organisation.findUnique({
      where: { code: ORGANISATION_CODE },
      select: { id: true, name: true, shortName: true, logo: { select: { sha256: true, width: true, height: true } } },
    });
    if (!org) return fallback;

    const pending = !opts.counts ? 0 : await db.committeeDecision.count({
      where: {
        outcome: "PENDING",
        withdrawnAt: null,
        meeting: { committee: { organisationId: org.id } },
      },
    });

    return {
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
