import type { SulitScope } from "@/lib/sulit-fields";
import { isSulitField } from "@/lib/sulit-fields";

import { fieldIsFor, sulitWithheld, through, type Sulit } from "./sulit-access";

/**
 * A registered SULIT field's change as a History trail shows it (Phase 3b; 6.2 condition 3). The trail is read on the page of one record, and that record's gate
 * (`Sulit<true>`, asked once for the page) judges the fields that kind of record carries. A SULIT field the page's record does not carry is not shown at all:
 * nothing is shown on a guess. Null for a field that is not registered, which the trail draws as it always did.
 *
 * Pure: the text is what the trail would have printed, and is returned only where the gate is granted.
 */
export function sulitHistoryValue(field: string, scope: SulitScope, gate: Sulit<true>, text: string): Sulit<string> | null {
  if (!isSulitField(field)) return null;
  if (!fieldIsFor(field, scope)) return sulitWithheld<string>("FIELD_NOT_FOR_THIS_RECORD", scope);
  return through(gate, text);
}
