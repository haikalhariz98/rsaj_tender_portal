import { CalendarIcon, CheckIcon, ClipboardIcon, FileIcon, InboxIcon, WalletIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import type { SupplierActor } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";
import { STATUS_WORDS as CERTIFICATE_STATUS_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import type { ProjectContext } from "@/lib/portal/projects/context-store";
import { OUTCOME_TONE, OUTCOME_WORDS, ROUTING_STATEMENT, SERVICE_NOT_SET, serviceWords, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import type { SubmissionKind } from "@/lib/portal/projects/types";
import { certificatesTab, diaryTab, overviewTab, paymentsTab, programmeTab, submissionsTab } from "@/lib/portal/projects/workspace-store";
import { delayWords, ENTRY_STATE_TONE, ENTRY_STATE_WORDS, PROGRAMME_DECISION_WORDS } from "@/lib/supervision/labels";

import { AttestControl, DisputeDiaryControl, SignCertificateControl, SubmitControl } from "./controls";

/**
 * The tabs of one contract in My Projects (Phase 4e). Each panel reads only its own slice (`workspace-store.ts`), as the session's supplier, for a contract it holds. What is not set, not
 * open or not allowed is said in words beside the thing it concerns; a button that cannot be used says why.
 */

type Props = { actor: SupplierActor; ctx: ProjectContext; token: string | null };

const CLAIM_KINDS: SubmissionKind[] = ["INTERIM_CLAIM", "MATERIALS_ON_SITE"];
const NOTICE_KINDS: SubmissionKind[] = ["DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION"];

export async function OverviewPanel({ actor, ctx }: Omit<Props, "token">) {
  const o = await overviewTab(db, actor, ctx);
  const todo = [
    ...(o.counts.toAttest ? [`${o.counts.toAttest} diary ${o.counts.toAttest === 1 ? "entry waits" : "entries wait"} for your agent's attestation (Site diary).`] : []),
    ...(o.counts.toSign ? [`${o.counts.toSign} ${o.counts.toSign === 1 ? "certificate waits" : "certificates wait"} for your signature (Certificates).`] : []),
    ...(o.counts.returned ? [`${o.counts.returned} ${o.counts.returned === 1 ? "submission was" : "submissions were"} returned to you with a note (Submissions).`] : []),
    ...(o.counts.waiting ? [`${o.counts.waiting} ${o.counts.waiting === 1 ? "submission is" : "submissions are"} with the office, waiting for an answer.`] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      {o.closed && <Callout tone="warn" title="Nothing can be sent on this contract at the moment">{o.closed}</Callout>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Diary entries to attest" value={o.counts.toAttest} tone={o.counts.toAttest ? "warn" : "brand"} />
        <Stat label="Certificates to sign" value={o.counts.toSign} tone={o.counts.toSign ? "warn" : "brand"} />
        <Stat label="With the office" value={o.counts.waiting} hint="Submissions waiting for an answer" />
        <Stat label="Days with no diary entry" value={o.counts.missingDays} hint={o.facts.possessionOn ? "Since possession, to yesterday" : "The site has not been handed over"} tone={o.counts.missingDays ? "warn" : "brand"} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Waiting for you" subtitle="What the contract asks of your company now." />
          <CardBody>
            {todo.length === 0 ? (
              <p className="text-[14px] text-ink-2">Nothing waits for you on this contract.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {todo.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[14px] text-ink">
                    <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-600" />
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="The contract" />
          <CardBody>
            <KeyValues
              items={[
                { label: "Contract number", value: o.facts.number },
                { label: "Award", value: o.facts.awardReference },
                { label: "Contract sum", value: o.facts.contractSum },
                { label: "Possession of the site", value: o.facts.possessionOn ?? "Not yet recorded" },
                { label: "Date for completion", value: o.facts.dateForCompletion ?? "Not set on the baseline" },
                { label: "Superintending Officer", value: o.facts.soOffice ?? "Not yet assigned: your submissions reach nobody until one is" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export async function ProgrammePanel({ actor, ctx, token }: Props) {
  const p = await programmeTab(db, actor, ctx);
  const closed = (await overviewTab(db, actor, ctx)).closed;
  const delay = p.delay ? delayWords(p.delay) : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<CalendarIcon size={17} />}
          title="Programme in force"
          subtitle="The latest revision the Principal S.O. Representative approved. Progress is measured against it."
          actions={<SubmitControl contractId={ctx.contract.id} token={token} kinds={["WORK_PROGRAMME"]} why={closed} label="Send a programme" />}
        />
        <CardBody>
          {p.inForce ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Revision", value: `${p.inForce.revision}, approved ${p.inForce.approvedOn ?? "on a day not recorded"}` },
                { label: "Planned progress", value: p.inForce.points.map((x) => `${formatDate(x.day)}: ${x.plannedPct}%`).join(" · ") },
                { label: "Latest progress recorded", value: p.latest ? `${p.latest.actualPct}% on ${formatDate(p.latest.day)}${p.latest.plannedPct ? ` (planned ${p.latest.plannedPct}%)` : ""}` : "None yet" },
                {
                  label: "Reading",
                  value: delay ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={delay.tone === "neutral" ? undefined : delay.tone}>{delay.title.en}</Badge>
                      <span className="text-[13px] text-ink-2">{delay.detail.en}</span>
                    </span>
                  ) : (
                    "Not judged: the organisation's day is not known"
                  ),
                },
              ]}
            />
          ) : (
            <EmptyState title="No programme is in force" size="sm">Send your programme of works; the office keys its points and approves it.</EmptyState>
          )}
          {p.policyPct == null && p.inForce && <p className="mt-3 text-[12.5px] text-ink-3">In Delay against the plan is not judged: the office has not set the percentage. A lapsed completion date still is.</p>}
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Revisions" subtitle="Every programme sent, newest first, with the office's decision." divided={p.revisions.length > 0} />
        {p.revisions.length === 0 ? (
          <EmptyState title="No revision recorded" size="sm">The office records each programme you send as a revision.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {p.revisions.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-[14px] text-ink">Revision {r.revision}, submitted {r.submittedOn}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.decision ? <Badge tone={r.decision === "APPROVED" ? "ok" : "warn"}>{`${PROGRAMME_DECISION_WORDS[r.decision].en}${r.decidedOn ? ` ${r.decidedOn}` : ""}`}</Badge> : <Badge tone="info">{r.scrutinised ? "Scrutinised, awaiting the decision" : "With the office"}</Badge>}
                  {r.note && <span className="text-[12.5px] text-ink-3">{r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export async function DiaryPanel({ actor, ctx, token }: Props) {
  const d = await diaryTab(db, actor, ctx);
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FileIcon size={17} />} title="Site diary" subtitle={`One entry a day by the responsible officer, attested by your agent at the end of the day. Newest first.${d.possessionOn ? ` The diary runs from ${d.possessionOn}.` : ""}`} divided={d.rows.length > 0} />
      {d.closed && (
        <CardBody>
          <Callout tone="warn" title="The diary cannot be attested at the moment">{d.closed}</Callout>
        </CardBody>
      )}
      {d.rows.length === 0 ? (
        <EmptyState title="No entries" size="sm">The diary starts on the day of possession. The responsible officer writes each day&apos;s entry.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {d.rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                  {e.dayText}
                  <Badge tone={ENTRY_STATE_TONE[e.state] === "neutral" ? undefined : ENTRY_STATE_TONE[e.state]}>{ENTRY_STATE_WORDS[e.state].en}</Badge>
                  {e.backdated && <Chip tone="warn">Written after the day</Chip>}
                </p>
                <p className="text-[12.5px] text-ink-3">{[e.officer, e.weather || null, e.agentAttestedOn ? `attested by ${e.agentName} on ${e.agentAttestedOn}${e.signedFromPortal ? " (signed from the portal)" : " (recorded by the office)"}` : null].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-[13.5px] break-words whitespace-pre-line text-ink-2">{e.entry}</p>
                {e.disagreement && <p className="mt-1 text-[12.5px] text-ink-3">{`Disagreement, escalated ${e.escalatedOn ?? ""}: ${e.disagreement}`}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-2">
                {!e.agentAttestedOn && <AttestControl contractId={ctx.contract.id} entryId={e.id} token={token} dayText={e.dayText} why={e.canAttest ? null : e.attestWhy} />}
                {e.canDispute && <DisputeDiaryControl contractId={ctx.contract.id} entryId={e.id} token={token} dayText={e.dayText} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function PaymentsPanel({ actor, ctx, token }: Props) {
  const p = await paymentsTab(db, actor, ctx);
  const closed = (await overviewTab(db, actor, ctx)).closed;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Certified to you" value={p.summary.certifiedText} hint={p.summary.unfigured ? `${p.summary.unfigured} certificate${p.summary.unfigured === 1 ? "" : "s"} without a figure on record, left out` : "On the issued payment certificates"} />
        <Stat label="Paid by Finance" value={p.summary.paidText} hint={p.summary.awaitingPayment ? `${p.summary.awaitingPayment} certificate${p.summary.awaitingPayment === 1 ? "" : "s"} not yet recorded as paid` : "Every certificate is recorded as paid"} tone="brand" />
        <Stat label="Certified, not yet paid" value={p.summary.outstandingText} tone={p.summary.outstanding > 0n ? "warn" : "brand"} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader icon={<WalletIcon size={17} />} title="Payment certificates" subtitle="Each interim or advance payment certificate issued on this contract, the payment it recommended and what Finance paid on it." divided={p.rows.length > 0} />
        {p.rows.length === 0 ? (
          <EmptyState title="No payment certificate has been issued" size="sm">An interim certificate is raised by the office from its valuation of your claim.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {p.rows.map((r) => (
              <li key={r.certificateId} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{`${r.kindLabel} ${r.sequence}${r.number ? `, ${r.number}` : ""}`}</span>
                  <span className="block text-[12.5px] text-ink-3">{r.issuedOn ? `Dated ${r.issuedOn}` : "Date not on record"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Chip>{r.recommendedText ? `Certified ${r.recommendedText}` : "Figure not on record"}</Chip>
                  {r.paid ? <Chip tone="ok">{`Paid ${r.paidText} on ${r.paid.on}, batch ${r.paid.batchNo}`}</Chip> : <Chip tone="warn">Not yet recorded as paid</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<InboxIcon size={17} />} title="Your claims and materials lists" subtitle="Sent to the office for its valuation. The answer is under Submissions." actions={<SubmitControl contractId={ctx.contract.id} token={token} kinds={CLAIM_KINDS} why={closed} label="Send a claim or list" />} divided={p.claims.length > 0} />
        {p.claims.length === 0 ? (
          <EmptyState title="No claim sent yet" size="sm">Send an interim claim with the amount and the day it is made up to, or a list of the unfixed materials on site.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {p.claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{c.title}</span>
                  <span className="block text-[12.5px] text-ink-3">{[SUBMISSION_KIND_WORDS[c.kind].en, c.amount, c.upTo ? `up to ${c.upTo}` : null, `sent ${c.sentOn}`].filter(Boolean).join(" · ")}</span>
                </span>
                {c.outcome ? <Badge tone={OUTCOME_TONE[c.outcome]}>{OUTCOME_WORDS[c.outcome].en}</Badge> : <Badge tone="info">With the office</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export async function CertificatesPanel({ actor, ctx, token }: Props) {
  const c = await certificatesTab(db, actor, ctx);
  const ready = c.rows.filter((r) => r.block.state === "READY");
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Waiting for your signature" subtitle="Variation Order Certificates and Certificates of Adjustment of Contract Sum whose contractor's block is next in order. Sign, or dispute with your reason where the form allows it." divided={ready.length > 0} />
        {ready.length === 0 ? (
          <EmptyState title="Nothing waits for your signature" size="sm">A certificate appears here when the office has signed the blocks before yours.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {ready.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{`${r.kindLabel}${r.number ? ` ${r.number}` : ""}`}</p>
                  <p className="text-[12.5px] text-ink-3">{`Opened ${r.openedOn}${r.block.state === "READY" ? ` · block: ${r.block.block.labelEn}` : ""}`}</p>
                  {r.closed && <p className="text-[12.5px] text-amber-800">{r.closed}</p>}
                </div>
                {!r.closed && r.block.state === "READY" && (
                  <div className="flex shrink-0 flex-wrap items-start gap-2">
                    <SignCertificateControl contractId={ctx.contract.id} certificateId={r.id} token={token} label={`${r.kindLabel}${r.number ? ` ${r.number}` : ""}`} mode="sign" refusalAllowed={r.block.block.refusalAllowed} />
                    <SignCertificateControl contractId={ctx.contract.id} certificateId={r.id} token={token} label={`${r.kindLabel}${r.number ? ` ${r.number}` : ""}`} mode="dispute" refusalAllowed={r.block.block.refusalAllowed} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title="Every certificate" subtitle="Every certificate opened on this contract, newest first, and where the contractor's block stands on each." divided={c.rows.length > 0} />
        {c.rows.length === 0 ? (
          <EmptyState title="No certificate yet" size="sm">Certificates are raised by the office as the contract runs.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {c.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{`${r.kindLabel}${r.number ? ` ${r.number}` : ""}`}</span>
                  <span className="block text-[12.5px] text-ink-3">{[`opened ${r.openedOn}`, r.certificateDate ? `dated ${r.certificateDate}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "ISSUED" ? "ok" : r.status === "VOID" ? "err" : "info"}>{CERTIFICATE_STATUS_WORDS[r.status].en}</Badge>
                  {r.recorded ? (
                    <Chip tone={r.recorded.refused ? "warn" : "ok"}>{r.recorded.refused ? `Refused to sign on ${r.recorded.on}${r.recorded.fromPortal ? " (from the portal)" : ""}` : `Signed by ${r.recorded.name} on ${r.recorded.on}${r.recorded.fromPortal ? " (from the portal)" : " (recorded by the office)"}`}</Chip>
                  ) : r.block.state === "WAITING" ? (
                    <Chip>{`Waits for "${r.block.first}" first`}</Chip>
                  ) : r.block.state === "READY" ? (
                    <Chip tone="warn">Waits for your signature</Chip>
                  ) : r.block.state === "NOT_OFFERED" && r.block.why === "KIND" ? (
                    <Chip>Signed at the office, if at all</Chip>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export async function SubmissionsPanel({ actor, ctx, token }: Props) {
  const s = await submissionsTab(db, actor, ctx);
  const unset = Object.entries(s.serviceLevels).filter(([, v]) => v == null).length + (6 - Object.keys(s.serviceLevels).length);
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Submissions"
          subtitle={`Everything your company has sent on this contract, newest first, and the office's answer. ${ROUTING_STATEMENT}`}
          actions={<SubmitControl contractId={ctx.contract.id} token={token} kinds={NOTICE_KINDS} why={s.closed} label="Send a notice or declaration" />}
          divided={s.rows.length > 0}
        />
        {unset > 0 && (
          <CardBody pad="tight">
            <p className="text-[12.5px] text-ink-3">{`${SERVICE_NOT_SET.en} for ${unset === 6 ? "any kind" : `${unset} kind${unset === 1 ? "" : "s"}`} of submission: those show no due day. The office sets the service levels.`}</p>
          </CardBody>
        )}
        {s.rows.length === 0 ? (
          <EmptyState title="Nothing sent yet" size="sm">A programme, a claim, a materials list, a notice of delay, a defects report or the statutory declaration appears here once sent.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {s.rows.map((r) => {
              const sv = serviceWords(r.service);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-ink">{r.title}</span>
                      <span className="block text-[12.5px] text-ink-3">{[SUBMISSION_KIND_WORDS[r.kind].en, `sent ${r.sentOn}`, r.signed ? "signed with your password" : null, r.amount, r.aboutDay ? `day ${r.aboutDay}` : null, r.routedTo ? `routed to ${r.routedTo}` : "routed to nobody: no Superintending Officer was assigned"].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {r.outcome ? <Badge tone={OUTCOME_TONE[r.outcome]}>{`${OUTCOME_WORDS[r.outcome].en}${r.decidedOn ? ` ${r.decidedOn}` : ""}`}</Badge> : <Badge tone="info">With the office</Badge>}
                      <Chip tone={sv.tone === "neutral" ? undefined : sv.tone}>{sv.text}</Chip>
                    </span>
                  </div>
                  <p className="text-[13.5px] break-words whitespace-pre-line text-ink-2">{r.body}</p>
                  {r.lines.length > 0 && (
                    <ul className="list-disc pl-5 text-[13px] text-ink-2">
                      {r.lines.map((l, n) => (
                        <li key={n}>{`${l.description} · ${l.quantity} · ${l.location} · ${l.value}`}</li>
                      ))}
                    </ul>
                  )}
                  {r.outcome === "RETURNED" && r.outcomeNote && (
                    <Callout tone="warn" title="Returned by the office">{r.outcomeNote}</Callout>
                  )}
                  {r.outcome === "TAKEN_UP" && r.outcomeNote && <p className="text-[12.5px] text-ink-3">{`The office: ${r.outcomeNote}`}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
