import { describe, expect, it } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import RSAJ_PACK from "../../../prisma/rsaj/starter-pack";
import { inBand, resolveApproval } from "@/lib/authority/resolve";
import type { Matrix, Role } from "@/lib/authority/types";
import { placeInBands } from "@/lib/evaluation/bands";
import { parseFixed } from "@/lib/evaluation/fixed";
import { bandsOf, modelFaults, type AspectConfig } from "@/lib/evaluation/model";
import { exerciseRoutePreview, resolveNameApproval, type FunderContext } from "@/lib/method/approval";
import { methodConfigFaults } from "@/lib/method/config";
import { TENDERING_APPROVAL_DOMAIN, type Method } from "@/lib/method/types";
import { NEGOTIATION_DOMAIN } from "@/lib/evaluation/types";
import { parseSen } from "@/lib/money";
import { resolveCertificateRoute } from "@/lib/payment/route";
import { tableDocumentFaults } from "@/lib/tender-docs/conditions";
import type { PackPartFacts } from "@/lib/tender-docs/types";
import { advertisementDay, closingFaults } from "@/lib/window/dates";
import { UNSET_WINDOW_POLICY, type WindowPolicyFacts } from "@/lib/window/types";

import { planPacks } from "./plan";

/**
 * Stage 1 of the RSAJ answers (2026-10-24, scratchpad change list A1–A14): the pack's new offices, rules, committee notes, routing sheets, window
 * rules, parts, fee floor, methods, contract types and series, each judged by the product's own functions rather than by its literals alone.
 */
const listOf = (model: string) => RSAJ_PACK.lists.filter((l) => l.model === model).flatMap((l) => l.rows);
const groupOf = (label: string) => RSAJ_PACK.groups.find((g) => g.label === label)!;
const dal = RSAJ_PACK.drafts!.matrices![0];
const roles: Record<string, Role> = Object.fromEntries(listOf("AuthorityRole").map((o) => [o.code, { code: o.code, ...(o.values as Omit<Role, "code">) }]));
const matrix: Matrix = { policy: dal.policy, roles, rules: dal.rules, coreRouting: dal.coreRouting };
const ctx: FunderContext = { dal: matrix, override: null, supersedes: false };
const method = (code: string) => {
  const r = listOf("SourcingMethod").find((m) => m.code === code)!;
  return { code, ...r.values } as unknown as Method;
};
const errors = (w: readonly { level: string; code: string }[]) => w.filter((x) => x.level === "err").map((x) => x.code);
const NEW_RULES = ["TA_QUOTATION", "TA_TENDER", "NEG_QUOTATION", "NEG_TENDER", "NAME_QUOTATION", "NAME_TENDER", "SIGN_INDENT", "IPC_QUOTATION", "FINAL_QUOTATION", "MGD_QUOTATION", "EOT_Q_FIN_NOT_AUTHORITY", "EOT_Q_FIN_AUTHORITY"];
const fresh = { now: new Date("2026-10-23T02:00:00Z"), rows: { Organisation: { id: "o1", timeZone: null }, SecurityPolicy: null }, listSizes: {}, demoIsLoaded: false };

describe("A1: the offices", () => {
  it("names the Head of Contract & Procurement and adds the Head of Administration Division, with no superior; no finance office", () => {
    expect(roles.CP.nameEn).toBe("Head of Contract & Procurement");
    expect(roles.AD).toMatchObject({ nameEn: "Head of Administration Division", isCommittee: false, escalatesToCode: null, selfApprovalEscalatesToCode: null });
    expect(roles).not.toHaveProperty("FIN");
    expect(roles.CM).toMatchObject({ escalatesToCode: null, selfApprovalEscalatesToCode: null });
  });
});

