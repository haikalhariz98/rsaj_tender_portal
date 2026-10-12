/**
 * What the Tender documents tab's increment-2 cards read: the tender's conditions (the
 * registrations required, the restriction, the regulator permit), the assurance
 * confirmations and the mandatory clauses — each in words, each act carrying whether it is
 * allowed and why not, judged by the rule the action runs. Before submission it reads the
 * live rows; once the pack is frozen it reads what was frozen (`conditionsSnapshot`), so a
 * later configuration edit never rewrites what was judged. Reads only.
 */

import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadExercise } from "@/lib/method/repo";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { PROVENANCE_LABEL } from "@/lib/scope/labels";

import { assuranceKindsFor, confirmFaults, type AssuranceKind } from "./assurance";
import { CLAUSE_STATUS, triOf } from "./conditions-view";
import { clauseFaults, liveClauses, overrideFaults } from "./clauses";
import { readConditionsSnapshot } from "./conditions";
import { ASSURANCE_KIND_LABEL, CONDITIONS_FROZEN_TEXT, conditionsFaultText, confirmFaultText, overrideFaultText, restrictionQuestion } from "./conditions-labels";
import { eligibilityEditFault, eligibilityFaults, noticeFaults, registrationText } from "./eligibility";
import { assuranceRequiredText, BEFORE_CONDITIONS_TEXT, frozenConditionsView, groupHeadings } from "./frozen-view";
import { NOT_SET, yesNoNotSet } from "./labels";
import { permitFaults, permitLabel } from "./permit";
import { loadConfirmations, loadOverrides, loadPacks, loadPermitList, loadRegistrationBodies, loadRequirements, loadTenderPolicy, loadClauses, issuedPartsOf, profileOf } from "./repo";
import { needLabel, type NeedKind } from "./requirement-needs";
import { loadNeedValues } from "./requirement-store";
import { restrictionFaults } from "./stamp";
import type { Finding } from "./types";

type Allowed = { allowed: true } | { allowed: false; reason: string };
const ok: Allowed = { allowed: true };
const no = (reason: string): Allowed => ({ allowed: false, reason });
const provenance = (p: string | null | undefined) => (p ? ((PROVENANCE_LABEL as Record<string, string>)[p] ?? NOT_SET) : null);
const words = (fs: readonly Finding[]) => fs.map((f) => ({ level: f.level, text: conditionsFaultText(f) }));

