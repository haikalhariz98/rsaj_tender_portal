import type { BaselineValues } from "@/lib/contract/baseline";
import { parseSen as s } from "@/lib/money";

import type { AssembleInput } from "./assemble";

/// A plain valuation for tests (invented figures; no retention, no damages).
export const INPUT_FOR_TESTS: AssembleInput = {
  valuation: { id: "v", trigger: "VALUATION_DATE", triggerDate: null, valuationDate: "2026-10-01", mainWorks: s("10000.00"), jointRecorded: true, materials: [], parties: [], deductions: [] },
  computedOn: "2026-10-02",
  baseline: { version: 1, values: { contractSum: s("100000.00"), dateForCompletion: "2030-01-01", retentionApplies: false, retentionPercent: null, retentionCapPercent: null, retentionSource: "DERIVED", firstInterimMinimum: s("0.00"), subsequentInterimMinimum: s("0.00"), unfixedMaterialsPct: null, sections: [], ladDaily: null } as unknown as BaselineValues },
  policy: { materialsPct: null, materialsProvenance: null, preExecutionLimit: null, preExecutionProvenance: null, remainder: null, remainderProvenance: null },
  issued: [],
  foreign: [],
  adjustments: [],
  releases: [],
  advances: [],
  decision: null,
  pending: [],
  preExecution: { executed: true, gate: [], withoutReceipt: [], perkesoRecorded: true },
};