describe("A3: the new DAL rows", () => {
  it("are STATED, name no method, take no core chain, and are non-delegable wherever an office gives a mandatory recommendation", () => {
    const fresh = dal.rules.filter((r) => NEW_RULES.includes(r.ruleKey) || /^(NC|PC|MGD|FINAL)_T_/.test(r.ruleKey));
    expect(fresh).toHaveLength(NEW_RULES.length + 12);
    for (const r of fresh) {
      expect([r.provenance, r.method, r.generateCoreChain], r.ruleKey).toEqual(["STATED", null, null]);
      expect(r.nonDelegable, r.ruleKey).toBe(r.recommenders.some((x) => x.act === "MR"));
    }
  });

  it("route approval for tendering, negotiation and the names by the matter's value: exactly RM300,000.00 is a quotation, one sen more a tender", () => {
    for (const code of ["open_tender", "selected_tender", "open_quotation", "selective_quotation"]) {
      const m = method(code);
      const at = (domain: string, value: number) => exerciseRoutePreview(ctx, domain, m, value);
      for (const [domain, q, t] of [
        [TENDERING_APPROVAL_DOMAIN, "TA_QUOTATION", "TA_TENDER"],
        [NEGOTIATION_DOMAIN, "NEG_QUOTATION", "NEG_TENDER"],
      ]) {
        expect([at(domain, 300_000).ruleKey, at(domain, 300_000.01).ruleKey], `${code} ${domain}`).toEqual([q, t]);
        expect([at(domain, 200_000).approverCode, at(domain, 2_000_000).approverCode, errors(at(domain, 200_000).warnings)], `${code} ${domain}`).toEqual(["CP", "CP", []]);
      }
      expect(at(TENDERING_APPROVAL_DOMAIN, 15_000).state, code).toBe("NO_RULE");
    }
    const names = (code: string, value: number) => {
      const r = resolveNameApproval(ctx, method(code), value);
      return { state: r.nameState, rule: r.ruleKey, chain: r.chain.map((s) => `${s.roleCode} ${s.act}`), errors: errors(r.warnings) };
    };
    expect(names("selective_quotation", 300_000)).toEqual({ state: "RESOLVED", rule: "NAME_QUOTATION", chain: ["HOD P", "CP JR", "HODIV R", "FD A"], errors: [] });
    expect(names("selected_tender", 300_000.01)).toEqual({ state: "RESOLVED", rule: "NAME_TENDER", chain: ["HOD P", "CP MR", "HODIV JR", "FD R", "CEO A"], errors: [] });
    expect(names("open_tender", 500_000).state).toBe("NOT_REQUIRED");
  });

  it("route a work indent's signature to the Head of C&P", () => {
    const r = resolveApproval(matrix, { domain: "award_signatory", cond: "WORK_INDENT", value: 120_000 });
    expect([r.rule?.ruleKey, r.approverCode, errors(r.warnings)]).toEqual(["SIGN_INDENT", "CP", []]);
  });

  it("route a quotation contract's interim payment to the Head of Division, the Head of C&P jointly recommending and the department's head recommending", () => {
    const sen = (n: string) => parseSen(n);
    for (const m of ["open_selective", "direct"]) {
      const r = resolveCertificateRoute(matrix, { domain: "payment", value: sen("80000.00"), contractValue: sen("200000.00"), method: m, contractTypeCode: null }, dal.label);
      expect(r.ok, m).toBe(true);
      if (!r.ok) continue;
      expect([r.resolution.rule?.ruleKey, r.resolution.chain.map((s) => `${s.roleCode} ${s.act}`)], m).toEqual(["IPC_QUOTATION", ["CP JR", "HOD R", "HODIV A"]]);
    }
    const q = (domain: string, contractValue: number, cond?: string) => resolveApproval(matrix, { domain, contractValue, ...(cond ? { cond } : {}) }).rule?.ruleKey ?? null;
    expect([q("final_payment", 200_000), q("making_good", 200_000), q("eot", 200_000, "financial_not_authority"), q("eot", 200_000, "financial_authority")]).toEqual(["FINAL_QUOTATION", "MGD_QUOTATION", "EOT_Q_FIN_NOT_AUTHORITY", "EOT_Q_FIN_AUTHORITY"]);
  });

  it("route the tender certificates and final payment to whichever office acts as Superintending Officer at the contract's value", () => {
    for (const domain of ["non_completion", "practical_completion", "making_good", "final_payment"]) {
      const so = (contractValue: number) => {
        const r = resolveApproval(matrix, { domain, contractValue });
        return `${r.approverCode} ${r.chain.slice(0, -1).map((s) => `${s.roleCode} ${s.act}`).join(", ")}`;
      };
      expect([300_000.01, 1_000_000, 1_000_000.01, 3_000_000, 3_000_000.01].map(so), domain).toEqual(["HODIV CP JR, HOD R", "HODIV CP JR, HOD R", "FD CP JR, HOD R", "FD CP JR, HOD R", "CEO CP JR, HOD R"]);
    }
    // No quotation-band row for these three: a non-completion on a RM200,000 contract finds none, and says so.
    expect(errors(resolveApproval(matrix, { domain: "non_completion", contractValue: 200_000 }).warnings)).toEqual(["NO_RULE"]);
  });

  it("plan clean: every new office, committee and rule key is one the run writes", () => {
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], fresh);
    expect(p.faults).toEqual([]);
    const draft = p.writes.find((w) => w.kind === "DRAFT_MATRIX")!;
    expect(draft.kind === "DRAFT_MATRIX" && draft.draft.rules.map((r) => r.ruleKey)).toEqual(expect.arrayContaining([...NEW_RULES, "NC_T_ABOVE_3M", "FINAL_T_300K_TO_1M"]));
    const offices = new Set(p.writes.filter((w) => w.kind === "ROW" && w.model === "AuthorityRole").map((w) => (w.kind === "ROW" ? w.code : "")));
    for (const r of dal.rules) for (const c of [r.proposerCode, r.approverCode, r.committeeCode, ...r.recommenders.map((x) => x.roleCode)]) if (c) expect(offices, `${r.ruleKey} ${c}`).toContain(c);
  });

  it("inBand: a null value matches no banded row, a band ending at 0 included; a value of 0 does fall in it", () => {
    expect(inBand(null, null, 0, dal.policy)).toBe(false);
    expect(inBand(undefined, null, 0, dal.policy)).toBe(false);
    expect(inBand(0, null, 0, dal.policy)).toBe(true);
    expect(inBand(0.01, null, 0, dal.policy)).toBe(false);
    expect(inBand(null, null, null, dal.policy)).toBe(true);
  });
});

