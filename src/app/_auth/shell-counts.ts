"use server";

import { requireStaff } from "./actor";
import { staffCounts } from "./worklist";

/**
 * The counts beside the navigation, read afresh (GN-04, AC-13). The layout does not render again when someone navigates, so a step that moved to this person by someone else's act
 * would leave the badge behind the page. The shell asks here after each navigation, and only for someone signed in to the staff side. The person's own counts, nobody else's.
 */
export async function shellCountsAction(): Promise<Record<string, number>> {
  const actor = await requireStaff();
  return staffCounts(actor);
}
