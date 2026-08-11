/**
 * The organisation structure, resolved as of a date.
 *
 * Pure: takes the configured rows and a date, returns the tree that was in force then.
 * Nothing here reads a database and nothing here repairs a structure it cannot draw.
 */

import { activeOn } from "@/lib/effective";

import type {
  CodeCheck,
  CodeFormat,
  Effective,
  OrgUnit,
  Provenance,
  Structure,
  StructureFault,
  UnitNode,
} from "./types";

// Effective dating is shared: units, role assignments and authority matrices must
// all agree on what "in force" means. Re-exported so existing callers keep working.
export { activeOn, inForceOn } from "@/lib/effective";

/**
 * Walk from a unit up to its root, as of a date.
 *
 * Returns the chain root-first, the unit itself last. A loop in the configured parent
 * codes terminates the walk rather than hanging: the chain is bounded by the number
 * of units in force, and revisiting a code stops it.
 */
export function pathTo(units: readonly OrgUnit[], code: string, on: Date): OrgUnit[] {
  const byCode = new Map(activeOn(units, on).map((u) => [u.code, u]));
  const chain: OrgUnit[] = [];
  const seen = new Set<string>();

  let current = byCode.get(code);
  while (current && !seen.has(current.code)) {
    seen.add(current.code);
    chain.unshift(current);
    current = current.parentCode ? byCode.get(current.parentCode) : undefined;
  }
  return chain;
}

/// The codes that form a loop starting from `code`, or null where there is none.
function cycleFrom(
  code: string,
  byCode: ReadonlyMap<string, OrgUnit>,
): string[] | null {
  const walked: string[] = [];
  const seen = new Set<string>();

  let current: OrgUnit | undefined = byCode.get(code);
  while (current) {
    if (seen.has(current.code)) {
      // Report the loop itself, not the tail that led into it.
      return walked.slice(walked.indexOf(current.code));
    }
    seen.add(current.code);
    walked.push(current.code);
    current = current.parentCode ? byCode.get(current.parentCode) : undefined;
  }
  return null;
}

/**
 * Build the structure in force on a date.
 *
 * Three outcomes, and the screen shows all three: units that hang off a root, units
 * whose stated parent is not in force on this date, and units caught in a loop. The
 * last two are reported as faults; neither is silently promoted to a root, because
 * where a detached department really belongs is a question only the customer can
 * answer.
 */
export function buildStructure(units: readonly OrgUnit[], on: Date): Structure {
  const inForce = activeOn(units, on);
  const byCode = new Map(inForce.map((u) => [u.code, u]));

  const faults: StructureFault[] = [];
  const cycled = new Set<string>();
  const reportedCycles = new Set<string>();

  for (const unit of inForce) {
    const loop = cycleFrom(unit.code, byCode);
    if (!loop) continue;
    for (const c of loop) cycled.add(c);
    // One fault per loop, however many units walk into it.
    const signature = [...loop].sort().join(">");
    if (!reportedCycles.has(signature)) {
      reportedCycles.add(signature);
      faults.push({ kind: "CYCLE", codes: loop });
    }
  }

  const nodes = new Map<string, UnitNode>();
  for (const unit of inForce) {
    if (cycled.has(unit.code)) continue;
    nodes.set(unit.code, { unit, depth: 0, children: [] });
  }

  const roots: UnitNode[] = [];
  const detached: UnitNode[] = [];

  for (const node of nodes.values()) {
    const parentCode = node.unit.parentCode;
    if (parentCode == null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(parentCode);
    if (!parent) {
      faults.push({ kind: "DETACHED", code: node.unit.code, parentCode });
      detached.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const setDepth = (node: UnitNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) setDepth(child, depth + 1);
  };
  for (const root of roots) setDepth(root, 0);
  for (const node of detached) setDepth(node, 0);

  return { roots, detached, faults };
}

/// Flatten a tree for rendering as rows, parents before their children.
export function flatten(nodes: readonly UnitNode[]): UnitNode[] {
  const rows: UnitNode[] = [];
  const visit = (node: UnitNode) => {
    rows.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return rows;
}

/**
 * Check a code against its configured format.
 *
 * The pattern is anchored here rather than trusting the author to have anchored it —
 * an unanchored pattern would accept anything containing a valid code, which is a
 * failure mode nobody notices until a bad cost centre is already in the ledger.
 */
export function checkCode(value: string, format: CodeFormat | null | undefined): CodeCheck {
  if (!format) return { state: "NO_FORMAT" };

  let re: RegExp;
  try {
    re = new RegExp(`^(?:${format.pattern})$`);
  } catch {
    return { state: "BAD_PATTERN", pattern: format.pattern };
  }

  if (re.test(value)) return { state: "OK" };
  return { state: "MALFORMED", example: format.example, description: format.description };
}

export function findFormat(
  formats: readonly CodeFormat[],
  key: string,
): CodeFormat | null {
  return formats.find((f) => f.key === key) ?? null;
}

export interface ListReadiness {
  state: "UNSET" | "CONFIGURED";
  active: number;
  assumed: number;
  needsSignOff: boolean;
}

/// Assessed the way reference data and quorum are: unset is its own answer.
export function assessList(
  entries: readonly (Effective & { provenance: Provenance; sortOrder: number })[],
  on: Date,
): ListReadiness {
  const inForce = activeOn(entries, on);
  const assumed = inForce.filter((e) => e.provenance === "ASSUMED").length;
  return {
    state: inForce.length === 0 ? "UNSET" : "CONFIGURED",
    active: inForce.length,
    assumed,
    needsSignOff: assumed > 0,
  };
}