describe("A5: the committees' notes", () => {
  const committee = (code: string) => listOf("Committee").find((c) => c.code === code)!.values;
  it("record the Variation Orders Committee's and Tender Opening Committee's composition as STATED, and the Tender Board chair's stand-in, with no member", () => {
    expect(committee("VOC")).toMatchObject({ compositionProvenance: "STATED", notes: expect.stringMatching(/^Chaired by the COO and CFO; .*\(KP002 flowchart 6\.2\)\. SK006 7\.5\.3 also/) });
    expect(committee("TOC")).toMatchObject({ compositionProvenance: "STATED", panelSize: 2, notes: expect.stringContaining("SK002 7.7.2") });
    expect(committee("TBC")).toMatchObject({ notes: "An absent Chairman may appoint the CEO as chairman (SK003 7.6.3)." });
    expect(RSAJ_PACK.lists.map((l) => l.model)).not.toContain("CommitteeMember");
  });
});

describe("A6: the quotation model (RSAJ answer 11)", () => {
  const q = RSAJ_PACK.drafts!.evaluationModels!.find((m) => m.content.code === "quotation_five_phase")!.content;
  const stage = (code: string) => q.stages.find((s) => s.code === code)!;
  it("puts Phase 1 with C&P as observed, keeps Phase 2 with the department, and makes Phases 2 to 4 must-pass", () => {
    for (const c of ["phase_1", "phase_1_shortlist"]) expect(stage(c), c).toMatchObject({ side: "CONTRACT_PROCUREMENT", provenance: "OBSERVED", governingSource: expect.stringMatching(/\+ Phase 1 by CPD \(answer 11\)$/) });
    expect(stage("phase_2")).toMatchObject({ side: "IMPLEMENTING_DEPARTMENT", mustPass: true, governingSource: expect.stringContaining("with CPD (answer 11); a joint side is not modelled") });
    for (const c of ["phase_3", "phase_4"]) expect(stage(c), c).toMatchObject({ mustPass: true, governingSource: expect.stringContaining("Petender yang lulus semua Fasa") });
    expect(stage("phase_5").provenance).toBe("ASSUMED");
    for (const s of q.stages) expect(s.passInclusive, s.code).toBeNull();
  });

  it("is refused at issue for the Phase 2 criterion marks and, with the pack's aspects in force, for where the four aspects are assessed: both left open", () => {
    const marks = ["CRITERION_MAX_NOT_SET", "CRITERION_MAX_NOT_SET", "CRITERION_MAX_NOT_SET", "CRITERION_MAX_NOT_SET", "CRITERION_MAX_NOT_SET", "MARKS_NOT_TOTAL"];
    const blocks = (aspects: AspectConfig[]) => modelFaults({ ...q, version: 1 }, aspects).filter((f) => f.level === "block");
    expect(blocks([]).map((f) => f.code)).toEqual(marks);
    for (const f of blocks([])) expect(f.data?.stage).toBe("Phase 2: technical evaluation");
    const aspects = listOf("EvaluationAspect").map((r) => ({ code: r.code, kind: r.values.kind, labelEn: r.values.labelEn, labelMs: null, requiredOnRoute: r.values.requiredOnRoute, provenance: "STATED", retired: false }) as AspectConfig);
    expect(blocks(aspects).map((f) => f.code)).toEqual([...marks, "ASPECTS_STAGE_MISSING"]);
    // The bands are as the form writes them, gaps and all: warned, never refused.
    expect(modelFaults({ ...q, version: 1 }, []).filter((f) => f.level === "warn").every((f) => f.code === "BANDS_GAP")).toBe(true);
  });

  it("reads band edges inclusively: a CPR of 80 is Best, a variance of exactly ±15% Competitive, and 79.5 falls in no band (not rounded)", () => {
    const set = (code: string) => bandsOf(q.bandSets.find((b) => b.code === code)!);
    const label = (code: string, v: string) => {
      const p = placeInBands(parseFixed(v), set(code));
      return p.placed ? p.band.labelEn : null;
    };
    expect([label("cpr", "80"), label("cpr", "79"), label("cpr", "100")]).toEqual(["Best", "Good", "Best"]);
    expect([label("variance", "15"), label("variance", "-15"), label("variance", "15.01")]).toEqual(["Competitive", "Competitive", "High"]);
    expect(label("cpr", "79.5")).toBeNull();
  });
});

