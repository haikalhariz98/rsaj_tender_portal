/**
 * Judging a customer's master-data workbook (RSAJ's template: one tab per thing, row 1 the column names, row 2 hints, data from row 3).
 * Pure: it takes the tabs as text and what the organisation already holds, and returns what would be written, what is skipped and every fault
 * with its tab, row and column. Nothing is guessed: a cell that cannot be read as it stands is a fault, and one fault anywhere refuses the whole run.
 *
 * A row whose code is already on the organisation is skipped, never changed (fill-only: an existing value may be in use). Cross-tab references are
 * checked against the file and against what is already stored, so a later run that adds only office holders still finds the staff loaded before.
 * A fault message never repeats a cell's value: staff rows are personal data.
 */

import { dayToDate, isDay } from "@/lib/dates";

export const SOURCE = "RSAJ master data workbook";

export const COLUMNS = {
  Organisation: ["Legal name", "Short name", "Registration number", "Tax reference", "Address", "Telephone", "Financial year starts"],
  "Org units": ["Unit code", "Unit name", "Kind", "Parent unit code", "Cost centre code", "Head (staff no)"],
  "Cost centres": ["Cost centre code", "Cost centre name", "Org unit code", "Site code", "Activity", "Owner (staff no)"],
  Sites: ["Site code", "Site name", "Kind", "Address", "Town", "District", "Org unit code"],
  "Main accounts": ["Account code", "Account name"],
  "Budget codes": ["Budget code", "Description", "Type", "Owning unit code", "Main account code", "Holder (staff no)", "Active"],
  "Budget allocations": ["Budget code", "Year", "Movement", "Amount (RM)", "Date", "Reference", "Note"],
  "Funding sources": ["Funding code", "Funding name", "Total available (RM)", "Allowed project categories", "Source document"],
  "Project categories": ["Category code", "Category name", "Source document"],
  Staff: ["Staff no", "Full name", "Email", "Job title", "Org unit code", "Telephone", "Active"],
  "Office holders": ["Staff no", "Office", "For unit code", "Acting", "From", "To"],
  "Committee members": ["Committee", "Staff no", "Position", "Alternate", "Appointment reference", "From", "To"],
} as const;
export type TabName = keyof typeof COLUMNS;
export const TAB_ORDER = Object.keys(COLUMNS) as TabName[];

export interface RawRow {
  /// The row's number in the sheet, for the fault that names it.
  row: number;
  cells: Record<string, string>;
}
export interface RawTab {
  headers: string[];
  rows: RawRow[];
}
export type RawBook = Partial<Record<TabName, RawTab>>;

export interface Fault {
  tab: string;
  row: number;
  column: string;
  reason: string;
}
export interface TabReport {
  tab: TabName;
  read: number;
  write: number;
  skipped: number;
  faults: number;
  /// The tab has no data rows: expected while the file is incomplete, not a fault.
  empty: boolean;
}

/// What the organisation already holds, as the keys the plan skips on and checks references against.
export interface Known {
  organisationExists: boolean;
  hasCompanyUnit: boolean;
  units: ReadonlySet<string>;
  costCentres: ReadonlySet<string>;
  sites: ReadonlySet<string>;
  accounts: ReadonlySet<string>;
  budgetCodes: ReadonlySet<string>;
  staff: ReadonlySet<string>;
  funding: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  years: ReadonlySet<number>;
  /// Lower-cased name of an office or committee -> its code, from the organisation's own roles and committees.
  offices: ReadonlyMap<string, string>;
  committees: ReadonlyMap<string, string>;
  movementKeys: ReadonlySet<string>;
  holderKeys: ReadonlySet<string>;
  seatKeys: ReadonlySet<string>;
}
export const emptyKnown = (): Known => ({
  organisationExists: false,
  hasCompanyUnit: false,
  units: new Set(),
  costCentres: new Set(),
  sites: new Set(),
  accounts: new Set(),
  budgetCodes: new Set(),
  staff: new Set(),
  funding: new Set(),
  categories: new Set(),
  years: new Set(),
  offices: new Map(),
  committees: new Map(),
  movementKeys: new Set(),
  holderKeys: new Set(),
  seatKeys: new Set(),
});

