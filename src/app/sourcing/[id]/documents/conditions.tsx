import { CheckIcon, GavelIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import type { ConditionsTab } from "@/lib/tender-docs/read-conditions";

import { AddRequirementDrawer, ConfirmAssuranceDrawer, OverrideClauseDrawer, PermitDrawer, RemoveAssuranceDrawer, RemoveOverrideDrawer, RemoveRequirementDrawer, RestrictionDrawer } from "./conditions-editors";

/**
 * The Tender documents tab's increment-2 cards: the tender's conditions (who may bid, the
 * restriction, the regulator permit), assurance and the mandatory clauses. Words only, from
 * `conditionsTab`; every act is the shared drawer, disabled with its reason where refused.
 */

const tone = (l: string) => (l === "block" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
const NOT_SET = "Not set";
const Value = ({ v }: { v: string }) => (v === NOT_SET ? <Badge tone="warn">Not set</Badge> : <span className="break-words">{v}</span>);

function Findings({ items }: { items: { level: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((f, i) => (
        <li key={i}>
          <Callout tone={tone(f.level)}>{f.text}</Callout>
        </li>
      ))}
    </ul>
  );
}

function Row({ title, value, action, children }: { title: string; value?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span className="min-w-0 text-[13.5px] font-semibold break-words text-ink">{title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {value}
          {action}
        </span>
      </span>
      {children}
    </li>
  );
}

export function ConditionsCards({ c }: { c: ConditionsTab }) {
  const frozen = c.frozen && "eligibility" in c.frozen ? c.frozen : null;
  // Once the documents are with approval or approved, the conditions stand as frozen: no controls, the callout says so.
  const live = c.frozen == null;
  return (
    <>
      <Card id="conditions" className="scroll-mt-24 overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Tender conditions"
          subtitle="Who may bid, whether the tender is restricted, and the regulator's permit. Unanswered is never read as no."
          actions={live && <AddRequirementDrawer exerciseId={c.exerciseId} allowed={c.eligibility.noBodies ? { allowed: false, reason: c.eligibility.noBodies } : c.edit} bodies={c.eligibility.bodyOptions} nextGroup={c.eligibility.nextGroup} typeTest={c.eligibility.typeTest} />}
        />
        <CardBody className="flex flex-col gap-5">
          {frozen && (
            <Callout tone="info" title={`As frozen with version ${frozen.version}, judged ${frozen.judgedOn}`}>
              Registrations: {frozen.eligibility}. Valid {frozen.window}. Restricted: {frozen.restriction}. Regulator&apos;s permit: {frozen.permit}.
            </Callout>
          )}
          {c.frozen && "before" in c.frozen && <Callout tone="info">{c.frozen.before}</Callout>}
          {c.frozen && <p className="text-[12.5px] text-ink-3">The conditions change only before the documents go for approval; a returned version is amended in the next.</p>}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
            {c.eligibility.groups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
                <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration is recorded, so the notice has no eligibility block.</span>
              </p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {c.eligibility.groups.map((g) => (
                  <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
                    <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
                    <ul className="flex flex-col gap-1.5">
                      {g.items.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="min-w-0 text-[13.5px] break-words text-ink">
                            <span className="font-semibold">{r.body}</span>
                            {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
                          </span>
                          {live && <RemoveRequirementDrawer exerciseId={c.exerciseId} id={r.id} label={r.body} allowed={c.edit} />}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3">
              The notice states each registration must be valid from the day tendering starts to the closing day: the days proposed when the documents are submitted. The contract type&apos;s registration test: {c.eligibility.typeTest}.
            </p>
          </div>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            <Row title={c.restriction.question} value={<Value v={c.restriction.answer} />} action={live && <RestrictionDrawer exerciseId={c.exerciseId} question={c.restriction.question} raw={c.restriction.raw} allowed={c.edit} />}>
              {c.restriction.answer === "Yes" && (
                <span className="text-[12.5px] break-words text-ink-3">
                  Stamped on every generated document: {c.restriction.stampEn === NOT_SET ? "English wording not set" : `“${c.restriction.stampEn}”`}
                  {c.restriction.stampMs !== NOT_SET ? ` · “${c.restriction.stampMs}”` : ""}
                </span>
              )}
            </Row>
            <Row title="Needs the regulator's permit" value={<Value v={c.permit.answer} />} action={live && <PermitDrawer exerciseId={c.exerciseId} raw={c.permit.raw} rawPermit={c.permit.rawPermit} options={c.permit.options} list={c.permit.list} allowed={c.edit} />}>
              {c.permit.permit != null && (
                <span className="text-[12.5px] text-ink-3">
                  Permit type: {c.permit.permit === NOT_SET ? "not chosen" : c.permit.permit}
                </span>
              )}
            </Row>
          </ul>
          <Findings items={[...c.eligibility.findings, ...c.restriction.findings, ...c.permit.findings]} />
          {frozen?.tableDocument && frozen.tableDocument.length > 0 && (
            <KeyValues columns={1} items={[{ label: "In the Tender Table Document", value: frozen.tableDocument.join(" · ") }]} />
          )}
        </CardBody>
      </Card>

      <Card id="assurance" className="scroll-mt-24 overflow-hidden">
        <CardHeader
          icon={<CheckIcon size={17} />}
          title="Assurance"
          subtitle="Named officers confirm the documents before they go for approval, each with the day."
          actions={<Badge tone={c.assurance.required === NOT_SET ? "warn" : "neutral"}>{c.assurance.required === NOT_SET ? "Policy not set" : c.assurance.required}</Badge>}
        />
        <CardBody className="flex flex-col gap-4">
          {c.assurance.policyNotSet && <Callout tone="warn">{c.assurance.policyNotSet}</Callout>}
          {c.assurance.frozen ? (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {c.assurance.frozen.confirmations.length === 0 ? (
                <Row title="Confirmations" value={<span>None recorded ({c.assurance.frozen.required.toLowerCase()})</span>} />
              ) : (
                c.assurance.frozen.confirmations.map((x) => <Row key={x.label} title={x.label} value={<span>{x.by} · {x.on}</span>} />)
              )}
            </ul>
          ) : (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {c.assurance.rows.map((r) => (
                <Row
                  key={r.kind}
                  title={r.label}
                  value={r.confirmation ? <Badge tone="ok" dot>Confirmed</Badge> : r.notNeeded ? <span className="text-ink-3">Not needed</span> : <Badge tone="warn">Not confirmed</Badge>}
                  action={r.confirmation ? <RemoveAssuranceDrawer exerciseId={c.exerciseId} id={r.confirmation.id} label={r.label} allowed={c.assurance.remove} /> : r.notNeeded ? null : <ConfirmAssuranceDrawer exerciseId={c.exerciseId} kind={r.kind} label={r.label} people={c.people} allowed={r.record} today={c.today} />}
                >
                  {r.confirmation && (
                    <span className="text-[12.5px] break-words text-ink-3">
                      {r.confirmation.by} · {r.confirmation.on}
                      {r.confirmation.note ? ` · “${r.confirmation.note}”` : ""}
                    </span>
                  )}
                  {r.notNeeded && <span className="text-[12.5px] text-ink-3">{r.notNeeded}</span>}
                </Row>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card id="clauses" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<GavelIcon size={17} />} title="Mandatory clauses" subtitle="Clauses every agreement carries. Leaving one out needs a legal endorsement." />
        <CardBody className="flex flex-col gap-4">
          {c.clauses.frozen ? (
            c.clauses.frozen.length === 0 ? (
              <p className="text-[13px] text-ink-2">No clause was required when the documents were frozen.</p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {c.clauses.frozen.map((x) => (
                  <Row key={x.title} title={x.title} value={<span>{x.version}</span>}>
                    {x.override && <span className="text-[12.5px] break-words text-ink-3">{x.override}</span>}
                  </Row>
                ))}
              </ul>
            )
          ) : c.clauses.none ? (
            <p className="text-[13px] text-ink-2">{c.clauses.none}</p>
          ) : (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {c.clauses.rows.map((r) => (
                <Row
                  key={r.code}
                  title={r.title}
                  value={<Badge tone={r.tone}>{r.status}</Badge>}
                  action={r.override ? <RemoveOverrideDrawer exerciseId={c.exerciseId} id={r.override.id} title={r.title} allowed={c.clauses.remove} /> : r.record && r.status === "Missing" ? <OverrideClauseDrawer exerciseId={c.exerciseId} clauseCode={r.code} title={r.title} people={c.people} allowed={r.record} /> : null}
                >
                  <span className="text-[12.5px] text-ink-3">{r.version}</span>
                  {r.override && <span className="text-[12.5px] break-words text-ink-3">Endorsed by {r.override.by}: “{r.override.reason}”</span>}
                  {r.findings.map((f) => (
                    <span key={f} className="text-[12.5px] break-words text-amber-800">{f}</span>
                  ))}
                </Row>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
