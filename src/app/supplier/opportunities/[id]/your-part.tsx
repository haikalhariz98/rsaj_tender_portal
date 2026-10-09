import { ClipboardIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { loadBidContext } from "@/lib/portal/bids/context-store";

import { currentSupplierOrNull } from "../../../_auth/supplier";

/**
 * "Your part" on an opportunity's own page (Phase 4d): for a signed-in supplier, the way into this exercise in My Bids, where it signs up for a briefing, acknowledges an addendum, asks for the documents and
 * inspects them. Someone not signed in sees nothing here (the sign-in is offered by "Do you qualify?" above), and a page the supplier may not open in My Bids offers no link.
 */
export async function YourPart({ exerciseId }: { exerciseId: string }) {
  const actor = await currentSupplierOrNull();
  if (!actor) return null;
  const ctx = await loadBidContext(db, actor, exerciseId);
  if (!ctx) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title="Your part"
        subtitle="Sign up for a briefing, ask for the documents, inspect them and acknowledge addenda, as a signed-in supplier."
        divided={false}
        actions={<ButtonLink href={`/supplier/bids/${exerciseId}`} variant="secondary" size="sm">Open in My Bids</ButtonLink>}
      />
    </Card>
  );
}
