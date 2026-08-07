import { NotBuilt } from "@/components/not-built";

export default function ProjectsPage() {
  return (
    <NotBuilt
      title="Projects"
      summary="Contract administration after award, where the money actually moves."
      willInclude={[
        "Milestones and payments: valuation, interim certificates, retention, deductions and the payment waterfall",
        "Variations: the variation chain, percentage against contract sum, and committee recommendation",
        "Time and delays: extension of time, extension of contract period, and liquidated damages",
        "Quality and defects: site records, completion, partial occupation and making good defects",
        "Claims: contractor loss and expense",
        "Closure: final account, final certificate and release of retention",
        "Team: the Superintending Officer and any delegation of that authority",
      ]}
    />
  );
}
