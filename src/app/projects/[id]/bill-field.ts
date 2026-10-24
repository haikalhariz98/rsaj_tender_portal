import type { Field } from "@/components/record-editor";

/// The bill a contract was tendered on, as a form is given it (`billItemOptions`).
export type Bill = { options: { value: string; label: string }[]; truncated: boolean };

/// A field naming an item of the contract's bill: a searchable pick-list where the bill is pinned and short enough to list, else the reference typed, as before.
export function billItemField(name: string, label: string, bill: Bill | undefined, o: { required?: boolean; hint?: string; mono?: boolean } = {}): Field {
  if (bill && bill.options.length > 0 && !bill.truncated) {
    return { kind: "select", name, label, required: o.required, hint: o.hint, placeholder: "Choose an item", searchable: true, options: bill.options };
  }
  return { kind: "text", name, label, required: o.required, hint: o.hint, mono: o.mono };
}
