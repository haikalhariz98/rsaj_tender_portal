import { ClipboardIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { loadWaitingForYou } from "@/lib/project-docs/portal-read";

import { currentSupplierOrNull } from "../_auth/supplier";
import { WaitingList } from "./projects/[id]/waiting-for-you";

/**
 * "Waiting for you" on the portal home (the simple Project workspace, plan step 5; PW-13): for a signed-in contractor, the documents the organisation has asked for or sent back,
 * across its contracts. Someone not signed in sees nothing here, and so does a contractor with nothing waiting: the card is not drawn for an empty list.
 */
export async function WaitingForYouCard() {
  const actor = await currentSupplierOrNull();
  if (!actor) return null;
  const waiting = await loadWaitingForYou(db, actor);
  if (waiting.rows.length === 0) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title="Waiting for you" divided={false} />
      <WaitingList rows={waiting.rows} withContract more={waiting.next ? { href: "/supplier/projects", label: "More in My Projects" } : null} />
    </Card>
  );
}
