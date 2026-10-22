import type { FaultView } from "@/lib/portal/register/contract";

/**
 * Placing a step's findings beside its fields (Phase 4b; shared by the signed-in wizard and the public form, ADR 0041). A finding names its field (`documents.<row>.expiresOn`,
 * `creditor.bankCode`); a field shows the words of the findings that are about it, the blocking ones as its error and the rest as its note. Pure, and safe for the browser.
 */

/// The findings that belong to a field, or to the fields a test picks.
export function faultsAt(faults: readonly FaultView[], field: string | ((f: string | null) => boolean)): FaultView[] {
  return faults.filter((f) => (typeof field === "string" ? f.field === field : field(f.field)));
}

/// The words of the blocking findings, joined, or undefined where there are none: what stops the step.
export const errorText = (fs: readonly FaultView[]): string | undefined => {
  const blocking = fs.filter((f) => f.level === "block");
  return blocking.length ? blocking.map((f) => f.message).join(" ") : undefined;
};

/// The words of the findings that do not block, joined, or undefined where there are none.
export const noteText = (fs: readonly FaultView[]): string | undefined => {
  const rest = fs.filter((f) => f.level !== "block");
  return rest.length ? rest.map((f) => f.message).join(" ") : undefined;
};
