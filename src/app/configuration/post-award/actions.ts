"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { CLOCK_WORDS, REMAINDER_WORDS, ROUTE_FIGURE_WORDS } from "@/lib/payment/labels";
import { CONTRACT_CLOCKS, PAYMENT_ROUTE_FIGURES, WATERFALL_REMAINDERS } from "@/lib/payment/types";
import { parsePercent, percentAboveZero } from "@/lib/securities/money";
import { BASE_WORDS, BASIS_WORDS, SCHEDULE_FORM_WORDS } from "@/lib/variation/labels";
import { SCHEDULE_FORMS, VARIATION_BASES, VARIATION_PCT_BASES } from "@/lib/variation/types";
import { FormReader } from "@/lib/validate";

/// The certificate kinds the payment and damages chain, and the variations and adjustments, raise (each needs its
/// form; a routing sheet is optional).
const PAYMENT_KINDS = ["INTERIM_PAYMENT", "ADVANCE_PAYMENT", "LAD_WARNING", "NON_COMPLETION", "VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] as const;
/// The kinds that take no routing sheet: approved on the variation's own routes, or going by none.
const NO_SHEET_KINDS = ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION"] as const;

/**
 * Post-award controls (6.13 Part A): the In Delay percentage, whether the S.O. follows the contract sum across a
 * band, and the forms the delegation letters print on. Every setting ships unset; saving an empty field clears it
 * back to unset, which is recorded. Audited with before and after in the same transaction.
 */

const PATH = "/configuration/post-award";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const FORM_FIELDS = ["delegationLetterConventionalId", "delegationNoticeConventionalId", "delegationLetterDesignBuildId", "delegationNoticeDesignBuildId"] as const;

export async function savePostAwardPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const pct = r.optionalText("inDelayProgressPct")?.trim().replace(/%$/, "") ?? null;
  if (pct && (!/^\d{1,3}(\.\d{1,4})?$/.test(pct) || Number(pct) <= 0 || Number(pct) > 100)) r.reject("inDelayProgressPct", "A percentage above nothing and at most 100, to at most four places: a contract is In Delay below that share of its planned progress.");
  const follow = r.choice("soReResolve", "Whether the S.O. follows the contract sum", ["yes", "no"] as const);
  const forms = Object.fromEntries(FORM_FIELDS.map((f) => [f, r.optionalText(f)])) as Record<(typeof FORM_FIELDS)[number], string | null>;
  const v = {
    inDelayProgressPct: pct || null,
    inDelayProvenance: r.choice("inDelayProvenance", "Where the percentage came from", PROVENANCE),
    soReResolve: follow == null ? null : follow === "yes",
    soReResolveProvenance: r.choice("soReResolveProvenance", "Where that came from", PROVENANCE),
    ...forms,
    delegationFormsProvenance: r.choice("delegationFormsProvenance", "Where the forms came from", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const ids = FORM_FIELDS.map((f) => v[f]).filter((x): x is string => !!x);
    const templates = ids.length ? await tx.documentTemplate.findMany({ where: { organisationId: o.id, id: { in: ids } }, select: { id: true, nameEn: true } }) : [];
    for (const f of FORM_FIELDS) if (v[f] && !templates.some((t) => t.id === v[f])) return { ok: false, errors: { [f]: "Choose a form configured under Templates." } } as FormState;
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const before = await tx.postAwardPolicy.findUnique({ where: { organisationId: o.id } });
    const row = await tx.postAwardPolicy.upsert({ where: { organisationId: o.id }, update: v, create: { organisationId: o.id, ...v } });
    // The trail names forms and answers in words, never ids or codes.
    const formName = (id: string | null | undefined) => (id ? (templates.find((t) => t.id === id)?.nameEn ?? "a form no longer configured") : null);
    const words = (x: typeof v | NonNullable<typeof before>) => ({
      inDelayPercentage: x.inDelayProgressPct == null ? null : x.inDelayProgressPct.toString(),
      inDelayProvenance: x.inDelayProvenance,
      soFollowsTheSum: x.soReResolve == null ? null : x.soReResolve ? "yes" : "no",
      soFollowsProvenance: x.soReResolveProvenance,
      letterConventional: formName(x.delegationLetterConventionalId),
      notificationConventional: formName(x.delegationNoticeConventionalId),
      letterDesignAndBuild: formName(x.delegationLetterDesignBuildId),
      notificationDesignAndBuild: formName(x.delegationNoticeDesignBuildId),
      formsProvenance: x.delegationFormsProvenance,
      notes: x.notes,
    });
    if (before) {
      // A form named before but since removed from this save is read through the earlier name list.
      const earlier = await tx.documentTemplate.findMany({ where: { organisationId: o.id, id: { in: FORM_FIELDS.map((f) => before[f]).filter((x): x is string => !!x) } }, select: { id: true, nameEn: true } });
      templates.push(...earlier.filter((t) => !templates.some((x) => x.id === t.id)));
    }
    const changes = diffFields(before ? words(before) : null, words(v));
    if (!before || changes.length) await writeAudit(tx, { organisationId: o.id, entity: "PostAwardPolicy", entityId: row.id, entityLabel: "Post-award controls", reason }, before ? "UPDATE" : "CREATE", changes);
    revalidatePath(PATH);
    revalidatePath("/projects");
    return { ok: true };
  });
}

