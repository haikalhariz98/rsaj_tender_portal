/**
 * RSAJ starter pack, system (plan step 4.6): the RSAJ numbering patterns the documents state and the product can place, STATED. Each series is
 * its own list, scoped by its key, so it loads beside the generic pack's series rather than in place of them.
 *
 * Only the contract numbers (FR-CON-002) are placed. A contract type reaches its series through `ContractType.contractSeriesKey`, which this
 * pack does not set: which product contract type is "consultancy" is not stated. The other generated patterns of specification §9.5
 * (RSAJ/TA/NNN/YYYY, RSAJ/KP/Q(JB|MR|IP)/NNN/YY, RSAJ/KP/ST/NN/YY) do not match one product series each, and FR-ADV-014 states no addendum
 * pattern: all are open questions for RSAJ.
 */

import { list } from "./shape";

/// SK004 §7.2.1: numbered from 01 again in the year the contract starts; the product starts again each calendar year of allocation.
const CONTRACT = { requirement: "FR-CON-002, NFR-USE-004", source: "SK004 §7.2.1" };
const series = (key: string, nameEn: string, pattern: string) =>
  list("NumberingSeries", "Numbering", [{ code: key, values: { nameEn, pattern, padding: 2, resetOn: "CALENDAR_YEAR", notes: "Numbered from 01 again each year (SK004 §7.2.1)." }, ...CONTRACT }], { key });

export const SYSTEM = {
  lists: [series("contract_tender", "Contracts (tender)", "RSAJ/KP/T/{SERIAL}/{YEAR}"), series("contract_consultancy", "Contracts (consultancy)", "RSAJ/KP/P/{SERIAL}/{YEAR}")],
  groups: [],
};
