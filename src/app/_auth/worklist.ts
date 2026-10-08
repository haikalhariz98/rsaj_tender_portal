import { cache } from "react";

import { hiddenExercises } from "@/app/_auth/sulit";
import { loadWorklist } from "@/lib/approvals/load";
import { myStepsOf, waitingForCount } from "@/lib/approvals/queue";
import { db } from "@/lib/db";
import { unreadCount } from "@/lib/inbox/store";
import type { StaffActor } from "@/lib/auth/types";

/**
 * The signed-in person's worklist, read once per request (React's `cache()`): the approvals page, the shell's count and anything else that asks for it in the
 * same request share one read, so the count beside "My approvals" and the list on it cannot disagree (FR-APR-018). Restricted exercises the person is not named
 * on are left out, as on every list (FR-MTD-007).
 */
export const requestWorklist = cache(async (actor: StaffActor) => loadWorklist(actor, await hiddenExercises(actor)));

/**
 * What the shell counts beside the staff navigation: the steps waiting for the person (the length of "My steps", not those they raised), and their unread
 * notices. A count of nought is left out, so a badge is never "0". Never throws: the frame must render whatever is wrong with the data.
 */
export async function staffCounts(actor: StaffActor): Promise<Record<string, number>> {
  if (actor.system) return {};
  try {
    const hidden = await hiddenExercises(actor);
    const [w, unread] = await Promise.all([requestWorklist(actor), unreadCount(db, { organisationId: actor.organisationId, personId: actor.personId }, hidden)]);
    const waiting = w ? waitingForCount(myStepsOf(w.groups, actor.personId)) : 0;
    return { ...(waiting > 0 ? { "/approvals": waiting } : {}), ...(unread > 0 ? { "/inbox": unread } : {}) };
  } catch (e) {
    console.error("The shell's counts could not be read:", e);
    return {};
  }
}
