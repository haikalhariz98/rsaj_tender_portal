import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH } from "@/lib/portal/labels";

export default function SupplierOpportunitiesPage() {
  return (
    <NotBuilt
      title="Opportunities"
      summary="Open exercises available to bid for."
      willInclude={[
        "The advertised tenders and quotations, with their closing dates",
        "For each: the method, the fee and where to buy the documents, any briefing or site visit, the registrations a bidder must hold, and the addenda issued",
      ]}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
    />
  );
}
