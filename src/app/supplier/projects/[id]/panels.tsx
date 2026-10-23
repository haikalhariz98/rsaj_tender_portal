import Link from "next/link";

import { CalendarIcon, CheckIcon, ClipboardIcon, FileIcon, InboxIcon, WalletIcon } from "@/components/icons";
import { EarlierRecordCard } from "@/components/earlier-record-card";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import type { SupplierActor } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";
import { STATUS_WORDS as CERTIFICATE_STATUS_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import type { ProjectContext } from "@/lib/portal/projects/context-store";
import { OUTCOME_TONE, OUTCOME_WORDS, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { certificatesTab, DIARY_PAGE, diaryTab, overviewTab, paymentsTab, programmeTab } from "@/lib/portal/projects/workspace-store";
import { EARLIER_RECORD } from "@/lib/project-docs/earlier";
import { loadPortalEarlier } from "@/lib/project-docs/earlier-read";
import { loadWaitingForYou } from "@/lib/project-docs/portal-read";
import { delayWords, ENTRY_STATE_TONE, ENTRY_STATE_WORDS, PROGRAMME_DECISION_WORDS } from "@/lib/supervision/labels";

import { AttestControl, DisputeDiaryControl, SignCertificateControl } from "./controls";
import { PortalDocumentsPanel } from "./documents-panel";
import { portalDocumentsHref } from "./portal-documents-card";
import { WaitingList } from "./waiting-for-you";

/**
 * The tabs of one contract in My Projects (Phase 4e). Each panel reads only its own slice (`workspace-store.ts`), as the session's supplier, for a contract it holds. What is not set, not
 * open or not allowed is said in words beside the thing it concerns; a button that cannot be used says why.
 */

type Props = { actor: SupplierActor; ctx: ProjectContext; token: string | null };

export async function OverviewPanel({ actor, ctx }: Omit<Props, "token">) {
  const o = await overviewTab(db, actor, ctx);
  const waiting = await loadWaitingForYou(db, actor, { contractId: ctx.contract.id });
  const todo = [
    ...(o.counts.toAttest ? [`${o.counts.toAttest} diary ${o.counts.toAttest === 1 ? "entry" : "entries"} to attest.`] : []),
    ...(o.counts.toSign ? [`${o.counts.toSign} ${o.counts.toSign === 1 ? "certificate" : "certificates"} to sign.`] : []),
    ...(o.counts.returned ? [`${o.counts.returned} ${o.counts.returned === 1 ? "document" : "documents"} returned to you.`] : []),
    ...(o.counts.waiting ? [`${o.counts.waiting} ${o.counts.waiting === 1 ? "document" : "documents"} with the office.`] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      {o.closed && <Callout tone="warn" title="Sending closed">{o.closed}</Callout>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Diary entries to attest" value={o.counts.toAttest} tone={o.counts.toAttest ? "warn" : "brand"} />
        <Stat label="Certificates to sign" value={o.counts.toSign} tone={o.counts.toSign ? "warn" : "brand"} />
        <Stat label="With the office" value={o.counts.waiting} hint="Documents waiting for an answer" />
        <Stat label="Days with no diary entry" value={o.counts.missingDays} hint={o.facts.possessionOn ? "Since possession, to yesterday" : "The site has not been handed over"} tone={o.counts.missingDays ? "warn" : "brand"} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Waiting for you" />
          {(todo.length > 0 || waiting.rows.length === 0) && (
            <CardBody>
              {todo.length === 0 ? (
                <p className="text-[14px] text-ink-2">Nothing waits for you.</p>
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
          )}
          {waiting.rows.length > 0 && <WaitingList rows={waiting.rows} withContract={false} more={waiting.next ? { href: `/supplier/projects/${ctx.contract.id}?tab=submissions`, label: "More in Documents" } : null} />}
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
                { label: "Superintending Officer", value: o.facts.soOffice ?? "Not assigned. Documents sent to the office reach nobody." },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export async function ProgrammePanel({ actor, ctx }: Omit<Props, "token">) {
  const p = await programmeTab(db, actor, ctx);
  const delay = p.delay ? delayWords(p.delay) : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<CalendarIcon size={17} />}
          title="Programme in force"
          actions={<ButtonLink href={`/supplier/projects/${ctx.contract.id}?tab=submissions`} size="sm" variant="secondary">Send in Documents</ButtonLink>}
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
            <EmptyState title="No programme in force" size="sm" />
          )}
          {p.policyPct == null && p.inForce && <p className="mt-3 text-[12.5px] text-ink-3">Delay not judged: percentage not set.</p>}
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Revisions" divided={p.revisions.length > 0} />
        {p.revisions.length === 0 ? (
          <EmptyState title="No revision recorded" size="sm" />
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

export async function DiaryPanel({ actor, ctx, token, page }: Props & { page?: string }) {
  const d = await diaryTab(db, actor, ctx, page);
  const pages = Math.ceil(d.total / DIARY_PAGE);
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FileIcon size={17} />} title="Site diary" subtitle={d.possessionOn ? `From ${d.possessionOn}` : undefined} divided={d.rows.length > 0} />
      {d.closed && (
        <CardBody>
          <Callout tone="warn" title="Attesting closed">{d.closed}</Callout>
        </CardBody>
      )}
      {d.rows.length === 0 ? (
        <EmptyState title="No entries" size="sm" />
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
      {pages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>{`Entries ${d.page * DIARY_PAGE + 1}–${Math.min(d.total, (d.page + 1) * DIARY_PAGE)} of ${d.total}, newest first.`}</span>
          <span className="flex gap-2">
            {d.page > 0 && <ButtonLink href={`/supplier/projects/${ctx.contract.id}?tab=diary&page=${d.page}`} size="sm" variant="ghost">Newer</ButtonLink>}
            {d.page + 1 < pages && <ButtonLink href={`/supplier/projects/${ctx.contract.id}?tab=diary&page=${d.page + 2}`} size="sm" variant="ghost">Older</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

export async function PaymentsPanel({ actor, ctx }: Omit<Props, "token">) {
  const p = await paymentsTab(db, actor, ctx);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Certified to you" value={p.summary.certifiedText} hint={p.summary.unfigured ? `${p.summary.unfigured} certificate${p.summary.unfigured === 1 ? "" : "s"} without a figure on record, left out` : "On the issued payment certificates"} />
        <Stat label="Paid by Finance" value={p.summary.paidText} hint={p.summary.awaitingPayment ? `${p.summary.awaitingPayment} certificate${p.summary.awaitingPayment === 1 ? "" : "s"} not yet recorded as paid` : "Every certificate is recorded as paid"} tone="brand" />
        <Stat label="Certified, not yet paid" value={p.summary.outstandingText} tone={p.summary.outstanding > 0n ? "warn" : "brand"} />
      </div>
      {p.summary.paidUnfigured > 0n && (
        <Callout tone="warn" title={`${p.summary.paidUnfiguredText} paid on certificates without a figure on record`}>
          Ask the office for the figure.
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<WalletIcon size={17} />} title="Payment certificates" divided={p.rows.length > 0} />
        {p.rows.length === 0 ? (
          <EmptyState title="No payment certificate issued" size="sm" />
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
        <CardHeader icon={<InboxIcon size={17} />} title="Your claims and materials lists" actions={<ButtonLink href={`/supplier/projects/${ctx.contract.id}?tab=submissions`} size="sm" variant="secondary">Send in Documents</ButtonLink>} divided={p.claims.length > 0} />
        {p.claims.length === 0 ? (
          <EmptyState title="No claim sent" size="sm" />
        ) : (
          <ul className="divide-y divide-line/70">
            {p.claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  {/* A claim sent as a document opens its page; an earlier claim has none. No figure is written for a document (it carries none, PW-10). */}
                  {c.href ? <Link href={c.href} className="block text-[14px] font-semibold text-ink hover:underline">{c.title}</Link> : <span className="block text-[14px] font-semibold text-ink">{c.title}</span>}
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
  // 4e review fix: the organisation decides whether a contractor signs from its portal account; where it has not, or has said paper only, the block is not offered here and the reason is said.
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Waiting for your signature" divided={ready.length > 0} />
        {ready.length === 0 ? (
          <EmptyState title="Nothing to sign" size="sm" />
        ) : (
          <ul className="divide-y divide-line/70">
            {ready.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{`${r.kindLabel}${r.number ? ` ${r.number}` : ""}`}</p>
                  <p className="text-[12.5px] text-ink-3">{`Opened ${r.openedOn}${r.block.state === "READY" ? ` · block: ${r.block.block.labelEn}` : ""}`}</p>
                  {(r.closed ?? c.signing) && <p className="text-[12.5px] text-amber-800">{r.closed ?? c.signing}</p>}
                </div>
                {!r.closed && !c.signing && r.block.state === "READY" && (
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
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Your certificates"
          subtitle={c.total > c.rows.length ? `Newest ${c.rows.length} of ${c.total}` : undefined}
          divided={c.rows.length > 0}
        />
        {c.rows.length === 0 ? (
          <EmptyState title="No certificate yet" size="sm" />
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
                  ) : r.block.state === "NOT_OFFERED" && r.block.why === "LAST" ? (
                    <Chip tone="warn">Your block is the last: sign or dispute it on paper</Chip>
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

export async function SubmissionsPanel({ actor, ctx, token, docsAfter, earlier }: Props & { docsAfter: string | null; earlier: string | null }) {
  // One list, the documents and the earlier records together (PW-11). An earlier record opens read only above it, read by its id so an older one opens whatever page the list is on;
  // its own supplier's only, and it names the organisation, never an officer.
  const record = earlier ? await loadPortalEarlier(db, { organisationId: actor.organisationId, contractId: ctx.contract.id, supplierId: actor.supplierId, id: earlier }) : null;
  return (
    <div className="flex flex-col gap-6">
      {record && <EarlierRecordCard record={record} label={EARLIER_RECORD} backHref={portalDocumentsHref(ctx.contract.id, docsAfter)} />}
      <PortalDocumentsPanel actor={actor} ctx={ctx} token={token} after={docsAfter} />
    </div>
  );
}