type Src = { row: number; source: string };
export interface OrganisationW { name: string; shortName: string | null; company: { registrationNumber: string | null; taxReference: string | null; telephone: string | null; address: string; financialYearStart: string | null } }
export interface UnitW extends Src { code: string; nameEn: string; kind: "COMPANY" | "DIVISION" | "DEPARTMENT" | "SECTION"; parentCode: string | null; costCentreCode: string | null; headStaffNo: string | null }
export interface CostCentreW extends Src { code: string; nameEn: string; orgUnitCode: string | null; siteCode: string | null; activity: string; ownerStaffNo: string | null }
export interface SiteW extends Src { code: string; nameEn: string; kind: string; address: string; town: string; district: string; orgUnitCode: string | null }
export interface AccountW extends Src { code: string; nameEn: string }
export interface BudgetCodeW extends Src { code: string; descriptionEn: string; type: string; owningUnitCode: string | null; accountCode: string; holderStaffNo: string | null; isActive: boolean }
export interface MovementW extends Src { budgetCode: string; year: number; kind: "ORIGINAL" | "REVISION" | "TRANSFER_IN" | "TRANSFER_OUT"; amount: string; occurredOn: string; reference: string; description: string }
export interface FundingW extends Src { code: string; nameEn: string; envelope: string | null; eligibleCategoryCodes: string[] }
export interface CategoryW extends Src { code: string; nameEn: string }
export interface StaffW extends Src { staffNo: string; name: string; email: string | null; jobTitle: string | null; orgUnitCode: string | null; telephone: string | null; isActive: boolean }
export interface HolderW extends Src { staffNo: string; roleCode: string; scope: string | null; from: string | null; to: string | null }
export interface SeatW extends Src { committeeCode: string; staffNo: string; position: "CHAIRMAN" | "DEPUTY_CHAIRMAN" | "MEMBER" | "SECRETARY"; isAlternate: boolean; appointmentRef: string | null; from: string | null; to: string | null }

export interface Writes {
  organisation: OrganisationW | null;
  units: UnitW[];
  costCentres: CostCentreW[];
  sites: SiteW[];
  accounts: AccountW[];
  budgetCodes: BudgetCodeW[];
  years: number[];
  movements: MovementW[];
  funding: FundingW[];
  categories: CategoryW[];
  staff: StaffW[];
  holders: HolderW[];
  seats: SeatW[];
}
export interface MasterPlan {
  reports: TabReport[];
  faults: Fault[];
  writes: Writes;
}

const UNIT_KINDS = { company: "COMPANY", division: "DIVISION", department: "DEPARTMENT", section: "SECTION" } as const;
const MOVEMENTS = { original: "ORIGINAL", revision: "REVISION", "transfer in": "TRANSFER_IN", "transfer out": "TRANSFER_OUT" } as const;
const POSITIONS = { chairman: "CHAIRMAN", "deputy chairman": "DEPUTY_CHAIRMAN", member: "MEMBER", secretary: "SECRETARY" } as const;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

/// 250000 -> "250000.00", the form the database keeps, so a re-run matches what it stored.
const fixed2 = (v: string) => {
  const [i, f = ""] = v.split(".");
  return `${i.replace(/^0+(?=\d)/, "")}.${(f + "00").slice(0, 2)}`;
};

/// DD-MM-YYYY, exactly, to YYYY-MM-DD. Null: not a real calendar day in that form.
export function readDate(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  const day = m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  return m && isDay(day) ? day : null;
}
/// "DD-MM" (day and month, as the template says), to the "MM-DD" the organisation screen keeps. 29-02 is allowed: a financial year may start on it.
export function readYearStart(text: string): string | null {
  const m = /^(\d{2})-(\d{2})$/.exec(text);
  return m && isDay(`2024-${m[2]}-${m[1]}`) ? `${m[2]}-${m[1]}` : null;
}

