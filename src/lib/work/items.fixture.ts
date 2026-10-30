/**
 * Forty items on one contract, for the views' and the board's tests, and for step 3's store test to seed so `workWhere` is run against a database and
 * compared with `inView` (plan §3.4). Every view, filter and sort key is hit: every type and status, late and not, no due date, unassigned, the reader's own,
 * failed inspections open and closed, and ties on due day and priority. Deterministic: no clock. Each row keeps the §3.1 CHECKs it can see (an RFI or SI
 * has a due day); step 3's seed adds what `BoardItem` does not carry: a safety incident's severity and time, and a cancelled row's reason.
 */

import type { BoardItem } from "./board";
import { CONTRACTOR, person } from "./party";
import { WORK_ITEM_TYPES, type InspectionResult, type WorkPriority, type WorkStatus } from "./types";

export const FIXTURE_TODAY = "2026-11-05";
export const FIXTURE_READER = "aisyah";

const STATUSES: WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];
const PRIORITIES: WorkPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const ASSIGNEES = [null, "aisyah", "hafiz", "nurul"];
const DUES = [null, "2026-11-01", "2026-11-04", "2026-11-05", "2026-11-06", "2026-12-01"];
const RESULTS: InspectionResult[] = ["NOT_YET", "FAILED", "PASSED"];
const CLOSED_ON = ["2026-11-05", "2026-10-23", "2026-10-22", "2026-09-01"];
const TITLES = ["Rebar spacing at grid C4", "Relocate manhole MH-07", "Slab pour L2", "Cracked tile, Block B", "Chase as-built drawings"];

export const FIXTURE_ITEMS: BoardItem[] = Array.from({ length: 40 }, (_, i) => {
  const type = WORK_ITEM_TYPES[i % 7];
  const status = STATUSES[i % 5];
  return {
    id: `item-${String(i).padStart(2, "0")}`,
    type,
    number: Math.floor(i / 7) + 1,
    status,
    raisedBy: person(i % 3 === 0 ? "hafiz" : "nurul"),
    assignee: ASSIGNEES[i % 4] === null ? null : person(ASSIGNEES[i % 4]!),
    sharedAt: null,
    dueOn: DUES[i % 6] ?? (type === "RFI" || type === "SITE_INSTRUCTION" ? "2026-11-20" : null),
    answer: type === "RFI" && i % 2 === 0 ? "150 c/c governs" : "",
    inspectionResult: type === "INSPECTION" ? RESULTS[i % 3] : null,
    title: `${TITLES[i % 5]} ${i}`,
    priority: PRIORITIES[(i * 3) % 4],
    closedOn: status === "DONE" || status === "CANCELLED" ? CLOSED_ON[i % 4] : null,
  };
});

/// 3b: items the contractor holds or raised, and shared items staff hold, on the same contract, so the "Waiting on {contractor}" view, the Shared filter
/// and the contractor assignee filter are judged against rows they must and must not match. Kept apart from the forty so 3a's counts stand; step 3's store
/// test seeds both. Each keeps the 3b CHECKs: a contractor party is shared, and the contractor raises only an RFI or a safety incident.
const SHARED_AT = "2026-11-01T02:00:00.000Z";
export const FIXTURE_CONTRACTOR_ITEMS: BoardItem[] = (
  [
    // [type, status, raised by the contractor, assignee: "C" the contractor, a person, or null]; every one shared
    ["RFI", "TO_DO", false, "C"],
    ["SITE_INSTRUCTION", "IN_PROGRESS", false, "C"],
    ["INSPECTION", "IN_REVIEW", false, "C"],
    ["TASK", "DONE", false, "C"],
    ["RFI", "IN_REVIEW", true, "aisyah"],
    ["RFI", "IN_PROGRESS", true, "aisyah"],
    ["SAFETY_INCIDENT", "IN_REVIEW", true, null],
    ["SAFETY_INCIDENT", "CANCELLED", true, "hafiz"],
    ["ACTION", "TO_DO", false, "aisyah"],
    ["DEFECT", "IN_PROGRESS", false, null],
  ] as const
).map(([type, status, byContractor, assignee], i) => ({
  id: `shared-${String(i).padStart(2, "0")}`,
  type,
  number: 100 + i,
  status,
  raisedBy: byContractor ? CONTRACTOR : person("hafiz"),
  assignee: assignee === "C" ? CONTRACTOR : assignee === null ? null : person(assignee),
  sharedAt: SHARED_AT,
  dueOn: type === "RFI" || type === "SITE_INSTRUCTION" ? DUES[(i % 5) + 1] : null,
  answer: type === "RFI" && status === "IN_REVIEW" ? "Use detail 4" : "",
  inspectionResult: type === "INSPECTION" ? "FAILED" : null,
  title: `${TITLES[i % 5]} shared ${i}`,
  priority: PRIORITIES[i % 4],
  closedOn: status === "DONE" || status === "CANCELLED" ? CLOSED_ON[i % 4] : null,
}));