// ------------------------------------------------------------------ 6.13 Part A step 3: interim payment

const pctOf = (r: FormReader, name: string, label: string) => {
  const v = r.optionalText(name)?.trim().replace(/%$/, "") ?? null;
  if (v && (!/^\d{1,3}(\.\d{1,4})?$/.test(v) || !percentAboveZero(v) || parsePercent(v) > 1_000_000n)) r.reject(name, `${label}: a percentage above nothing and at most 100, to at most four places.`);
  return v || null;
};

/**
 * The interim payment controls (FR-PAY-007, 014, 015, 016, 021; OD-A4, OD-A6): each ships unset and is saved with
 * where it came from; an empty field clears it back to unset, recorded.
 */
export async function savePaymentPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const limitRaw = r.optionalText("preExecutionInterimLimit")?.trim() ?? null;
  if (limitRaw && !/^\d{1,3}$/.test(limitRaw)) r.reject("preExecutionInterimLimit", "A whole number of certificates (none is 0).");
  const v = {
    unfixedMaterialsDefaultPct: pctOf(r, "unfixedMaterialsDefaultPct", "The allowance on unfixed materials"),
    unfixedMaterialsProvenance: r.choice("unfixedMaterialsProvenance", "Where it came from", PROVENANCE),
    firstReleasePct: pctOf(r, "firstReleasePct", "The first release of retention"),
    firstReleaseProvenance: r.choice("firstReleaseProvenance", "Where it came from", PROVENANCE),
    paymentRouteFigure: r.choice("paymentRouteFigure", "The figure an interim certificate is routed on", PAYMENT_ROUTE_FIGURES),
    paymentRouteProvenance: r.choice("paymentRouteProvenance", "Where it came from", PROVENANCE),
    waterfallRemainder: r.choice("waterfallRemainder", "Where a pro-rata split's sen go", WATERFALL_REMAINDERS),
    waterfallProvenance: r.choice("waterfallProvenance", "Where it came from", PROVENANCE),
    preExecutionInterimLimit: limitRaw ? Number.parseInt(limitRaw, 10) : null,
    preExecutionProvenance: r.choice("preExecutionProvenance", "Where it came from", PROVENANCE),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const before = await tx.postAwardPolicy.findUnique({ where: { organisationId: o.id } });
    const row = await tx.postAwardPolicy.upsert({ where: { organisationId: o.id }, update: v, create: { organisationId: o.id, ...v } });
    const words = (x: { unfixedMaterialsDefaultPct: unknown; unfixedMaterialsProvenance: string | null; firstReleasePct: unknown; firstReleaseProvenance: string | null; paymentRouteFigure: string | null; paymentRouteProvenance: string | null; waterfallRemainder: string | null; waterfallProvenance: string | null; preExecutionInterimLimit: number | null; preExecutionProvenance: string | null }) => ({
      materialsAllowance: x.unfixedMaterialsDefaultPct == null ? null : `${String(x.unfixedMaterialsDefaultPct)}%`,
      materialsProvenance: x.unfixedMaterialsProvenance,
      firstRetentionRelease: x.firstReleasePct == null ? null : `${String(x.firstReleasePct)}%`,
      firstReleaseProvenance: x.firstReleaseProvenance,
      routedOn: x.paymentRouteFigure ? ROUTE_FIGURE_WORDS[x.paymentRouteFigure as keyof typeof ROUTE_FIGURE_WORDS].en : null,
      routedOnProvenance: x.paymentRouteProvenance,
      proRataRemainder: x.waterfallRemainder ? REMAINDER_WORDS[x.waterfallRemainder as keyof typeof REMAINDER_WORDS].en : null,
      remainderProvenance: x.waterfallProvenance,
      certificatesBeforeSigning: x.preExecutionInterimLimit,
      beforeSigningProvenance: x.preExecutionProvenance,
    });
    const changes = diffFields(before ? words(before) : null, words(v));
    if (!before || changes.length) await writeAudit(tx, { organisationId: o.id, entity: "PostAwardPolicy", entityId: row.id, entityLabel: "Post-award controls", reason }, before ? "UPDATE" : "CREATE", changes);
    revalidatePath(PATH);
    revalidatePath("/projects");
    return { ok: true };
  });
}

