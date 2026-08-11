import { NotBuilt } from "@/components/not-built";

export default function ReportsPage() {
  return (
    <NotBuilt
      title="Reports"
      summary="Reporting across sourcing, contracts and committee decisions."
      willInclude={[
        "Award cycle time, from advertisement to award",
        "Savings against the departmental estimate",
        "Committed and certified value by division, funding route and contract type",
        "Committee activity: sittings, quorum and decisions taken",
        "The audit trail: every approval, who took it and under which authority",
      ]}
    />
  );
}
