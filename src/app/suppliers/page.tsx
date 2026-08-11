import { NotBuilt } from "@/components/not-built";

export default function SuppliersPage() {
  return (
    <NotBuilt
      title="Suppliers"
      summary="Registered suppliers, their standing and their performance."
      willInclude={[
        "Registry: registered companies with their statutory documents and expiry dates",
        "Prequalification: eligibility against CIDB grade, MOF field code, SPAN permit and Bumiputera status",
        "Submissions inbox and review queue: registration applications awaiting verification",
        "Standing: suspension, reinstatement and blacklisting, with the effect each has on eligibility",
        "Performance: contractor performance reports and the resulting grade",
      ]}
    />
  );
}
