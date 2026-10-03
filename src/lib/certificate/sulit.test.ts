import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { diffFields } from "@/lib/audit/diff";
import { auditCsv, SULIT_WITHHELD, type ExportRow } from "@/lib/audit/export";
import { isSulitField } from "@/lib/sulit-fields";

/**
 * 6.14 inc 1 fix R-7: a certificate's figures are SULIT in the trail. An override's computed and overridden
 * figures and the amount a recommending block supported up to are written under specific registered keys
 * (never the bare "asComputed", "overriddenTo" or "cap"), so the History chips them and the audit export
 * withholds them, byte for byte.
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");
const KEYS = ["certificateComputedAmount", "certificateOverrideAmount", "signatureSupportedUpTo"];

const row = (over: Partial<ExportRow>): ExportRow => ({ id: "e1", at: new Date("2026-10-02T02:00:00Z"), entity: "CertificateOverride", entityId: "o1", entityLabel: "XI202600799 · Interim payment certificate · Materials on site", action: "CREATE", changes: [], reason: "Two deliveries were not on site", unattributed: true, actorName: null, ...over });

describe("a certificate's figures are SULIT (R-7)", () => {
  it("registered under their own keys", () => {
    for (const k of KEYS) expect(isSulitField(k), k).toBe(true);
    for (const k of ["asComputed", "overriddenTo", "cap"]) expect(isSulitField(k), k).toBe(false);
  });

  it("the export's bytes withhold an override's figures and a supported-up-to amount, and keep the rest", () => {
    const override = row({ changes: diffFields(null, { figure: "Materials on site", certificateComputedAmount: "RM1,500.00", certificateOverrideAmount: "RM1,350.00", recordedFor: "Chen Wei Ling" }) });
    const signature = row({ id: "e2", entity: "CertificateSignature", entityId: "s1", entityLabel: "XI202600799 · Interim payment certificate · Recommended by", changes: diffFields(null, { block: "Recommended by", answer: "Supported", signatureSupportedUpTo: "RM12,500.00" }) });
    const csv = auditCsv([override, signature], "Asia/Kuala_Lumpur");
    for (const amount of ["1,500.00", "1,350.00", "12,500.00", "1500", "1350", "12500"]) expect(csv, amount).not.toContain(amount);
    expect(csv.split(SULIT_WITHHELD).length - 1).toBe(3);
    expect(csv).toContain("Materials on site");
    expect(csv).toContain("Chen Wei Ling");
    expect(csv).toContain("Supported");
  });

  it("the acts write them only under those keys", () => {
    const w = read("src/lib/certificate/write.ts");
    const trail = w.split("\n").filter((l) => l.includes('"CertificateOverride"') && l.includes("audit("));
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatch(/certificateComputedAmount: .*certificateOverrideAmount: /);
    expect(w).toMatch(/signatureSupportedUpTo: money\(input\.decisionCap\)/);
    for (const bare of [/\basComputed\s*:/, /\boverriddenTo\s*:/, /\bcap\s*:\s*money\(/]) expect(w).not.toMatch(bare);
  });

  it("the demo writes its trail the same way", () => {
    const demo = read("prisma/demo-certificates.ts");
    expect(demo).toMatch(/certificateComputedAmount: "RM1,500\.00", certificateOverrideAmount: "RM1,350\.00"/);
    expect(demo).not.toMatch(/\b(asComputed|overriddenTo)\s*:/);
  });

  it("the certificate's History chips them", () => {
    const page = read("src/app/projects/[id]/certificates/[certId]/page.tsx");
    expect(page).toMatch(/isSulitField\(field\) && value \? <SulitValue>/);
  });
});