/// The form a certificate kind prints on and the routing sheet it goes on (CertificateKindSetting). Empty: unset.
export async function saveKindSetting(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const kind = r.choice("certificateKind", "Certificate", PAYMENT_KINDS, { required: true });
  const templateId = r.optionalText("templateId");
  const routingTypeId = r.optionalText("routingTypeId");
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !kind || !provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const template = templateId ? await tx.documentTemplate.findFirst({ where: { id: templateId, organisationId: o.id }, select: { id: true, nameEn: true } }) : null;
    if (templateId && !template) return { ok: false, errors: { templateId: "Choose a form configured under Templates." } } as FormState;
    const type = routingTypeId ? await tx.routingSheetType.findFirst({ where: { id: routingTypeId, organisationId: o.id }, select: { id: true, labelEn: true, subject: true, certificateKind: true, retiredOn: true } }) : null;
    if (routingTypeId && !type) return { ok: false, errors: { routingTypeId: "Choose a routing sheet configured under Routing sheets." } } as FormState;
    if (type?.retiredOn) return { ok: false, errors: { routingTypeId: "That routing sheet is retired: choose one in use." } } as FormState;
    if (type && (type.subject !== "CERTIFICATE" || (type.certificateKind != null && type.certificateKind !== kind))) return { ok: false, errors: { routingTypeId: "That routing sheet is for another kind of document." } } as FormState;
    // 6.13 Part A step 4: the variation's application, instruction and order are approved on the variation's own routes
    // (or go by no route), so none goes on a routing sheet, whose approval would be read from a route it never has.
    if (type && (NO_SHEET_KINDS as readonly string[]).includes(kind)) return { ok: false, errors: { routingTypeId: "This certificate is approved on its variation's own routes: it takes no routing sheet." } } as FormState;
    const before = await tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: o.id, kind } }, include: { template: { select: { nameEn: true } }, routingType: { select: { labelEn: true } } } });
    const row = await tx.certificateKindSetting.upsert({ where: { organisationId_kind: { organisationId: o.id, kind } }, update: { templateId: template?.id ?? null, routingTypeId: type?.id ?? null, provenance, notes }, create: { organisationId: o.id, kind, templateId: template?.id ?? null, routingTypeId: type?.id ?? null, provenance, notes } });
    const changes = diffFields(before ? { form: before.template?.nameEn ?? null, routingSheet: before.routingType?.labelEn ?? null, provenance: before.provenance, notes: before.notes } : null, { form: template?.nameEn ?? null, routingSheet: type?.labelEn ?? null, provenance, notes });
    if (!before || changes.length) await writeAudit(tx, { organisationId: o.id, entity: "CertificateKindSetting", entityId: row.id, entityLabel: `Post-award controls · ${KIND_WORDS[kind].en}`, reason }, before ? "UPDATE" : "CREATE", changes);
    revalidatePath(PATH);
    return { ok: true };
  });
}

