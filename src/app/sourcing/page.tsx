import { NotBuilt } from "@/components/not-built";

export default function SourcingPage() {
  return (
    <NotBuilt
      title="Sourcing"
      summary="Every exercise from requisition to award — the pre-award process end to end."
      willInclude={[
        "Planning: scope, bill of quantities and the company estimate, held under its own confidentiality",
        "Documents: assembly of the tender or quotation document and its appendix",
        "Invitation: advertisement across the three mandatory channels, document sale, briefing and site visit, addenda",
        "Bids: submission and receipt, with correct handling of late offers",
        "Opening: dual control, the opening schedule and the grand summary",
        "Evaluation: the configured scoring model and the evaluation report",
        "Approvals and award: the routing already built, ending in an award instrument",
      ]}
    />
  );
}