export function planMasterData(book: RawBook, known: Known): MasterPlan {
  const faults: Fault[] = [];
  const reports: TabReport[] = [];
  const writes: Writes = { organisation: null, units: [], costCentres: [], sites: [], accounts: [], budgetCodes: [], years: [], movements: [], funding: [], categories: [], staff: [], holders: [], seats: [], };

  const tabRows = (tab: TabName): RawRow[] => {
    const t = book[tab];
    if (!t) {
      faults.push({ tab, row: 1, column: "", reason: "The tab is not in the file." });
      return [];
    }
    const missing = COLUMNS[tab].filter((c) => !t.headers.includes(c));
    for (const c of missing) faults.push({ tab, row: 1, column: c, reason: "The column is missing or renamed. Columns are not added, renamed or reordered." });
    return missing.length > 0 ? [] : t.rows;
  };

  /// Runs one tab: `each` judges a row, returning "write" or "skip", and adds its faults through `bad`.
  const run = (tab: TabName, each: (r: RawRow, bad: (column: string, reason: string) => void) => "write" | "skip") => {
    const rows = tabRows(tab);
    const before = faults.length;
    const rep: TabReport = { tab, read: rows.length, write: 0, skipped: 0, faults: 0, empty: rows.length === 0 && book[tab] !== undefined };
    for (const r of rows) {
      const own: Fault[] = [];
      const outcome = each(r, (column, reason) => own.push({ tab, row: r.row, column, reason }));
      faults.push(...own);
      if (own.length === 0) rep[outcome === "write" ? "write" : "skipped"]++;
    }
    rep.faults = faults.length - before;
    reports.push(rep);
  };

  const cell = (r: RawRow, c: string) => (r.cells[c] ?? "").trim();
  const opt = (r: RawRow, c: string) => cell(r, c) || null;
  const src = (r: RawRow, doc?: string | null): Src => ({ row: r.row, source: doc ? `${SOURCE}; ${doc}` : SOURCE });

  // Codes in the file (every row, including one skipped for already being stored) join what is stored, for reference checks.
  const inFile = (tab: TabName, col: string) => new Set(tabRows0(tab).map((r) => (r.cells[col] ?? "").trim()).filter(Boolean));
  const tabRows0 = (tab: TabName) => book[tab]?.rows ?? [];
  const union = (a: ReadonlySet<string>, b: Set<string>) => new Set([...a, ...b]);
  const units = union(known.units, inFile("Org units", "Unit code"));
  const costCentres = union(known.costCentres, inFile("Cost centres", "Cost centre code"));
  const sites = union(known.sites, inFile("Sites", "Site code"));
  const accounts = union(known.accounts, inFile("Main accounts", "Account code"));
  const budgetCodes = union(known.budgetCodes, inFile("Budget codes", "Budget code"));
  const staff = union(known.staff, inFile("Staff", "Staff no"));
  const categories = union(known.categories, inFile("Project categories", "Category code"));

  const seen = new Map<string, Set<string>>();
  /// True the first time a key is seen on a tab; a repeat is a fault the caller reports.
  const first = (tab: string, key: string) => {
    const s = seen.get(tab) ?? new Set<string>();
    seen.set(tab, s);
    if (s.has(key)) return false;
    s.add(key);
    return true;
  };
  const need = (r: RawRow, bad: (c: string, m: string) => void, c: string) => {
    const v = cell(r, c);
    if (!v) bad(c, "Required, and blank.");
    return v;
  };
  const ref = (r: RawRow, bad: (c: string, m: string) => void, c: string, set: ReadonlySet<string>, where: string, secret = false) => {
    const v = cell(r, c);
    if (v && !set.has(v)) bad(c, secret ? `Not on the ${where} sheet or already stored.` : `"${v}" is not on the ${where} sheet or already stored.`);
    return v || null;
  };
  const yesNo = (r: RawRow, bad: (c: string, m: string) => void, c: string, blankIs: boolean | null) => {
    const v = cell(r, c).toLowerCase();
    if (v === "yes") return true;
    if (v === "no") return false;
    if (v === "" && blankIs !== null) return blankIs;
    bad(c, 'Pick "Yes" or "No" from the list.');
    return false;
  };
  const money = (r: RawRow, bad: (c: string, m: string) => void, c: string, required: boolean) => {
    const v = cell(r, c);
    if (!v) {
      if (required) bad(c, "Required, and blank.");
      return null;
    }
    if (!MONEY.test(v) || Number(v) <= 0) bad(c, "Write money as a plain positive number with at most two decimals: no commas, no RM.");
    return fixed2(v);
  };
  const date = (r: RawRow, bad: (c: string, m: string) => void, c: string, required: boolean) => {
    const v = cell(r, c);
    if (!v) {
      if (required) bad(c, "Required, and blank.");
      return null;
    }
    const d = readDate(v);
    if (!d) bad(c, "Write the date as DD-MM-YYYY, a real day.");
    return d;
  };
  const period = (from: string | null, to: string | null, bad: (c: string, m: string) => void) => {
    if (from && to && to < from) bad("To", "Ends before it starts.");
  };

  // ---- Organisation
  run("Organisation", (r, bad) => {
    if (writes.organisation) {
      bad("Legal name", "Only one row is read: RSAJ itself.");
      return "skip";
    }
    const name = need(r, bad, "Legal name");
    const fy = opt(r, "Financial year starts");
    const fyStored = fy ? readYearStart(fy) : null;
    if (fy && !fyStored) bad("Financial year starts", "Write the day and month as DD-MM, a real day.");
    if (name) writes.organisation = { name, shortName: opt(r, "Short name"), company: { registrationNumber: opt(r, "Registration number"), taxReference: opt(r, "Tax reference"), telephone: opt(r, "Telephone"), address: cell(r, "Address"), financialYearStart: fyStored } };
    return known.organisationExists ? "skip" : "write"; // an organisation already there is left as it is
  });
  if (!writes.organisation && !known.organisationExists && !faults.some((f) => f.tab === "Organisation")) faults.push({ tab: "Organisation", row: 3, column: "Legal name", reason: "The organisation does not exist yet and this tab names it. Fill it." });

  // ---- Org units
  const fileUnits = new Map<string, string | null>();
  for (const r of tabRows0("Org units")) fileUnits.set(cell(r, "Unit code"), opt(r, "Parent unit code"));
  let companyInFile = false;
  run("Org units", (r, bad) => {
    const code = need(r, bad, "Unit code");
    const nameEn = need(r, bad, "Unit name");
    const kind = UNIT_KINDS[cell(r, "Kind").toLowerCase() as keyof typeof UNIT_KINDS];
    if (!kind) bad("Kind", "Pick the kind from the list.");
    const parent = ref(r, bad, "Parent unit code", units, "Org units");
    if (kind === "COMPANY" && parent) bad("Parent unit code", "The company has no parent.");
    if (kind && kind !== "COMPANY" && !parent) bad("Parent unit code", "Only the company has no parent.");
    if (code && parent) {
      for (let at: string | null | undefined = parent, n = 0; at; at = fileUnits.get(at), n++) if (at === code || n > 100) { bad("Parent unit code", "The parent chain loops back to this unit."); break; }
    }
    if (kind === "COMPANY" && !known.units.has(code)) {
      if (known.hasCompanyUnit || companyInFile) bad("Kind", "The organisation already has its company row.");
      companyInFile = true;
    }
    const cc = cell(r, "Cost centre code") ? ref(r, bad, "Cost centre code", costCentres, "Cost centres") : null;
    const head = ref(r, bad, "Head (staff no)", staff, "Staff", true);
    if (code && !first("Org units", code)) bad("Unit code", "Repeated in the file.");
    if (!code || !nameEn || !kind) return "skip";
    if (known.units.has(code)) return "skip";
    writes.units.push({ ...src(r), code, nameEn, kind, parentCode: parent, costCentreCode: cc, headStaffNo: head });
    return "write";
  });

  // ---- Cost centres, sites, accounts
  run("Cost centres", (r, bad) => {
    const code = need(r, bad, "Cost centre code");
    const nameEn = need(r, bad, "Cost centre name");
    const orgUnitCode = ref(r, bad, "Org unit code", units, "Org units");
    const siteCode = ref(r, bad, "Site code", sites, "Sites");
    const owner = ref(r, bad, "Owner (staff no)", staff, "Staff", true);
    if (code && !first("Cost centres", code)) bad("Cost centre code", "Repeated in the file.");
    if (!code || !nameEn || known.costCentres.has(code)) return "skip";
    writes.costCentres.push({ ...src(r), code, nameEn, orgUnitCode, siteCode, activity: cell(r, "Activity"), ownerStaffNo: owner });
    return "write";
  });
  run("Sites", (r, bad) => {
    const code = need(r, bad, "Site code");
    const nameEn = need(r, bad, "Site name");
    const orgUnitCode = ref(r, bad, "Org unit code", units, "Org units");
    if (code && !first("Sites", code)) bad("Site code", "Repeated in the file.");
    if (!code || !nameEn || known.sites.has(code)) return "skip";
    writes.sites.push({ ...src(r), code, nameEn, kind: cell(r, "Kind"), address: cell(r, "Address"), town: cell(r, "Town"), district: cell(r, "District"), orgUnitCode });
    return "write";
  });
  run("Main accounts", (r, bad) => {
    const code = need(r, bad, "Account code");
    const nameEn = need(r, bad, "Account name");
    if (code && !first("Main accounts", code)) bad("Account code", "Repeated in the file.");
    if (!code || !nameEn || known.accounts.has(code)) return "skip";
    writes.accounts.push({ ...src(r), code, nameEn });
    return "write";
  });

  // ---- Categories before funding (funding names them)
  run("Project categories", (r, bad) => {
    const code = need(r, bad, "Category code");
    const nameEn = need(r, bad, "Category name");
    if (code && !first("Project categories", code)) bad("Category code", "Repeated in the file.");
    if (!code || !nameEn || known.categories.has(code)) return "skip";
    writes.categories.push({ ...src(r, opt(r, "Source document")), code, nameEn });
    return "write";
  });
  run("Funding sources", (r, bad) => {
    const code = need(r, bad, "Funding code");
    const nameEn = need(r, bad, "Funding name");
    const envelope = money(r, bad, "Total available (RM)", false);
    const eligible = cell(r, "Allowed project categories").split(",").map((s) => s.trim()).filter(Boolean);
    for (const c of eligible) if (!categories.has(c)) bad("Allowed project categories", `"${c}" is not on the Project categories sheet or already stored.`);
    if (code && !first("Funding sources", code)) bad("Funding code", "Repeated in the file.");
    if (!code || !nameEn || known.funding.has(code)) return "skip";
    writes.funding.push({ ...src(r, opt(r, "Source document")), code, nameEn, envelope, eligibleCategoryCodes: eligible });
    return "write";
  });

  // ---- Staff
  run("Staff", (r, bad) => {
    const staffNo = need(r, bad, "Staff no");
    const name = need(r, bad, "Full name");
    const email = opt(r, "Email");
    if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) bad("Email", "Not an email address.");
    const orgUnitCode = ref(r, bad, "Org unit code", units, "Org units", true);
    const isActive = yesNo(r, bad, "Active", null);
    if (staffNo && !first("Staff", staffNo)) bad("Staff no", "Repeated in the file.");
    if (!staffNo || !name || known.staff.has(staffNo)) return "skip";
    writes.staff.push({ ...src(r), staffNo, name, email, jobTitle: opt(r, "Job title"), orgUnitCode, telephone: opt(r, "Telephone"), isActive });
    return "write";
  });

  // ---- Budget codes and allocations
  run("Budget codes", (r, bad) => {
    const code = need(r, bad, "Budget code");
    const descriptionEn = need(r, bad, "Description");
    const owningUnitCode = ref(r, bad, "Owning unit code", units, "Org units");
    const account = ref(r, bad, "Main account code", accounts, "Main accounts");
    const holder = ref(r, bad, "Holder (staff no)", staff, "Staff", true);
    const isActive = yesNo(r, bad, "Active", null);
    if (code && !first("Budget codes", code)) bad("Budget code", "Repeated in the file.");
    if (!code || !descriptionEn || known.budgetCodes.has(code)) return "skip";
    writes.budgetCodes.push({ ...src(r), code, descriptionEn, type: cell(r, "Type"), owningUnitCode, accountCode: account ?? "", holderStaffNo: holder, isActive });
    return "write";
  });
  run("Budget allocations", (r, bad) => {
    const budgetCode = ref(r, bad, "Budget code", budgetCodes, "Budget codes");
    if (!budgetCode) bad("Budget code", "Required, and blank.");
    const y = need(r, bad, "Year");
    const year = /^\d{4}$/.test(y) ? Number(y) : 0;
    if (y && !year) bad("Year", "Write the year as four digits.");
    const kind = MOVEMENTS[cell(r, "Movement").toLowerCase() as keyof typeof MOVEMENTS];
    if (!kind) bad("Movement", "Pick the movement from the list.");
    const amount = money(r, bad, "Amount (RM)", true);
    const occurredOn = date(r, bad, "Date", true);
    const reference = cell(r, "Reference");
    if (!budgetCode || !year || !kind || !amount || !occurredOn) return "skip";
    const key = [budgetCode, kind, occurredOn, amount, reference].join("|");
    if (!first("Budget allocations", key)) {
      bad("Budget code", "The same movement (code, kind, date, amount, reference) is already in the file.");
      return "skip";
    }
    if (known.movementKeys.has(key)) return "skip";
    if (!known.years.has(year) && !writes.years.includes(year)) writes.years.push(year);
    const note = cell(r, "Note");
    writes.movements.push({ ...src(r), budgetCode, year, kind, amount, occurredOn, reference, description: [`Budget year ${year}`, note].filter(Boolean).join(". ") });
    return "write";
  });

  // ---- Office holders and committee members
  run("Office holders", (r, bad) => {
    const staffNo = ref(r, bad, "Staff no", staff, "Staff", true);
    if (!staffNo) bad("Staff no", "Required, and blank.");
    const office = need(r, bad, "Office");
    const roleCode = known.offices.get(office.toLowerCase());
    if (office && !roleCode) bad("Office", "Not an office set up for this organisation. Load the starter pack first, or pick from the list.");
    const scope = ref(r, bad, "For unit code", units, "Org units");
    if (yesNo(r, bad, "Acting", false)) bad("Acting", "An acting holder has nowhere to be recorded yet. Leave the row out until the product records acting holders.");
    const from = date(r, bad, "From", false);
    const to = date(r, bad, "To", false);
    period(from, to, bad);
    if (!staffNo || !roleCode) return "skip";
    const key = [staffNo, roleCode, scope ?? "", from ?? ""].join("|");
    if (!first("Office holders", key)) {
      bad("Staff no", "The same holder, office, unit and start date is already in the file.");
      return "skip";
    }
    if (known.holderKeys.has(key)) return "skip";
    writes.holders.push({ ...src(r), staffNo, roleCode, scope, from, to });
    return "write";
  });
  run("Committee members", (r, bad) => {
    const committee = need(r, bad, "Committee");
    const committeeCode = known.committees.get(committee.toLowerCase());
    if (committee && !committeeCode) bad("Committee", "Not a committee set up for this organisation. Load the starter pack first, or pick from the list.");
    const staffNo = ref(r, bad, "Staff no", staff, "Staff", true);
    if (!staffNo) bad("Staff no", "Required, and blank.");
    const position = POSITIONS[cell(r, "Position").toLowerCase() as keyof typeof POSITIONS];
    if (!position) bad("Position", "Pick the position from the list.");
    const isAlternate = yesNo(r, bad, "Alternate", false);
    const from = date(r, bad, "From", false);
    const to = date(r, bad, "To", false);
    period(from, to, bad);
    if (!committeeCode || !staffNo || !position) return "skip";
    const key = [committeeCode, staffNo, from ?? ""].join("|");
    if (!first("Committee members", key)) {
      bad("Staff no", "The same member of the same committee from the same date is already in the file.");
      return "skip";
    }
    if (known.seatKeys.has(key)) return "skip";
    writes.seats.push({ ...src(r), committeeCode, staffNo, position, isAlternate, appointmentRef: opt(r, "Appointment reference"), from, to });
    return "write";
  });

  const order = (t: TabName) => TAB_ORDER.indexOf(t);
  reports.sort((a, b) => order(a.tab) - order(b.tab));
  return { reports, faults, writes };
}

/// The key a stored movement, holder or seat is matched on: the same as the plan's.
export const movementKey = (code: string, kind: string, onDay: string, amount: string, reference: string) => [code, kind, onDay, amount, reference].join("|");
export const holderKey = (staffNo: string, roleCode: string, scope: string | null, fromDay: string | null) => [staffNo, roleCode, scope ?? "", fromDay ?? ""].join("|");
export const seatKey = (committeeCode: string, staffNo: string, fromDay: string | null) => [committeeCode, staffNo, fromDay ?? ""].join("|");
export { dayToDate };
