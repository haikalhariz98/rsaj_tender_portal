import { ClipboardIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { contractsToAccept } from "@/lib/portal/projects/award-card-store";
import { loadWaitingForYou, type WaitingRow } from "@/lib/project-docs/portal-read";
import { portalWaitingRows } from "@/lib/work/portal-read";

import { currentSupplierOrNull } from "../_auth/supplier";
import { WaitingList } from "./projects/[id]/waiting-for-you";

/**
 * "Waiting for you" on the portal home (the simple Project workspace, plan step 5; PW-13): for a signed-in contractor, the documents the organisation has asked for or sent back,
 * across its contracts, and an issued award it has yet to accept (Wave V, V4). Someone not signed in sees nothing here, and so does a contractor with nothing waiting: the card is not drawn for an empty list.
 */
export async function WaitingForYouCard() {
  const actor = await currentSupplierOrNull();
  if (!actor) return null;
  const [waiting, accept, work] = await Promise.all([loadWaitingForYou(db, actor), contractsToAccept(db, actor), portalWaitingRows(actor)]);
  const rows: WaitingRow[] = [
    ...accept.map((c) => ({ contractId: c.id, contractLabel: `Contract ${c.number}`, documentId: `award-${c.id}`, title: `Accept ${c.number}`, kindLabel: null, stateLabel: "To accept", href: `/supplier/projects/${c.id}` })),
    ...waiting.rows,
    ...work.rows,
  ];
  if (rows.length === 0) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title="Waiting for you" divided={false} />
      <WaitingList rows={rows} withContract more={waiting.next || work.more ? { href: "/supplier/projects", label: "More in My Projects" } : null} />
    </Card>
  );
}
