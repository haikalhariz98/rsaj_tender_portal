import { NotBuilt } from "@/components/not-built";

export default function OrganisationPage() {
  return (
    <NotBuilt
      title="Organisation"
      summary="The structure every other rule is written against: who sits where, and which office holds which budget."
      willInclude={[
        "The unit hierarchy — company, division, department, section — with the effective dates that make a reorganisation a revision rather than an overwrite",
        "Cost centres and account codes, with the format each customer validates against rather than one hard-coded pattern",
        "Sites and places of delivery, for requisition and for the certificates that name them",
        "Which unit a matter belongs to, since the approval matrix routes on it",
        "Provenance on every entry: stated in a governing document, observed in practice, or assumed",
      ]}
    />
  );
}
