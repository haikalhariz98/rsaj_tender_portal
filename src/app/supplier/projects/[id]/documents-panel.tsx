import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import type { ProjectContext } from "@/lib/portal/projects/context-store";
import { loadPortalRegister, loadPortalStart } from "@/lib/project-docs/portal-read";

import { PortalDocumentsCard } from "./portal-documents-card";

/**
 * The contractor's Documents list for the contract being shown: one page of it, from the cursor in the address, and what it may start. Read only when the Submissions tab is
 * the one on screen, like every tab of the project page; the loaders answer for the session's supplier and for a contract it holds.
 */
export async function PortalDocumentsPanel({ actor, ctx, token, after }: { actor: SupplierActor; ctx: ProjectContext; token: string | null; after: string | null }) {
  const [register, start] = await Promise.all([loadPortalRegister(db, actor, ctx.contract.id, { after }), loadPortalStart(db, actor, ctx.contract.id)]);
  // The context was read for this very contract a moment ago; a null here means it is no longer the supplier's, which reads as nothing to show.
  if (!register || !start) return null;
  return <PortalDocumentsCard contractId={ctx.contract.id} rows={register.rows} next={register.next} after={after} start={start} token={token} />;
}