describe("A7: the interim payment's two routing sheets", () => {
  it("are STATED with their targets and the split in their notes, and no kind setting picks one", () => {
    const sheets = listOf("RoutingSheetType").filter((r) => r.values.certificateKind === "INTERIM_PAYMENT");
    expect(sheets.map((s) => [s.values.labelEn, s.source])).toEqual([
      ["Interim payment, through Contract & Procurement", expect.stringContaining("FR-CRT-008")],
      ["Interim payment, Superintending Officer approval", expect.stringContaining("FR-CRT-008")],
    ]);
    expect(sheets.map((s) => s.values.notes)).toEqual([expect.stringMatching(/^21 days .*, 21 .*, 10 Finance\. When \(ii\) applies is not stated \(RSAJ question 12\)\.$/), expect.stringMatching(/^21 days .*, 5 .*, 15 Finance;.*When \(ii\) applies is not stated \(RSAJ question 12\)\.$/)]);
    const targets = listOf("RoutingTarget").filter((t) => sheets.some((s) => (t.values.typeId as { ref: string }).ref === `RoutingSheetType:${s.code}`));
    expect(targets.map((t) => t.values.targetDays)).toEqual([52, 41]);
    expect(RSAJ_PACK.lists.map((l) => l.model)).not.toContain("CertificateKindSetting");
  });
});

