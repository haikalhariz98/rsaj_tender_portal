import { loadAwardPolicy } from "@/lib/award/repo";
import { DERIVE_CAP, endorsedPhases } from "@/lib/contract/load";
import { dayOf } from "@/lib/dates";
import { exerciseOrg } from "@/lib/method/repo";
import { inDelayContractIds } from "@/lib/supervision/load";

import type { RowContext } from "./rows";

/**
 * What the Projects rows are read against, loaded once for the page and for the export route (7.6): the organisation's day, the contracts In Delay, each endorsed
 * contract's derived phase, and the award policy. Derived on the day, never stored.
 */
export async function loadCaseContext(organisationId: string) {
  const org = await exerciseOrg(organisationId);
  const today = org?.timeZone ? dayOf(new Date(), org.timeZone) : null;
  const delayIds = org && today ? (await inDelayContractIds(org.id, today)).ids : [];
  const derived: RowContext["derived"] = org ? await endorsedPhases(org.id, DERIVE_CAP) : new Map();
  const policy = org ? await loadAwardPolicy(org.id) : null;
  return { org, today, delayIds, derived, policy };
}
