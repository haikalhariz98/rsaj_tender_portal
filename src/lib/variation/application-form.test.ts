import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { noFormFault } from "@/lib/certificate/form-needs";

import { applicationFormFault, lastStepFormFault, sendFaults, type VariationFacts } from "./application";
import { variationFaultWords } from "./labels";

/**
 * BD-613-110 (6.13 Part B run 1a, against accepted 6.13 Part A). The variation's application (VO-660) is opened by the
 * last step of its prior approval, on the form configured then (BD-613-52). Unset, it used to open without a form and be
 * left with "no way to give it a form yet": a dead end on the route that decides variations. Now the application's form
 * is checked through raiseFormFault when the prior approval is sent and again at its last step, refusing in English and
 * Malay with the configured location words; and openCertificate refuses a missing form for every kind, so no certificate
 * is opened without one again. demo_hct5 (opened by the demo before this, VOID) stays the historical case.
 */

const facts: VariationFacts = { id: "v1", status: "SUPPORTED", exemption: null, estimate: 9_000_000n, soDecision: "SUPPORTED", soDecisionCap: null, routes: [], instructions: [], orders: [], commencedOn: null };
const send = (applicationTemplateId: string | null) => sendFaults({ v: facts, event: "PRIOR", value: 9_000_000n, cumulativeBlockedBy: null, adjustmentInProgress: null, orderNet: null, applicationTemplateId });
const notSet = { code: "TEMPLATE_NOT_SET", level: "block", data: { need: "Application for a variation", needMs: "Permohonan perubahan kerja", setAt: "POST_AWARD" } };

describe("the application's form, at send and at the last step", () => {
  it("sending the prior approval with no application form is refused, naming the need and where it is chosen (EN and MS)", () => {
    expect(send(null)).toEqual([notSet]);
    const words = variationFaultWords(send(null)[0]);
    expect(words.en).toBe("No form is chosen for “Application for a variation”. Choose it under Configuration › Post-award controls.");
    expect(words.ms).toBe("Tiada borang dipilih bagi “Permohonan perubahan kerja”. Pilih di Konfigurasi › Kawalan selepas setuju terima.");
    expect(send("t1")).toEqual([]);
  });

  it("only the prior approval opens an application, so only it asks; another fault comes first, alone", () => {
    for (const event of ["INCREASE", "AGREED_RATE", "REMEASUREMENT"] as const) expect(lastStepFormFault(event, null)).toBeNull();
    expect(sendFaults({ v: { ...facts, status: "SUBMITTED" } as VariationFacts, event: "PRIOR", value: null, cumulativeBlockedBy: null, adjustmentInProgress: null, orderNet: null, applicationTemplateId: null }).map((f) => f.code)).toEqual(["NOT_SUPPORTED_YET"]);
  });

  it("both orders: the form cleared between the send and the last step: sent, then the last step refused", () => {
    expect(send("t1")).toEqual([]);
    expect(lastStepFormFault("PRIOR", null)).toEqual(notSet);
  });

  it("both orders: the send refused for want of the form, the form then set: sent, and the last step passes", () => {
    expect(send(null)).toEqual([notSet]);
    expect(send("t1")).toEqual([]);
    expect(lastStepFormFault("PRIOR", "t1")).toBeNull();
  });

  it("the last step and openCertificate agree: the same finding, from the same rule", () => {
    expect(applicationFormFault(null)).toEqual(noFormFault("VARIATION_APPLICATION"));
    expect(lastStepFormFault("PRIOR", null)).toEqual(noFormFault("VARIATION_APPLICATION"));
    const write = readFileSync("src/lib/certificate/write.ts", "utf8");
    expect(write).toMatch(/if \(!o\.templateId\) refuse\("Not opened:", \[noFormFault\(o\.kind\)\]\);/);
  });
});

describe("the acts and the screen read it the same way (source)", () => {
  const routeWrite = readFileSync("src/lib/variation/route-write.ts", "utf8");
  const acts = readFileSync("src/app/projects/[id]/variation-actions.ts", "utf8");
  const page = readFileSync("src/app/projects/[id]/variations/[variationId]/page.tsx", "utf8");
  it("the last step asks before the route is approved, on the form read under the lock, and opens on that same form", () => {
    const after = routeWrite.slice(routeWrite.indexOf("async function afterStep("));
    expect(after.indexOf("lastStepFormFault(a.event as VariationEvent, form)")).toBeGreaterThan(0);
    expect(after.indexOf("lastStepFormFault(a.event as VariationEvent, form)")).toBeLessThan(after.indexOf('data: { status: "APPROVED", closedAt: c.now }'));
    expect(routeWrite).toMatch(/await openApplication\(c, v, form!\)/);
    expect(routeWrite).toMatch(/kind: "VARIATION_APPLICATION", templateId,/);
  });
  it("the send act and the page pass the application's form into sendFaults", () => {
    expect(acts).toMatch(/const fs = sendFaults\(\{[^\n]*applicationTemplateId: await applicationFormNow\(c\)/);
    expect(page).toMatch(/const fs = sendFaults\(\{[^\n]*applicationTemplateId: vv\.formOf\("VARIATION_APPLICATION"\)/);
  });
  it("the page warns on a waiting prior approval that its last step would be refused, by the same rule", () => {
    expect(page).toMatch(/lastStepFormFault\(a\.event as VariationEvent, vv\.formOf\("VARIATION_APPLICATION"\)\)/);
  });
});
