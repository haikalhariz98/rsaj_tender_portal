import { NotBuilt } from "@/components/not-built";

export default function SupplierOpportunitiesPage() {
  return (
    <NotBuilt
      title="Opportunities"
      summary="Open exercises available to bid for."
      willInclude={[
        "Browsing and filtering open tenders and quotations",
        "An eligibility pre-check against the supplier's own registration and grade",
        "Purchase of the tender document, and the receipt for it",
        "Registration of attendance at a briefing or site visit",
        "Acknowledgement of every addendum before an offer can be submitted",
      ]}
    />
  );
}
