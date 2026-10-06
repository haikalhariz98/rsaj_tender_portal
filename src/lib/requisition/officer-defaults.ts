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
