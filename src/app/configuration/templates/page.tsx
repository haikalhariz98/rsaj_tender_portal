import { NotBuilt } from "@/components/not-built";

export default function TemplatesPage() {
  return (
    <NotBuilt
      title="Templates"
      summary="The certificates, letters and routing sheets the portal issues. A generated form has to stand next to the printed one it replaces."
      willInclude={[
        "The template behind each certificate and letter, with its form code and revision date",
        "Fidelity to the controlled printed form: field order, labels, page numbering, tick-box and strike-out conventions, and the signature block",
        "Bilingual label pairs, where a form is issued in two languages on one page",
        "Which fields the system fills, which the officer completes, and which must never be editable after issue",
        "Revisions, so a certificate issued last year still renders on the template that was current when it was issued",
      ]}
    />
  );
}
