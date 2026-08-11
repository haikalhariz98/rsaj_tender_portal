import { NotBuilt } from "@/components/not-built";

export default function SupplierProjectsPage() {
  return (
    <NotBuilt
      title="My Projects"
      summary="Contracts held, and the amounts outstanding on each."
      willInclude={[
        "Progress against the programme of works",
        "Interim claims and materials-on-site lists",
        "Certificates issued, and amounts certified against amounts paid",
        "Variation and adjustment certificates to sign or dispute",
        "Notices: delay causes, defects to rectify, and the statutory declaration at close",
      ]}
    />
  );
}
