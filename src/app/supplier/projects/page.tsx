import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH, SIGN_IN_BADGE, SIGN_IN_REASON } from "@/lib/portal/labels";

export default function SupplierProjectsPage() {
  return (
    <NotBuilt
      title="My Projects"
      summary="Contracts held, and the amounts outstanding on each."
      willInclude={[
        "Progress against the programme of works",
        "Interim claims and materials-on-site lists",
        "Certificates issued, and amounts certified against amounts paid",
        "Variation and adjustment certificates to sign or dispute",
        "Notices: delay causes, defects to rectify, and the statutory declaration at close",
      ]}
      badgeLabel={SIGN_IN_BADGE.en}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
      reason={{ title: SIGN_IN_BADGE.en, text: SIGN_IN_REASON.en }}
    />
  );
}
