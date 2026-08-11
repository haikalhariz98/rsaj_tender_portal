import { NotBuilt } from "@/components/not-built";

export default function UsersPage() {
  return (
    <NotBuilt
      title="Users & roles"
      summary="Officers, the offices they hold, and what each may see. A person is not a role, and a role is not a sign-in."
      willInclude={[
        "The register of people, held separately from sign-in — identity outlives any one account",
        "Offices and the assignments that fill them, effective-dated, so an acting appointment is a period rather than an edit",
        "What each office may see and do, including the officers who configure the system but may not approve, certify or transact",
        "Recusal: an officer may not approve a matter in which they are the requester or the beneficiary, and the escalation that applies when they cannot",
        "Delegation and its limits, including offices where no sub-delegation is permitted",
      ]}
    />
  );
}