describe("A8: the date rules (RSAJ answer 13)", () => {
  const dateRules = groupOf("Invitation · date rules");
  const dayRule = groupOf("Invitation · advertisement day");
  it("set no newspaper margin and make the newspaper's day the advertisement day, STATED with the mapping in the source", () => {
    expect(dateRules.values).toMatchObject({ minAdvertisementDays: 14, targetAdvertisementDays: 21, newspaperWarnDays: 0 });
    expect([dateRules.provenanceColumn, dateRules.sourceColumn, dateRules.source]).toEqual(["dateRulesProvenance", "dateRuleSource", expect.stringContaining("answer 13")]);
    expect(dayRule.values).toEqual({ advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: { ref: "PublicationChannel:newspaper" } });
    expect([dayRule.provenanceColumn, dayRule.sourceColumn, dayRule.source]).toEqual(["dayRuleProvenance", undefined, "SK002 7.4.2(g); answer 13 (the two weeks run from the newspaper date)"]);
  });

  const policy: WindowPolicyFacts = { ...UNSET_WINDOW_POLICY, ...(dateRules.values as Partial<WindowPolicyFacts>), defaultClosingTime: "14:30", advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "newspaper", dateRuleSource: dateRules.source };
  const calendar = { id: "c", name: "Calendar", weekendDays: [6, 7], years: [{ year: 2026, complete: true }], holidays: [] };
  // Advertised Wednesday 4 November 2026: 13, 14 and 20 days on are a Tuesday, a Wednesday and a Tuesday, at 14:30 in Kuala Lumpur.
  const closing = (day: string, purchaseCloseDay: string) => closingFaults({ closingAt: new Date(`${day}T06:30:00Z`), purchaseCloseDay, advertisementDay: "2026-11-04", closingTimeReason: "", timeZone: "Asia/Kuala_Lumpur", policy, calendar, today: "2026-11-01" });
  const codes = (fs: { code: string; level: string }[]) => fs.map((f) => `${f.level} ${f.code}`);

  it("block a closing 13 days after the newspaper, pass one at 14, warn below the target at 20, and never warn of the newspaper's day", () => {
    expect(codes(closing("2026-11-17", "2026-11-14"))).toEqual(["block CLOSING_TOO_SOON"]);
    expect(codes(closing("2026-11-18", "2026-11-15"))).toEqual(["warn BELOW_TARGET"]);
    expect(codes(closing("2026-11-24", "2026-11-21"))).toEqual(["warn BELOW_TARGET"]);
    expect(codes(closing("2026-11-25", "2026-11-22"))).toEqual([]);
  });

  it("take the advertisement day from the newspaper, whatever day the other channels publish", () => {
    const channels = listOf("PublicationChannel").map((c) => ({ id: c.code, nameEn: String(c.values.nameEn), requiredWhenAdvertised: c.values.requiredWhenAdvertised as boolean, retiredOn: null }));
    const records = [{ channelId: "newspaper", publishedOn: "2026-11-04" }, { channelId: "notice_board", publishedOn: "2026-11-06" }, { channelId: "website", publishedOn: "2026-11-05" }];
    expect(advertisementDay(records, channels, policy, "2026-11-06")).toMatchObject({ day: "2026-11-04", faults: [] });
  });
});

describe("A9: the document parts (RSAJ answers 7 to 10)", () => {
  const parts = listOf("TenderDocumentPart");
  it("class the standard instruments as SK001 7.3.4 does, and answer 'no' for every quotation part, so a quotation pack has no table-document finding", () => {
    const of = (code: string) => parts.find((p) => p.code === code)!.values;
    expect([of("t_conditions"), of("q_conditions"), of("q_form"), of("q_specification")].map((v) => [v.content, v.provenance ?? "STATED"])).toEqual([
      ["STANDARD", "STATED"],
      ["STANDARD", "STATED"],
      ["STANDARD", "STATED"],
      ["MIXED", "STATED"],
    ]);
    expect([of("t_summary_and_rates").provenance, of("q_declaration").provenance]).toEqual(["ASSUMED", "ASSUMED"]);
    const quotation = parts.filter((p) => p.values.packKind === "QUOTATION");
    expect(quotation).toHaveLength(10);
    for (const p of quotation) expect(p.values.inTableDocument, p.code).toBe(false);
    const facts = quotation.map((p) => ({ state: "NOT_STARTED", inTableDocument: p.values.inTableDocument, printedNumber: p.values.printedNumber, label: p.values.labelEn }) as unknown as PackPartFacts);
    expect(tableDocumentFaults(facts, "QUOTATION")).toEqual([]);
    // The tender pack still holds its table document (FR-DOC-010).
    const tender = parts.filter((p) => p.values.packKind === "TENDER").map((p) => ({ state: "NOT_STARTED", inTableDocument: p.values.inTableDocument, printedNumber: p.values.printedNumber, label: p.values.labelEn }) as unknown as PackPartFacts);
    expect(tableDocumentFaults(tender, "TENDER")).toEqual([]);
  });
});

