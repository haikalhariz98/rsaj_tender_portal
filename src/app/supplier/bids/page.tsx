import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH, SIGN_IN_BADGE, SIGN_IN_REASON } from "@/lib/portal/labels";

export default function SupplierBidsPage() {
  return (
    <NotBuilt
      title="My Bids"
      summary="Bids prepared, submitted or withdrawn."
      willInclude={[
        "Bid preparation against the mandatory document checklist",
        "Sealed submission before the closing time, with a server-side receipt",
        "Withdrawal before the deadline",
        "Written responses to clarification requests",
        "The award or non-award outcome once the decision is taken",
      ]}
      badgeLabel={SIGN_IN_BADGE.en}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
      reason={{ title: SIGN_IN_BADGE.en, text: SIGN_IN_REASON.en }}
    />
  );
}
