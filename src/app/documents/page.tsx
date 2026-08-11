import { NotBuilt } from "@/components/not-built";

export default function DocumentsPage() {
  return (
    <NotBuilt
      title="Documents"
      summary="Certificates, letters and routing sheets issued and received."
      willInclude={[
        "Library: the generated document register with versions and controlled copies",
        "Templates: the certificates and routing sheets, to printed-form fidelity, in Malay and English",
        "Review queue: submissions from contractors routed to an officer, against a service level",
        "Distribution: who each document went to, and when it was despatched",
      ]}
    />
  );
}