describe("A10: the document fee floors", () => {
  it("are RM50.00 a quotation and RM250.00 a tender set, STATED, each scoped by its regime", () => {
    const lists = RSAJ_PACK.lists.filter((x) => x.model === "DocumentFeeFloor");
    expect(lists.map((l) => l.scope)).toEqual([{ regime: "quotation" }, { regime: "tender" }]);
    expect(lists.flatMap((l) => l.rows)).toEqual([
      { code: "quotation", label: "Quotation", values: { regime: "quotation", minimum: "50.00" }, requirement: "FR-ADV-008", source: "SK002 (minimum RM50); answers 7–9" },
      { code: "tender", label: "Tender", values: { regime: "tender", minimum: "250.00" }, requirement: "FR-ADV-008", source: "FR-ADV-008; SK002 7.4.2(d)" },
    ]);
    const w = planPacks([RSAJ_PACK, GENERIC_PACK], fresh).writes.filter((x) => x.kind === "ROW" && x.model === "DocumentFeeFloor");
    expect(w).toMatchObject([
      { values: { regime: "quotation", minimum: "50.00", provenance: "STATED", governingSource: "SK002 (minimum RM50); answers 7–9" } },
      { values: { regime: "tender", minimum: "250.00", provenance: "STATED", governingSource: "FR-ADV-008; SK002 7.4.2(d)" } },
    ]);
  });
});

describe("A11 and A12: methods, contract types and series", () => {
  it("open Schedule of Rates at every band with no approval rule, and give the two direct methods no document pack (ASSUMED)", () => {
    expect(method("schedule_of_rates")).toMatchObject({ availableBelow: true, availableInQuotation: true, availableInTender: true, notes: expect.stringContaining("answer 14") });
    expect(method("schedule_of_rates")).not.toHaveProperty("authorityMethodKey");
    for (const c of ["direct_appointment", "selective_direct_appointment"]) expect(method(c), c).toMatchObject({ documentPackKind: "NONE", documentPackKindProvenance: "ASSUMED" });
    expect(method("direct_appointment")).toMatchObject({ requiresDossier: true, dossierSeriesKey: "direct_appointment" });
    // Each method would save as the configuration screen judges it, against the series both packs load.
    const seriesKeys = [RSAJ_PACK, GENERIC_PACK].flatMap((p) => p.lists.filter((l) => l.model === "NumberingSeries").flatMap((l) => l.rows.map((r) => r.code)));
    const all = listOf("SourcingMethod").map((r) => method(r.code));
    for (const m of all) expect(methodConfigFaults(m, all.filter((o) => o !== m), seriesKeys), m.code).toEqual([]);
  });

  it("number work, service and supply contracts RSAJ/KP/T and consultancy services RSAJ/KP/P", () => {
    expect(listOf("ContractType").map((t) => [t.code, t.values.nameEn, t.values.contractSeriesKey])).toEqual([
      ["work", "Work", "contract_tender"],
      ["service", "Service", "contract_tender"],
      ["supply", "Supply", "contract_tender"],
      ["consultancy", "Consultancy services", "contract_consultancy"],
    ]);
    const series = Object.fromEntries(listOf("NumberingSeries").map((s) => [s.code, s.values]));
    for (const key of ["contract_tender", "contract_consultancy", "exercise_tender", "direct_appointment"]) expect(series[key], key).toMatchObject({ padding: 2, resetOn: "CALENDAR_YEAR" });
    expect([series.exercise_tender.pattern, series.direct_appointment.pattern]).toEqual(["RSAJ/TA/{SERIAL}/{YEAR}", "RSAJ/KP/ST/{SERIAL}/{SHORTYEAR}"]);
  });
});
