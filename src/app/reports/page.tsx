import { NotBuilt } from "@/components/not-built";

export default function ReportsPage() {
  return (
    <NotBuilt
      title="Reports"
      summary="Where the numbers come from, and the evidence behind every decision."
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
