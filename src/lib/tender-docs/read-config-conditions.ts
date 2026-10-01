/**
 * What Configuration › Tender documents reads for increment 2: the registration bodies,
 * the clauses, and the policy's restriction wording, assurance answer and permit list, each
 * with where it comes from. Unset reads "Not set" and says what it holds back. Reads only.
 */

import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { PROVENANCE_LABEL } from "@/lib/scope/labels";

import { partRetiredOn } from "./config";
import { conditionsHoldingWorkBack, permitListUseFaults } from "./config-conditions";
import { NOT_SET, yesNoNotSet } from "./labels";
import { loadClauses, loadRegistrationBodies, loadTaxonomyUses, loadTenderPolicy } from "./repo";

const provenance = (p: string | null | undefined) => (p ? ((PROVENANCE_LABEL as Record<string, string>)[p] ?? NOT_SET) : NOT_SET);

export async function conditionsConfig(showRetired = false) {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const [bodies, clauses, policy, taxonomies, uses] = await Promise.all([
    loadRegistrationBodies(org.id),
    loadClauses(org.id),
    loadTenderPolicy(org.id),
    db.classificationTaxonomy.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, _count: { select: { values: true } } } }),
    loadTaxonomyUses(org.id),
  ]);
  const today = todayIn(new Date(), org.timeZone);
  const retired = (r: string | null) => partRetiredOn(r, today) === true;
  const list = policy.regulatorPermitTaxonomyCode ? (taxonomies.find((t) => t.code === policy.regulatorPermitTaxonomyCode) ?? null) : null;
  return {
    holdingWorkBack: conditionsHoldingWorkBack(policy.assuranceRequired, clauses, today),
    bodies: bodies
      .filter((b) => showRetired || !retired(b.retiredOn))
      .map((b) => ({
        id: b.id,
        name: b.labelEn,
        nameMs: b.labelMs,
        statedWithIt: b.qualifierLabelEn ?? "Nothing",
        provenance: b.provenance,
        governingSource: b.governingSource || null,
        retired: retired(b.retiredOn),
        retiredOn: b.retiredOn,
        values: { code: b.code, labelEn: b.labelEn, labelMs: b.labelMs ?? "", qualifierLabelEn: b.qualifierLabelEn ?? "", sortOrder: String(b.sortOrder), governingSource: b.governingSource, provenance: b.provenance, notes: b.notes },
      })),
    clauses: clauses
      .filter((c) => showRetired || !retired(c.retiredOn))
      .map((c) => ({
        id: c.id,
        title: c.titleEn,
        version: `Text version ${c.bodyVersion}`,
        mandatory: yesNoNotSet(c.mandatoryInAgreements),
        malay: c.bodyMs?.trim() ? "English and Malay" : "English only",
        provenance: c.provenance,
        governingSource: c.governingSource || null,
        retired: retired(c.retiredOn),
        retiredOn: c.retiredOn,
        values: { code: c.code, titleEn: c.titleEn, titleMs: c.titleMs ?? "", bodyEn: c.bodyEn, bodyMs: c.bodyMs ?? "", mandatoryInAgreements: c.mandatoryInAgreements == null ? "unset" : c.mandatoryInAgreements ? "yes" : "no", sortOrder: String(c.sortOrder), governingSource: c.governingSource, provenance: c.provenance, notes: c.notes },
      })),
    retiredCount: bodies.filter((b) => retired(b.retiredOn)).length + clauses.filter((c) => retired(c.retiredOn)).length,
    policy: {
      restrictionAskedAs: policy.restrictionLabelEn ?? NOT_SET,
      restrictionProvenance: policy.restrictionProvenance,
      assuranceProvenance: policy.assuranceProvenance,
      permitList: list ? `${list.nameEn} (${list._count.values} types)` : policy.regulatorPermitTaxonomyCode ? "A list no longer configured" : NOT_SET,
      provenanceText: { restriction: provenance(policy.restrictionProvenance), assurance: provenance(policy.assuranceProvenance) },
    },
    /// Only plain lists: a taxonomy contract types are mapped into, exercises are classified in or a policy reads is a classification (C2). The one already chosen stays so it can be seen and changed.
    taxonomyOptions: taxonomies.filter((t) => t.code === policy.regulatorPermitTaxonomyCode || permitListUseFaults(uses.get(t.code)).length === 0).map((t) => ({ value: t.code, label: t.nameEn })),
  };
}
