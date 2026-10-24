/// What a numbering series can number: the keys the product issues references under, by the
/// name an officer reads. A key is a configuration key and never reaches a screen. `direct_appointment`
/// is the dossier series the sourcing methods are configured with; the rest are named in code
/// (`issueReference` call sites), so a series added here under one of them is the one that is read.
export const KNOWN_SERIES: readonly { key: string; label: string }[] = [
  { key: "requisition", label: "Requisitions" },
  { key: "exercise", label: "Sourcing exercises" },
  { key: "award", label: "Awards" },
  { key: "contract", label: "Contracts" },
  { key: "contract_matter", label: "Contract matters" },
  { key: "variation", label: "Variations" },
  { key: "certificate", label: "Certificates" },
  { key: "meeting", label: "Committee sittings" },
  { key: "supplier", label: "Supplier registrations" },
  { key: "portal_application", label: "Supplier portal applications" },
  { key: "direct_appointment", label: "Direct appointment dossiers" },
];

/// The list for a new series: every known key not already taken.
export function seriesKeyOptions(taken: readonly string[]): { value: string; label: string }[] {
  return KNOWN_SERIES.filter((s) => !taken.includes(s.key)).map((s) => ({ value: s.key, label: s.label }));
}
