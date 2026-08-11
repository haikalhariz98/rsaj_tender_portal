import { NotBuilt } from "@/components/not-built";

export default function NumberingPage() {
  return (
    <NotBuilt
      title="Numbering"
      summary="How exercise, contract and certificate references are formed."
      willInclude={[
        "Series definitions: the segments a reference is built from, their order, and the separator between them",
        "When a serial resets — by calendar year, by financial year, or never — and which date decides it",
        "A separate series per record type, since contracts, exercises and certificates are numbered on different rules",
        "The moment a number is allocated, which for a contract is the issue of the award instrument and not before",
        "Allocated numbers are never reused, and a gap is recorded rather than closed up",
      ]}
    />
  );
}
