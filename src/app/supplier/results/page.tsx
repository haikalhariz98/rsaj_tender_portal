import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH } from "@/lib/portal/labels";

export default function SupplierResultsPage() {
  return (
    <NotBuilt
      title="Results"
      summary="Exercises that have been awarded, and who won them."
      willInclude={[
        "The exercises that have been awarded: title, reference and the awardee",
        "The awarded value, only where the organisation has chosen to publish it",
      ]}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
    />
  );
}
