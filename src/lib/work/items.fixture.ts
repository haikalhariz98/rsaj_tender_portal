/**
 * Forty items on one contract, for the views' and the board's tests, and for step 3's store test to seed so `workWhere` is run against a database and
 * compared with `inView` (plan §3.4). Every view, filter and sort key is hit: every type and status, late and not, no due date, unassigned, the reader's own,
 * failed inspections open and closed, and ties on due day and priority. Deterministic: no clock.
 */

import type { BoardItem } from "./board";
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
    raisedBy: i % 3 === 0 ? "hafiz" : "nurul",
    assignee: ASSIGNEES[i % 4],
    dueOn: DUES[i % 6],
    answer: type === "RFI" && i % 2 === 0 ? "150 c/c governs" : "",
    inspectionResult: type === "INSPECTION" ? RESULTS[i % 3] : null,
    title: `${TITLES[i % 5]} ${i}`,
    priority: PRIORITIES[(i * 3) % 4],
    closedOn: status === "DONE" || status === "CANCELLED" ? CLOSED_ON[i % 4] : null,
  };
});
