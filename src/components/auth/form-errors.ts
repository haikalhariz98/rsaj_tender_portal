import type { FormState } from "@/components/record-editor";

/// The answer without what it said about one field. The same object when it said nothing about that field, so a keystroke in a field that was not refused
/// changes nothing and draws nothing again.
export function withoutError(state: FormState, field: string): FormState {
  if (!state.errors || !(field in state.errors)) return state;
  return { ...state, errors: Object.fromEntries(Object.entries(state.errors).filter(([name]) => name !== field)) };
}
