import { NotBuilt } from "@/components/not-built";

export default function BudgetPage() {
  return (
    <NotBuilt
      title="Budget"
      summary="Allocations, commitments and the balance a requirement is checked against."
      willInclude={[
        "Allocations by cost centre and account code, and the period each belongs to",
        "The availability check a requisition must pass, storing the balance, the approved amount and the projected balance as at the moment it was checked",
        "Commitments raised against an allocation, so the balance reflects what is already spoken for",
        "What happens when a matter exceeds its allocation — a policy switch, not a rule in code, because customers escalate this differently",
        "The funding route, which decides whether the organisation procures at all or only records an outcome",
      ]}
    />
  );
}
