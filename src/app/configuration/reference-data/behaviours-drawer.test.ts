import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Phase 0.2 item 6: the Behaviours drawer offers no free text where a typed twin says the same thing, and saving it never wipes what it did not send.
const editors = readFileSync("src/app/configuration/reference-data/editors.tsx", "utf8");
const core = readFileSync("src/app/configuration/reference-data/core.ts", "utf8");
const drawer = editors.slice(editors.indexOf("export function ContractBehavioursDrawer"), editors.indexOf("export function ChecklistItemDrawer"));

describe("the contract type's Behaviours drawer", () => {
  it("offers the interim payment rule only while How it is paid is unset, and the adjustment drivers only as a choice", () => {
    expect(drawer).toMatch(/\.\.\.\(values\.paymentRoute \? \[\] : \[t\("interimPaymentRule"/);
    expect(drawer).not.toMatch(/t\("sumAdjustmentDrivers"/);
    expect(drawer).toMatch(/\{ kind: "tokens", name: "sumAdjustmentTriggers", label: BEHAVIOUR_LABEL\.sumAdjustmentDrivers, options: SUM_ADJUSTMENT_TRIGGERS/);
  });
  it("keeps a free-text behaviour as stored when the drawer did not send it", () => {
    expect(core).toMatch(/interimPaymentRule: data\.has\("interimPaymentRule"\) \? r\.optionalText\("interimPaymentRule"\) : before\.interimPaymentRule/);
    expect(core).toMatch(/sumAdjustmentDrivers: data\.has\("sumAdjustmentDrivers"\) \? .* : before\.sumAdjustmentDrivers/);
  });
});
