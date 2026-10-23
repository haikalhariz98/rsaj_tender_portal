import type { ChecklistItem, ChecklistState } from "./types";

/// The name `npm run setup` gives a new organisation until the customer replaces it.
export const SETUP_PLACEHOLDER_NAME = "Your organisation";

export interface MatrixFact {
  issued: boolean;
  effectiveFrom: string; // a day, YYYY-MM-DD
  effectiveTo: string | null;
  issuedBy: { name: string; at: Date } | null;
  offices: readonly string[]; // every office named on a rule
}

/// Everything the checklist judges, read by `checklist-repo.ts`; plain data so each rule is tested from facts.
export interface ChecklistFacts {
  today: string;
  twoPersonOn: boolean;
  organisation: { name: string; registrationNo: string | null; address: string | null; hasLogo: boolean };
  orgUnits: number;
  costCentres: number;
  matrices: readonly MatrixFact[];
  officesHeldToday: readonly string[];
  assignmentsToday: number;
  committees: readonly { quorum: number | null; liveMembers: number }[]; // live committees only
  documentFeeFloors: number;
  holidays: { calendarSet: boolean; yearRow: boolean; thisYear: number };
  evaluation: { issued: number; draft: number; issuedBy: { name: string; at: Date } | null };
  supplierDocumentTypes: number;
  declarationsFirm: number; // of terms, false-declaration and GIRO: how many have a current text that is not ASSUMED
  personalDataNoticeFirm: boolean;
  helpContact: boolean;
  registration: { open: boolean; missing: readonly string[] }; // the public register, by the one reader the portal uses
  letterSlotsSet: number;
  letterSlots: number;
  budgetCheckSet: boolean;
}

const filled = (s: string | null) => !!s && s.trim() !== "";
const stateOf = (done: boolean): ChecklistState => (done ? "done" : "todo");

