/**
 * What choosing the requesting officer fills in on the requisition form: the officer's
 * department, section and cost centre, read from the unit they sit in. Pure. Nothing is
 * guessed: a unit that is not recorded, not in force, or not a department or section gives
 * nothing, and a cost centre is offered only where exactly one in-force cost centre
 * carries the unit.
 */

export interface UnitRow {
  code: string;
  kind: "COMPANY" | "DIVISION" | "DEPARTMENT" | "SECTION";
  parentCode: string | null;
}

export interface CostCentreRow {
  code: string;
  orgUnitCode: string | null;
}

export interface OfficerDefaults {
  departmentCode: string | null;
  sectionCode: string | null;
  costCentreCode: string | null;
}

const NONE: OfficerDefaults = { departmentCode: null, sectionCode: null, costCentreCode: null };

/// The one cost centre carrying a unit, or null where none or several do.
function soleCostCentre(unitCode: string, costCentres: CostCentreRow[]): string | null {
  const carrying = costCentres.filter((c) => c.orgUnitCode === unitCode);
  return carrying.length === 1 ? carrying[0].code : null;
}

/**
 * `units` and `costCentres` are those in force on the day. A section's department is its
 * parent where that is a department; a department on its own gives no section. The cost
 * centre is the one carrying the section; only where none carries the section, the one
 * carrying the department. Where several carry the section it is left for the person to
 * choose, not settled by the department's.
 */
export function officerDefaults(officerUnitCode: string | null | undefined, units: UnitRow[], costCentres: CostCentreRow[]): OfficerDefaults {
  if (!officerUnitCode) return NONE;
  const unit = units.find((u) => u.code === officerUnitCode);
  if (!unit) return NONE;

  if (unit.kind === "DEPARTMENT") {
    return { departmentCode: unit.code, sectionCode: null, costCentreCode: soleCostCentre(unit.code, costCentres) };
  }
  if (unit.kind === "SECTION") {
    const department = units.find((u) => u.code === unit.parentCode && u.kind === "DEPARTMENT");
    if (!department) return NONE;
    const own = costCentres.filter((c) => c.orgUnitCode === unit.code);
    const costCentreCode = own.length > 0 ? soleCostCentre(unit.code, costCentres) : soleCostCentre(department.code, costCentres);
    return { departmentCode: department.code, sectionCode: unit.code, costCentreCode };
  }
  return NONE;
}

export type PrefillField = "unit" | "section" | "costCentre";
export type PrefillValues = Record<PrefillField, string>;

export interface PrefillResult {
  /// What the form holds afterwards.
  values: PrefillValues;
  /// What choosing this officer set, per field: a value still equal to it was never the user's own.
  filledBy: Partial<PrefillValues>;
  /// Fields this officer's unit filled in.
  filled: PrefillField[];
  /// Fields the user had already chosen, so left as they were although the officer's unit has one.
  kept: PrefillField[];
  /// Fields the officer's unit cannot settle (a cost centre carried by several), left empty for the user.
  left: PrefillField[];
  /// The department the user chose is not the officer's, so section and cost centre were left alone.
  otherDepartment: boolean;
  /// The officer's unit gave a department at all.
  gave: boolean;
}

/**
 * Apply an officer's defaults to what the form holds. Only a field still empty, or one an earlier
 * officer filled (`was`), is touched. Section and cost centre are filled only where the department
 * the form ends up with is the officer's: under another department they would not belong to it.
 * A section belongs to one department, so it is released when the department changes.
 */
export function prefillFromOfficer(current: PrefillValues, was: Partial<PrefillValues>, d: OfficerDefaults): PrefillResult {
  const values: PrefillValues = { ...current };
  const filledBy: Partial<PrefillValues> = {};
  const filled: PrefillField[] = [];
  const kept: PrefillField[] = [];
  const left: PrefillField[] = [];
  const gave = d.departmentCode != null;
  const open = (k: PrefillField) => current[k] === "" || current[k] === was[k];
  const set = (k: PrefillField, v: string) => {
    values[k] = v;
    filledBy[k] = v;
    filled.push(k);
  };

  if (open("unit")) {
    if (d.departmentCode) set("unit", d.departmentCode);
    else values.unit = "";
  } else if (d.departmentCode) kept.push("unit");

  const sameDepartment = gave && values.unit === d.departmentCode;
  const otherDepartment = gave && !sameDepartment;
  if (!gave) {
    if (open("section")) values.section = "";
    if (open("costCentre")) values.costCentre = "";
  } else if (sameDepartment) {
    const sectionOpen = open("section") || values.unit !== current.unit;
    if (sectionOpen) {
      if (d.sectionCode) set("section", d.sectionCode);
      else values.section = "";
    } else if (d.sectionCode) kept.push("section");
    if (open("costCentre")) {
      if (d.costCentreCode) set("costCentre", d.costCentreCode);
      else {
        values.costCentre = "";
        left.push("costCentre");
      }
    } else if (d.costCentreCode) kept.push("costCentre");
  }
  for (const k of ["unit", "section", "costCentre"] as const) {
    if (filledBy[k] === undefined && was[k] !== undefined && was[k] === values[k]) filledBy[k] = was[k];
  }
  return { values, filledBy, filled, kept, left, otherDepartment, gave };
}
