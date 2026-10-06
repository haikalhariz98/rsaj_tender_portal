import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH, SIGN_IN_BADGE, SIGN_IN_REASON } from "@/lib/portal/labels";

export default function SupplierCompanyPage() {
  return (
    <NotBuilt
      title="Company"
      summary="Registration details, supporting documents and standing."
      willInclude={[
        "The registrations and statutory documents the organisation requires, with their validity",
        "Expiry monitoring, with reminders before a document lapses",
        "Bumiputera status and its expiry",
        "Current standing: active, suspended or blacklisted, and what that means for eligibility",
      ]}
      badgeLabel={SIGN_IN_BADGE.en}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
      reason={{ title: SIGN_IN_BADGE.en, text: SIGN_IN_REASON.en }}
    />
  );
}
