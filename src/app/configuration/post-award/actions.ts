"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { FormReader } from "@/lib/validate";

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
  if (pct && (!/^\d{1,3}(\.\d{1,4})?$/.test(pct) || Number(pct) <= 0 || Number(pct) > 100)) r.reject("inDelayProgressPct", "A percentage above nothing and at most 100, to at most four places (70 judges a contract In Delay below 70% of the planned progress).");
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