/// The matrix in force today, or else the draft: the one whose offices item 3 asks about.
export function matrixInForce(facts: Pick<ChecklistFacts, "today" | "matrices">): MatrixFact | undefined {
  const live = facts.matrices.filter((m) => m.issued && m.effectiveFrom <= facts.today && (m.effectiveTo == null || m.effectiveTo >= facts.today));
  return live.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/// Every item with its state, in the order the page shows them. Item 13 (email sender) is not here: it is hidden until step 7 builds email (SP-15).
export function buildChecklist(f: ChecklistFacts): ChecklistItem[] {
  const inForce = matrixInForce(f);
  const draft = f.matrices.find((m) => !m.issued);
  const named = inForce ?? draft;
  const held = new Set(f.officesHeldToday);
  const peopleDone = named && named.offices.length > 0 ? named.offices.every((o) => held.has(o)) : f.assignmentsToday > 0;
  const o = f.organisation;
  const matrix: ChecklistState = inForce?.issuedBy ? "done" : inForce || draft ? "confirm" : "todo";
  const evaluation: ChecklistState = f.evaluation.issued > 0 ? "done" : f.evaluation.draft > 0 ? "confirm" : "todo";
  return [
    { key: "organisation", section: "people", kind: "set", label: "Organisation details and logo", href: "/configuration/organisation", state: stateOf(o.name.trim() !== SETUP_PLACEHOLDER_NAME && filled(o.name) && filled(o.registrationNo) && filled(o.address) && o.hasLogo), detail: "Name, registration number, address and logo, as they appear on letters." },
    { key: "units", section: "people", kind: "set", label: "Units and cost centres", href: "/configuration/organisation", state: stateOf(f.orgUnits > 0 && f.costCentres > 0), detail: "At least one unit and one cost centre." },
    { key: "people", section: "people", kind: "set", label: "People and their roles", href: "/configuration/users", state: stateOf(!!peopleDone), detail: "Every office on the approval limits needs someone holding it today." },
    { key: "limits", section: "approvals", kind: "confirm", label: "Confirm approval limits", href: "/configuration/approval-matrix", state: matrix, confirmedBy: matrix === "done" ? inForce?.issuedBy ?? undefined : undefined, detail: "Limits are in place only once a named person has issued them." },
    { key: "committees", section: "approvals", kind: "set", label: "Committee members", href: "/configuration/committees", state: stateOf(f.committees.length > 0 && f.committees.every((c) => c.liveMembers >= (c.quorum ?? 1))), detail: "Each committee needs at least its quorum of members, or one where no quorum is set." },
    { key: "fees", section: "purchasing", kind: "set", label: "Document fees", href: "/configuration/invitation", state: stateOf(f.documentFeeFloors > 0), detail: "The lowest fee for tender and quotation documents." },
    { key: "holidays", section: "purchasing", kind: "set", label: "This year's public holidays", href: "/configuration/invitation", state: stateOf(f.holidays.calendarSet && f.holidays.yearRow && f.holidays.thisYear > 0), detail: "Closing dates are checked against weekends and public holidays." },
    { key: "evaluation", section: "purchasing", kind: "confirm", label: "Evaluation models", href: "/configuration/evaluation", state: evaluation, confirmedBy: evaluation === "done" ? f.evaluation.issuedBy ?? undefined : undefined, detail: "A model is in use only once it is issued." },
    { key: "documents", section: "suppliers-portal", kind: "set", label: "Supplier document types", href: "/configuration/suppliers", state: stateOf(f.supplierDocumentTypes > 0), detail: "What a supplier must upload to register." },
    { key: "declarations", section: "suppliers-portal", kind: "set", label: "Declaration wording", href: "/configuration/suppliers", state: stateOf(f.declarationsFirm === 3), detail: "Terms, false-declaration and GIRO texts, written by you. Starting wording does not count." },
    { key: "notice", section: "suppliers-portal", kind: "set", label: "Personal data notice", href: "/configuration/suppliers", state: stateOf(f.personalDataNoticeFirm), detail: "Shown to suppliers when they register. Starting wording does not count." },
    { key: "help", section: "suppliers-portal", kind: "set", label: "Supplier help contact", href: "/configuration/suppliers", state: stateOf(f.helpContact), detail: "An email or phone number suppliers can reach." },
    { key: "registration", section: "suppliers-portal", kind: "set", label: f.registration.open ? "Online registration: open" : "Online registration: closed", href: "/configuration/suppliers", state: stateOf(f.registration.open), detail: f.registration.open ? "Suppliers can apply online." : `Suppliers see "Registration opens soon". Still to set: ${f.registration.missing.slice(0, 3).join(", ") || "the organisation"}${f.registration.missing.length > 3 ? ` and ${f.registration.missing.length - 3} more` : ""}.` },
    { key: "letters", section: "system", kind: "set", label: "Letter templates", href: "/configuration/templates", state: stateOf(f.letterSlots > 0 && f.letterSlotsSet === f.letterSlots), detail: "Every template that notices, invitations and award letters use." },
    { key: "budget", section: "contracts-payments", kind: "set", label: "Budget check source", href: "/configuration/budget?tab=controls", state: stateOf(f.budgetCheckSet), detail: "Where a requisition's budget is checked (FR-REQ-007)." },
    {
      key: "two-person",
      section: "system",
      kind: "go-live",
      label: "Turn on approval by another admin before go-live",
      href: "/configuration/security",
      state: stateOf(f.twoPersonOn),
      detail: "Until then one person can put changes in force. Each is recorded.",
      also: f.twoPersonOn ? undefined : { label: "Changes made by one person", href: "/configuration/audit?filter=one-person" },
    },
  ];
}

/// "n of m" for the meter; the go-live item counts like the rest.
export const progressOf = (items: readonly ChecklistItem[]) => ({ done: items.filter((i) => i.state === "done").length, total: items.length });
