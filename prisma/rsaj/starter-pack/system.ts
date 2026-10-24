/**
 * RSAJ starter pack, system (plan step 4.6): the RSAJ numbering patterns the documents state and the product can place, STATED. Each series is
 * its own list, scoped by its key, so it loads beside the generic pack's series rather than in place of them.
 *
 * Placed: the contract numbers (FR-CON-002), which the contract types reach through `ContractType.contractSeriesKey` (purchasing.ts: work,
 * service and supply RSAJ/KP/T, consultancy services RSAJ/KP/P, RSAJ answer 21); the tender number (RSAJ answer 22), which the two tender methods
 * name through `SourcingMethod.exerciseSeriesKey`; and the direct-appointment dossier's number (FR-MTD-009), which the direct appointment names
 * through `SourcingMethod.dossierSeriesKey`. Not loaded: the quotation number RSAJ/KP/Q(JB|MR|IP)/NNN/YY (what JB, MR and IP stand for is open)
 * and an addendum pattern (FR-ADV-014 states none).
 */

import { list, type Cited } from "./shape";

const series = (key: string, nameEn: string, pattern: string, notes: string, cited: Cited) =>
  list("NumberingSeries", "Numbering", [{ code: key, values: { nameEn, pattern, padding: 2, resetOn: "CALENDAR_YEAR", notes }, ...cited }], { key });

/// SK004 §7.2.1: numbered from 01 again in the year the contract starts; the product starts again each calendar year of allocation.
const CONTRACT = { requirement: "FR-CON-002, NFR-USE-004", source: "SK004 §7.2.1" };
const CONTRACT_NOTES = "Numbered from 01 again each year (SK004 §7.2.1).";

export const SYSTEM = {
  lists: [
    series("contract_tender", "Contracts (tender)", "RSAJ/KP/T/{SERIAL}/{YEAR}", CONTRACT_NOTES, CONTRACT),
    series("contract_consultancy", "Contracts (consultancy)", "RSAJ/KP/P/{SERIAL}/{YEAR}", CONTRACT_NOTES, CONTRACT),
    // Specification §9.5 prints NNN; RSAJ's answer prints NN, so the serial is padded to two (RSAJ question 22 asks which).
    series("exercise_tender", "Tender exercises", "RSAJ/TA/{SERIAL}/{YEAR}", "Padded to two digits as RSAJ's answer prints it (specification §9.5 prints three).", { requirement: "FR-ADV-001, NFR-USE-004", source: "RSAJ answer 22 (2026-10-24); specification §9.5" }),
    // Restarting each year is a reading of the YY in the pattern, not a stated rule.
    series("direct_appointment", "Direct appointment dossiers", "RSAJ/KP/ST/{SERIAL}/{SHORTYEAR}", "Restarts each calendar year: a reading of the year in the pattern, not a stated rule.", { requirement: "FR-MTD-009, NFR-USE-004", source: "FR-MTD-009; specification §9.5 (RSAJ/KP/ST/NN/YY)" }),
  ],
  groups: [],
};
