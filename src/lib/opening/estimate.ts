/**
 * The one place an opening reads the company estimate's figure (ADR 0012, 0017; OD-2 A, C-1): in the
 * finalising transaction, after every other finalise check passed, under the estimate's row lock.
 * It discloses the estimate through 6.2's `disclose` (state DISCLOSED, a DISCLOSED custody event,
 * both audited), then reads the figures through `readSealedFigures`, the 6.2 store's one accessor,
 * and returns the benchmark row (`benchmarkRow`, which shows nothing before disclosure) and the
 * comparison of the paper copy with the lodged version (C-1). Nothing in `src/app` reads the
 * figures (the 6.2 source scan); the action hands this a paper copy and gets back only what the
 * frozen schedule needs.
 */

import type { Tx } from "@/lib/audit/record";
import { writeAudit } from "@/lib/audit/record";
import type { Sen } from "@/lib/money";
import { estimateEventAudit, estimateStateAudit, ENTITY as SCOPE_ENTITY } from "@/lib/scope/audit-view";
import { benchmarkRow, disclose, type EstimateFacts } from "@/lib/scope/estimate";
import { readSealedFigures } from "@/lib/scope/estimate-store";
import { ESTIMATE_STATE_LABEL } from "@/lib/scope/labels";
import { lockEstimateRow } from "@/lib/scope/lock";

import { disclosureFault } from "./disclosure";
import { copyCheck, type PaperCopy } from "./estimate-copy";
import type { CopyCheck } from "./types";
import type { ActWriter } from "@/lib/auth/act-writer";
import type { AuditActor } from "@/lib/auth/types";

export class DisclosureRefused extends Error {
  constructor(readonly fault: string) {
    super(fault);
    this.name = "DisclosureRefused";
  }
}

export async function discloseAtFinalising(
  tx: Tx,
  actor: AuditActor,
  i: { organisationId: string; reference: string; facts: EstimateFacts & { id: string }; at: Date; person: { id: string; name: string }; /// The act whose person disclosed it, attributed in this transaction (Phase 2b). A loader that writes directly has none.
    act?: ActWriter; paper: PaperCopy | null; benchmarkLabelEn: string | null },
): Promise<{ benchmark: { label: string | null; value: Sen } | null; lodged: Sen; paper: Sen | null; check: CopyCheck | null }> {
  await lockEstimateRow(tx, i.facts.id);
  // R-1: every refusal is decided before the first write (the version numbers carry no figure).
  const versionNos = (await tx.companyEstimateVersion.findMany({ where: { estimateId: i.facts.id }, select: { versionNo: true } })).map((v) => v.versionNo);
  const refused = disclosureFault(i.facts, versionNos, i.at);
  if (refused) throw new DisclosureRefused(refused);
  const d = disclose(i.facts, i.at);
  if (!d.ok) throw new DisclosureRefused(d.fault);
  await tx.companyEstimate.update({ where: { id: i.facts.id }, data: { state: "DISCLOSED", disclosedAt: d.disclosedAt } });
  const ev = await tx.estimateEvent.create({ data: { organisationId: i.organisationId, estimateId: i.facts.id, kind: "DISCLOSED", personId: i.person.id, capacity: "At the opening", versionNo: i.facts.currentVersionNo, at: d.disclosedAt } });
  await i.act?.write(tx, ev.id);
  await writeAudit(tx, { actor, organisationId: i.organisationId, entity: SCOPE_ENTITY.estimate, entityId: i.facts.id, entityLabel: `${i.reference} · Company estimate` }, "UPDATE", estimateStateAudit(ESTIMATE_STATE_LABEL[i.facts.state], ESTIMATE_STATE_LABEL.DISCLOSED));
  await writeAudit(tx, { actor, organisationId: i.organisationId, entity: SCOPE_ENTITY.estimateEvent, entityId: ev.id, entityLabel: `${i.reference} · Company estimate · disclosed` }, "CREATE", estimateEventAudit({ kind: "DISCLOSED", personName: i.person.name, capacity: "At the opening", versionNo: i.facts.currentVersionNo }));
  // Disclosed in this transaction: the figures may now be shown, and only now are they read.
  const figures = await readSealedFigures(tx, i.facts.id);
  const row = benchmarkRow({ id: i.facts.id, state: "DISCLOSED", currentVersionNo: i.facts.currentVersionNo }, figures, { benchmarkLabelEn: i.benchmarkLabelEn });
  const lodgedNo = i.facts.lodgedVersionNo ?? i.facts.currentVersionNo;
  const lodged = figures.versions.find((v) => v.versionNo === lodgedNo)?.value;
  // Checked before any write (disclosureFault); thrown, never returned, so the transaction rolls back.
  if (lodged === undefined) throw new DisclosureRefused("LODGED_VERSION_MISSING");
  return {
    benchmark: row.sealed ? null : { label: row.label, value: row.value },
    lodged,
    paper: i.paper && "figure" in i.paper ? i.paper.figure : null,
    check: i.paper ? copyCheck(i.paper, lodged) : null,
  };
}
