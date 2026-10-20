import { EDIT_PROPOSE_PERMISSION } from "@/lib/auth/configuration-edit";

import { currentStaffOrNull, permissionGate } from "./actor";

/// Whether whoever is looking at the officers' copy of a supplier page may propose configuration, so the "public portal address not set" card can offer the way to set it.
/// Nobody signed in, and the public copy (where nobody is ever signed in as staff), are told who to ask instead. Only draws a link: what the editor accepts is judged there.
export async function staffMaySetPortal(): Promise<boolean> {
  const actor = await currentStaffOrNull();
  // The same gate the save action asks, so the link is drawn exactly when a proposal would be accepted.
  return actor ? (await permissionGate(actor, EDIT_PROPOSE_PERMISSION)).ok : false;
}
