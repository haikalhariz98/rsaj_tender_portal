import { ActGate } from "@/components/act-gate";
import { sulitCell } from "@/components/sulit-cell";
import { SulitValue } from "@/components/ui/badge";
import type { StaffActor } from "@/lib/auth/types";
import { sulitGate } from "@/app/_auth/sulit";
import { DataList, type Row } from "@/components/data-list";
import { ChartIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { MoreActions } from "@/components/ui/more-actions";
import { KeyValues } from "@/components/ui/stat";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { fixedOf, formatMark } from "@/lib/evaluation/fixed";
import { formatOrgDay } from "@/lib/format";
import type { CloseoutView } from "@/lib/closeout/view";
import { performanceFaultText, performanceRefusal, PERFORMANCE_STATE_TONE, PERFORMANCE_STATE_WORDS, totalText } from "@/lib/performance/labels";
import { formSnapshotOf, issuedFormFor } from "@/lib/performance/load";
import { editFaults, openFaults, reportOpens, verifyFaults } from "@/lib/performance/report";
import { scoreFaults } from "@/lib/performance/score";

import { AssessDrawer, ScoresDrawer, StartReportDrawer, VerifyDrawer } from "./performance-editors";

/**
 * The Close tab (Phase 2 close-out stage D; plan closeout-plan.md §3.2, §4.8): the contractor performance card. Stage C adds the checklist and the
 * Close button above it. Which act is offered, and why one is refused, is the pure rules' (`openFaults`, `scoreFaults`, `verifyFaults`); the card
 * renders what they say. One main button for the state the report is in; the rest sit in MoreActions.
 */

export async function ClosePanel({ l, v, today, actor }: { l: LoadedContract; v: CloseoutView; today: string | null; actor: StaffActor }) {
  const viewerPersonId = actor.personId;
  const id = l.contract.id;
  const shut = actStatusBlocker("PERFORMANCE_REPORT", l.contract.status as ContractStatus) ?? (today ? null : "Set the organisation's time zone first.");
  const r = v.report;
  const state = v.facts.performance;
  const facts = { cpcIssued: v.rows.cpc?.certificate.status === "ISSUED", dlpApplies: !!v.rows.cpc?.dlpStart, cmgdIssued: v.rows.cmgd?.certificate.status === "ISSUED" };
  const code = l.ex.contractTypeCode;
  const [form, type] = r ? [null, null] : await Promise.all([issuedFormFor(l.org.id, code), code ? db.contractType.findFirst({ where: { organisationId: l.org.id, code }, select: { nameEn: true } }) : Promise.resolve(null)]);
  const notOpen = !r && !reportOpens(facts);

  let body;
  let actions = null;
  if (!r) {
    const fs = openFaults({ ...facts, formIssued: !!form, typeName: type?.nameEn ?? null, live: false });
    body = (
      <>
        <EmptyState size="sm" title={notOpen ? "Not open yet" : form ? "Not started" : "No form for this contract type"} />
        {fs.length ? <p className="px-6 pb-5 text-center text-sm text-slate-600">{fs.map(performanceFaultText).join(" ")}</p> : null}
      </>
    );
    if (!notOpen && form) actions = <StartReportDrawer id={id} form={`${form.nameEn}, version ${form.version}`} blocker={shut ?? (fs.length ? performanceRefusal("", fs) : null)} />;
  } else {
    // The scores, the total and the grade are SULIT: read behind the contract's gate, and logged when read.
    const gate = await sulitGate(actor, { scope: "contract", entity: "Contract", id, label: l.contract.number }, ["scoreTotal", "gradeLabel", "scores"]);
    const snap = formSnapshotOf(r);
    const scores = new Map(r.scores.map((s) => [s.criterionOrder, s]));
    const scored = new Map(r.scores.map((s) => [s.criterionOrder, s.score]));
    const missing = scoreFaults(snap, scored);
    const total = fixedOf(r.scoreTotal);
    const rows: Row[] = snap.criteria.map((c) => ({
      id: String(c.order),
      search: c.label,
      cells: {
        criterion: { kind: "stack", title: c.label, sub: scores.get(c.order)?.note || c.guide || undefined },
        weight: { kind: "text", text: formatMark(fixedOf(c.weight)!, 2) },
        score: sulitCell(gate, () => ({ kind: "text", text: scores.has(c.order) ? `${scores.get(c.order)!.score} of ${snap.scaleMax}` : "Not scored", dim: !scores.has(c.order) })),
      },
    }));
    const tz = l.org.timeZone;
    body = (
      <>
        <CardBody>
          <KeyValues
            columns={3}
            items={[
              { label: "Form", value: `${snap.name}, version ${snap.version}` },
              { label: "Total", value: total == null ? "Not assessed" : gate.state === "GRANTED" ? `${totalText(total)} · grade ${r.gradeLabel}` : <SulitValue of={gate} /> },
              { label: "Supplier", value: r.supplierId ? l.award.awardeeName : "Not linked to the supplier register" },
              { label: "Scored by", value: r.assessedBy ? `${r.assessedBy.name}${r.assessedAt ? `, ${formatOrgDay(r.assessedAt, tz)}` : ""}` : "Not assessed" },
              { label: "Verified by", value: r.verifiedBy ? `${r.verifiedBy.name}${r.verifiedAt ? `, ${formatOrgDay(r.verifiedAt, tz)}` : ""}` : "Not verified" },
            ]}
          />
        </CardBody>
        <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="performance" emptyTitle="No criteria" columns={[{ key: "criterion", label: "Criterion", mobile: "primary" }, { key: "weight", label: "Weight", width: "110px", numeric: true, mobile: "meta" }, { key: "score", label: "Score", width: "140px", mobile: "meta", sulit: true }]} rows={rows} />
      </>
    );
    const values = Object.fromEntries(r.scores.flatMap((s) => [[`score_${s.criterionOrder}`, String(s.score)], [`note_${s.criterionOrder}`, s.note]]));
    if (state === "OPEN") {
      const assessBlock = shut ?? (missing.length ? performanceRefusal("", missing) : null) ?? (editFaults(r).length ? performanceRefusal("", editFaults(r)) : null);
      actions = missing.length ? (
        <span className="flex items-center gap-2">
          <ScoresDrawer id={id} criteria={snap.criteria} scaleMax={snap.scaleMax} values={values} main />
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <AssessDrawer id={id} blocker={assessBlock} main />
          <MoreActions>
            <ScoresDrawer id={id} criteria={snap.criteria} scaleMax={snap.scaleMax} values={values} main={false} />
          </MoreActions>
        </span>
      );
    }
    if (state === "ASSESSED") {
      const vf = verifyFaults(r, viewerPersonId);
      actions = <VerifyDrawer id={id} blocker={shut ?? (vf.length ? performanceRefusal("", vf) : null)} />;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ActGate blocker={shut}>
        <Card id="performance" className="overflow-hidden">
          <CardHeader
            icon={<ChartIcon size={17} />}
            title="Contractor performance"
            subtitle={<Badge tone={PERFORMANCE_STATE_TONE[state]} dot>{PERFORMANCE_STATE_WORDS[state]}</Badge>}
            info={{ label: "About the performance report", text: "Opens at the certificate of making good defects, or at practical completion where no defects liability period applies. Filed once someone other than the assessor verifies it, and needed before the final account goes for approval. The contractor never sees it." }}
            actions={actions ?? undefined}
            divided={!!r}
          />
          {body}
        </Card>
      </ActGate>
    </div>
  );
}