/// A contract clock (ContractClockRule): its length and unit with where it came from; saving it empty removes it, with the reason.
export async function saveClockRule(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const clock = r.choice("clock", "Clock", CONTRACT_CLOCKS, { required: true });
  const length = r.int("length", "Length", { min: 1 });
  const unit = r.choice("unit", "Unit", ["DAYS", "WEEKS", "MONTHS"] as const);
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE);
  const notes = r.text("notes", "Notes", { max: 2000 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (length != null && (!unit || !provenance)) {
    if (!unit) r.reject("unit", "Choose the unit.");
    if (!provenance) r.reject("provenance", "Say where the figure came from: there is no default.");
  }
  if (r.failed || !clock) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const before = await tx.contractClockRule.findUnique({ where: { organisationId_clock: { organisationId: o.id, clock } } });
    const label = `Post-award controls · ${CLOCK_WORDS[clock].en}`;
    const text = (x: { length: number; unit: string } | null) => (x ? `${x.length} ${x.unit === "DAYS" ? "calendar days" : x.unit === "WEEKS" ? "weeks" : "months"}` : null);
    if (length == null) {
      if (!before) return { ok: true };
      if (!reason.trim()) return { ok: false, errors: { reason: "Say why the clock is removed." } } as FormState;
      await tx.contractClockRule.delete({ where: { id: before.id } });
      await writeAudit(tx, { organisationId: o.id, entity: "ContractClockRule", entityId: before.id, entityLabel: label, reason }, "DELETE", diffFields({ clock: text(before), provenance: before.provenance }, { clock: null, provenance: null }));
    } else {
      const row = await tx.contractClockRule.upsert({ where: { organisationId_clock: { organisationId: o.id, clock } }, update: { length, unit: unit!, provenance: provenance!, notes }, create: { organisationId: o.id, clock, length, unit: unit!, provenance: provenance!, notes } });
      const changes = diffFields(before ? { clock: text(before), provenance: before.provenance, notes: before.notes } : null, { clock: text({ length, unit: unit! }), provenance, notes });
      if (!before || changes.length) await writeAudit(tx, { organisationId: o.id, entity: "ContractClockRule", entityId: row.id, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
    }
    revalidatePath(PATH);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ 6.13 Part A step 4: variations

/**
 * The variation controls (OD-A2, OD-A5, FR-VAR-009): what a variation's percentage is of and the sum it is taken over;
 * which schedule form a variation produces where an agreed rate exists and where none does; which committee decides a
 * funder's consent. Each ships unset and is saved with where it came from; an empty field clears it back to unset,
 * recorded. Audited with before and after in the same transaction.
 */
export async function saveVariationPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    variationPctBasis: r.choice("variationPctBasis", "What a variation's percentage is of", VARIATION_PCT_BASES),
    variationBase: r.choice("variationBase", "The sum it is taken over", VARIATION_BASES),
    variationProvenance: r.choice("variationProvenance", "Where that came from", PROVENANCE),
    scheduleFormAgreedRate: r.choice("scheduleFormAgreedRate", "The schedule form where an agreed rate exists", SCHEDULE_FORMS),
    scheduleFormNoAgreedRate: r.choice("scheduleFormNoAgreedRate", "The schedule form where none does", SCHEDULE_FORMS),
    scheduleFormProvenance: r.choice("scheduleFormProvenance", "Where that came from", PROVENANCE),
    funderConsentCommitteeId: r.optionalText("funderConsentCommitteeId"),
    funderConsentProvenance: r.choice("funderConsentProvenance", "Where that came from", PROVENANCE),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const committee = v.funderConsentCommitteeId ? await tx.committee.findFirst({ where: { id: v.funderConsentCommitteeId, organisationId: o.id }, select: { id: true, nameEn: true } }) : null;
    if (v.funderConsentCommitteeId && !committee) return { ok: false, errors: { funderConsentCommitteeId: "Choose a committee configured under Committees." } } as FormState;
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const before = await tx.postAwardPolicy.findUnique({ where: { organisationId: o.id }, include: { funderConsentCommittee: { select: { nameEn: true } } } });
    const row = await tx.postAwardPolicy.upsert({ where: { organisationId: o.id }, update: v, create: { organisationId: o.id, ...v } });
    const words = (x: { variationPctBasis: string | null; variationBase: string | null; variationProvenance: string | null; scheduleFormAgreedRate: string | null; scheduleFormNoAgreedRate: string | null; scheduleFormProvenance: string | null; funderConsentProvenance: string | null }, committeeName: string | null) => ({
      percentageOf: x.variationPctBasis ? BASIS_WORDS[x.variationPctBasis as keyof typeof BASIS_WORDS].en : null,
      takenOver: x.variationBase ? BASE_WORDS[x.variationBase as keyof typeof BASE_WORDS].en : null,
      percentageProvenance: x.variationProvenance,
      scheduleWithAgreedRate: x.scheduleFormAgreedRate ? SCHEDULE_FORM_WORDS[x.scheduleFormAgreedRate as keyof typeof SCHEDULE_FORM_WORDS].en : null,
      scheduleWithoutAgreedRate: x.scheduleFormNoAgreedRate ? SCHEDULE_FORM_WORDS[x.scheduleFormNoAgreedRate as keyof typeof SCHEDULE_FORM_WORDS].en : null,
      scheduleProvenance: x.scheduleFormProvenance,
      fundersConsentBy: committeeName,
      consentProvenance: x.funderConsentProvenance,
    });
    const changes = diffFields(before ? words(before, before.funderConsentCommittee?.nameEn ?? null) : null, words(v, committee?.nameEn ?? null));
    if (!before || changes.length) await writeAudit(tx, { organisationId: o.id, entity: "PostAwardPolicy", entityId: row.id, entityLabel: "Post-award controls", reason }, before ? "UPDATE" : "CREATE", changes);
    revalidatePath(PATH);
    revalidatePath("/projects");
    return { ok: true };
  });
}