export async function conditionsTab(organisationId: string, exerciseId: string) {
  const l = await loadExercise(organisationId, exerciseId);
  if (!l) return null;
  const { ex, org } = l;
  const today = org.today;
  const packs = await loadPacks(exerciseId);
  const frozenPack = packs.find((p) => p.status === "SUBMITTED" || p.status === "APPROVED") ?? null;

  // Once the documents are with approval or approved, every card is built from what was frozen on the
  // pack, and from nothing live (code review C1): no finding, badge or label is read from configuration.
  if (frozenPack) {
    const snapshot = readConditionsSnapshot(frozenPack.conditionsSnapshot);
    if (snapshot) return { mode: "frozen" as const, exerciseId, frozen: frozenConditionsView(snapshot, frozenPack.versionNo) };
    // Frozen before the conditions were recorded with the documents: say so, and show what the exercise itself recorded.
    const [policy, recorded] = await Promise.all([loadTenderPolicy(org.id), loadRequirements(exerciseId)]);
    const list = await loadPermitList(org.id, policy.regulatorPermitTaxonomyCode, today);
    return {
      mode: "before" as const,
      exerciseId,
      version: frozenPack.versionNo,
      before: BEFORE_CONDITIONS_TEXT,
      groups: groupHeadings(recorded, (r) => ({ body: r.bodyLabel, qualifiers: r.qualifiers || null })),
      restriction: { question: restrictionQuestion(policy.restrictionLabelEn), answer: yesNoNotSet(ex.restrictedTender) },
      permit: { answer: yesNoNotSet(ex.regulatedActivity), type: ex.regulatedActivity ? (permitLabel(true, ex.regulatorPermitCode, list) ?? NOT_SET) : null },
    };
  }

  const [policy, bodies, requirements, clauses, people] = await Promise.all([
    loadTenderPolicy(org.id),
    loadRegistrationBodies(org.id),
    loadRequirements(exerciseId),
    loadClauses(org.id),
    db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const needValues = await loadNeedValues(org.id);
  const list = await loadPermitList(org.id, policy.regulatorPermitTaxonomyCode, today);
  const draft = packs.find((p) => p.status === "DRAFT") ?? null;
  const editFault = eligibilityEditFault(ex.status);
  const edit: Allowed = editFault ? no(CONDITIONS_FROZEN_TEXT) : today ? ok : no("The organisation's time zone is not set, so the tender's conditions cannot be judged. Set it under Configuration, Organisation.");
  // Review S4: the parts as submission will read them (settled, and issued from the source each has), so a card says what the gate will raise.
  const parts = draft ? await issuedPartsOf(db, org, ex, draft) : [];
  const isLive = (retiredOn: string | null) => today != null && (retiredOn == null || retiredOn > today);
  const profile = profileOf(ex.classificationSnapshot);
  const registrationTest = profile?.find((p) => p.key === "registrationTest")?.value;

  // ---- the registrations (FR-DOC-005). 615-C1: what each live body offers to ask for, by the body's code, as "code - name" (a body that takes nothing stated with it offers nothing).
  const needOptionsOf = (kind: NeedKind) =>
    Object.fromEntries(bodies.filter((b) => isLive(b.retiredOn)).map((b) => [b.code, b.qualifierLabelEn ? needValues.filter((v) => v.bodyCode === b.code && v.kind === kind && isLive(v.retiredOn)).map((v) => ({ value: v.id, label: needLabel(v) })) : []]));
  const eligibility = {
    needOptions: { grade: needOptionsOf("GRADE"), categories: needOptionsOf("CATEGORY"), specialisations: needOptionsOf("SPECIALISATION"), fieldCodes: needOptionsOf("FIELD_CODE"), permits: needOptionsOf("PERMIT_TYPE") },
    groups: groupHeadings(requirements, (r) => ({ id: r.id, body: r.bodyLabel, qualifiers: r.qualifiers || null, qualifierLabel: r.qualifierLabel })),
    text: requirements.length ? registrationText(requirements, "EN") : null,
    /// The contract type's registration test, as the exercise was decided under it: guidance for choosing the bodies.
    typeTest: typeof registrationTest === "string" ? registrationTest : NOT_SET,
    findings: today ? words([...eligibilityFaults(requirements, bodies, today), ...(draft ? noticeFaults(parts) : [])]) : [],
    bodyOptions: bodies.filter((b) => isLive(b.retiredOn)).map((b) => ({ value: b.code, label: b.qualifierLabelEn ? `${b.labelEn} (state: ${b.qualifierLabelEn.toLowerCase()})` : b.labelEn })),
    noBodies: bodies.filter((b) => isLive(b.retiredOn)).length === 0 ? "No registration bodies are configured. Add them under Configuration, Tender documents." : null,
    /// Where a new registration goes: a requirement of its own, or an alternative to one already listed (the officer never types a group number).
    groupOptions: [
      { value: String(requirements.reduce((m, r) => Math.max(m, r.alternativeGroup), 0) + 1), label: "A new requirement" },
      ...groupHeadings(requirements, (r) => r.bodyLabel).map((g) => ({ value: String(g.number), label: `An alternative to: ${g.items.join(" or ")}` })),
    ],
  };

  // ---- the restriction (FR-DOC-009)
  const restriction = {
    question: restrictionQuestion(policy.restrictionLabelEn),
    answer: yesNoNotSet(ex.restrictedTender),
    raw: triOf(ex.restrictedTender),
    stampEn: policy.restrictionStampTextEn ?? NOT_SET,
    stampMs: policy.restrictionStampTextMs ?? NOT_SET,
    provenance: provenance(policy.restrictionProvenance),
    findings: words(restrictionFaults({ restricted: ex.restrictedTender, stamp: { EN: policy.restrictionStampTextEn, MS: policy.restrictionStampTextMs }, parts })),
  };

  // ---- the regulator permit (FR-DOC-006)
  const permit = {
    answer: yesNoNotSet(ex.regulatedActivity),
    raw: triOf(ex.regulatedActivity),
    permit: ex.regulatedActivity ? (permitLabel(true, ex.regulatorPermitCode, list) ?? NOT_SET) : null,
    rawPermit: ex.regulatorPermitCode ?? "",
    list: list?.name ?? NOT_SET,
    options: (list?.values ?? []).filter((v) => !v.retired).map((v) => ({ value: v.code, label: v.label })),
    findings: words(permitFaults({ regulated: ex.regulatedActivity, permitCode: ex.regulatorPermitCode, list, parts: draft ? parts : [] }).filter((f) => draft || !["INSTRUCTIONS_PART_MISSING"].includes(f.code))),
  };

  // ---- assurance (FR-DOC-014), on the draft
  const confirmations = draft ? await loadConfirmations(draft.id) : [];
  const overridesOf = draft ? await loadOverrides(draft.id) : [];
  // Who confirmed each assurance and who endorsed each left-out clause, signed or recorded from paper, is read from the attributions (Phase 2b).
  const attributed = await loadAttributions(db, org.id, [
    { entity: "PackAssurance", slot: "person", ids: confirmations.map((c) => c.id) },
    { entity: "ClauseOverride", slot: "person", ids: overridesOf.map((o) => o.id) },
  ]);
  const startedOn = draft ? dayOf(draft.createdAt, org.timeZone) : null;
  const needed = draft ? assuranceKindsFor(parts) : [];
  const assurance = {
    required: assuranceRequiredText(policy.assuranceRequired),
    /// The raw answer: the card is hidden only on an explicit no, never on an unanswered policy.
    policy: triOf(policy.assuranceRequired),
    provenance: provenance(policy.assuranceProvenance),
    policyNotSet: policy.assuranceRequired == null ? conditionsFaultText({ code: "ASSURANCE_POLICY_NOT_SET", level: "block" }) : null,
    rows: (["NO_AMBIGUITY", "DRAWINGS_COORDINATED"] as const).map((kind) => {
      const c = confirmations.find((x) => x.kind === kind) ?? null;
      const record = draft
        ? (() => {
            const fs = confirmFaults({ packStatus: draft.status, exerciseStatus: ex.status, kind, parts, existing: confirmations, person: { isActive: true }, confirmedOn: today, today, packStartedOn: startedOn });
            return fs.length ? no(fs.map(confirmFaultText).join(" ")) : ok;
          })()
        : no("Start the tender documents first.");
      return {
        kind: kind as AssuranceKind,
        label: ASSURANCE_KIND_LABEL[kind],
        needed: needed.includes(kind),
        notNeeded: draft && !needed.includes(kind) ? "The pack binds no drawings, so there is nothing to coordinate." : null,
        confirmation: c ? { id: c.id, by: attributed.read({ entity: "PackAssurance", id: c.id, slot: "person" }, c.personName).en, on: formatDate(c.confirmedOn), note: c.note || null } : null,
        record: policy.assuranceRequired === false ? no("The organisation's policy is that the confirmations are not required.") : record,
      };
    }),
    remove: draft && ex.status === "DOCUMENTS_IN_PREPARATION" ? ok : no(confirmFaultText({ code: "PACK_NOT_EDITABLE", level: "block" })),
  };

  // ---- mandatory clauses (FR-DOC-011)
  const overrides = overridesOf;
  const live = today ? liveClauses(clauses, today) : [];
  const clauseFindings = draft && today ? clauseFaults(parts, clauses, overrides, today) : [];
  const clauseRows = live.map((c) => {
    const ov = overrides.find((o) => o.clauseCode === c.code) ?? null;
    const missing = clauseFindings.filter((f) => f.level === "block" && f.data?.clause === c.titleEn);
    const status = c.mandatoryInAgreements == null ? CLAUSE_STATUS.notSet : !c.mandatoryInAgreements ? CLAUSE_STATUS.notRequired : ov ? CLAUSE_STATUS.endorsed : !draft ? CLAUSE_STATUS.notChecked : missing.length ? CLAUSE_STATUS.missing : CLAUSE_STATUS.carried;
    const canOverride = draft && today ? overrideFaults({ packStatus: draft.status, exerciseStatus: ex.status, clause: c, today, existing: overrides, person: { isActive: true }, reason: "given" }) : [];
    return {
      code: c.code,
      title: c.titleEn,
      version: `Text version ${c.bodyVersion}`,
      status,
      tone: status === CLAUSE_STATUS.carried ? ("ok" as const) : status === CLAUSE_STATUS.missing || status === CLAUSE_STATUS.notSet ? ("warn" as const) : ("neutral" as const),
      findings: missing.map(conditionsFaultText),
      override: ov ? { id: ov.id, by: attributed.read({ entity: "ClauseOverride", id: ov.id, slot: "person" }, ov.personName).en, reason: ov.reason } : null,
      record: c.mandatoryInAgreements !== true ? null : !draft ? no("Start the tender documents first.") : canOverride.length ? no(canOverride.map(overrideFaultText).join(" ")) : ok,
    };
  });
  const clausesView = {
    rows: clauseRows,
    none: live.length === 0 ? "No clauses are configured. A clause every agreement must carry is added under Configuration, Tender documents." : null,
    remove: draft && ex.status === "DOCUMENTS_IN_PREPARATION" ? ok : no(overrideFaultText({ code: "PACK_NOT_EDITABLE", level: "block" })),
  };

  return {
    mode: "live" as const,
    exerciseId,
    edit,
    hasDraft: !!draft,
    eligibility,
    restriction,
    permit,
    assurance,
    clauses: clausesView,
    people: people.map((p) => ({ value: p.id, label: p.name })),
    today,
  };
}

export type ConditionsTab = NonNullable<Awaited<ReturnType<typeof conditionsTab>>>;
export type LiveConditions = Extract<ConditionsTab, { mode: "live" }>;
