import { Accordion } from "@/components/accordion";
import { CheckIcon, GavelIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { assuranceCardShown, CLAUSE_STATUS, clausesSummary, type ClausesLine } from "@/lib/tender-docs/conditions-view";
import { capFirst } from "@/lib/tender-docs/frozen-view";
import type { ConditionsTab, LiveConditions } from "@/lib/tender-docs/read-conditions";

import { ConfirmAssuranceDrawer, OverrideClauseDrawer, RemoveAssuranceDrawer, RemoveOverrideDrawer } from "./conditions-editors";

/**
 * The Tender documents tab's increment-2 cards: assurance and the mandatory clauses, and what the
 * tender's conditions (who may bid, the restriction, the regulator permit) were when frozen. While live,
 * the conditions are answered on the Overview (founder, 2026-10-05). Words only, from
 * `conditionsTab`; every act is the shared drawer, disabled with its reason where refused.
 */

export const tone = (l: string) => (l === "block" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
export const NOT_SET = "Not set";
export const Value = ({ v }: { v: string }) => (v === NOT_SET ? <Badge tone="warn">Not set</Badge> : <span className="break-words">{v}</span>);

export function Findings({ items }: { items: { level: string; text: string }[] }) {
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

export function Row({ title, value, action, children }: { title: string; value?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
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

/**
 * The mandatory clauses as one line: "2 clauses carried". The list is behind the line, and opens by
 * itself only where there is something to act on or to read (a clause missing or not set, or one left
 * out under an endorsement), because the override drawer is the only fix (founder, 2026-10-05). Where
 * no clause is configured there is no list: the line says what is missing.
 */
function ClausesCard({ line, children }: { line: ClausesLine; children: React.ReactNode }) {
  return (
    <div id="clauses" className="scroll-mt-24">
      {!line.empty ? (
        <Accordion title={`Mandatory clauses: ${line.text}`} defaultOpen={line.expand}>
          <div className="flex flex-col gap-4 p-5">{children}</div>
        </Accordion>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader icon={<GavelIcon size={17} />} title="Mandatory clauses" subtitle={line.text} divided={false} actions={line.tone === "warn" ? <Badge tone="warn">Needs attention</Badge> : undefined} />
        </Card>
      )}
    </div>
  );
}

/**
 * Which cards the exercise shows: a draft exercise has no pack yet and shows only the tender's
 * conditions (they are editable from the draft, BD-64-32); a frozen pack shows what it froze.
 */
export function ConditionsCards({ c, packless }: { c: ConditionsTab; packless: boolean }) {
  if (c.mode === "frozen") return <FrozenCards c={c} />;
  if (c.mode === "before") return <BeforeCards c={c} />;
  return <LiveCards c={c} packless={packless} />;
}

type Frozen = Extract<ConditionsTab, { mode: "frozen" }>;
type Before = Extract<ConditionsTab, { mode: "before" }>;

export const Registrations = ({ groups }: { groups: { number: number; heading: string; items: { id?: string; body: string; qualifiers: string | null }[] }[] }) =>
  groups.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
      <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration is recorded, so the notice has no eligibility block.</span>
    </p>
  ) : (
    <ul className="divide-y divide-line/70 rounded-2xl border border-line">
      {groups.map((g) => (
        <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
          <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((r) => (
              <li key={r.id ?? r.body} className="min-w-0 text-[13.5px] break-words text-ink">
                <span className="font-semibold">{capFirst(r.body)}</span>
                {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

/// A pack with approval or approved: every card is what was frozen, with no control and no live finding (C1).
function FrozenCards({ c }: { c: Frozen }) {
  const f = c.frozen;
  return (
    <>
      <Card id="conditions" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<UsersIcon size={17} />} title="Tender conditions" subtitle={`As frozen with version ${f.version}, judged ${f.judgedOn}. They change only in a new version, after a return.`} />
        <CardBody className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
            <Registrations groups={f.groups.map((g) => ({ ...g, items: g.items }))} />
            {f.notice && <p className="mt-2 text-[12.5px] text-ink-3">{f.notice}.</p>}
          </div>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            <Row title={f.restriction.question} value={<Value v={f.restriction.answer} />}>
              {f.restriction.stampEn != null && (
                <span className="text-[12.5px] break-words text-ink-3">
                  Stamped on every generated document: {f.restriction.stampEn === NOT_SET ? "English wording not set" : `“${f.restriction.stampEn}”`}
                  {f.restriction.stampMs ? ` · “${f.restriction.stampMs}”` : ""}
                </span>
              )}
            </Row>
            <Row title="Needs the regulator's permit" value={<Value v={f.permit.answer} />}>
              {f.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {f.permit.type === NOT_SET ? "not chosen" : f.permit.type}</span>}
            </Row>
          </ul>
          {f.tableDocument.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">In the Tender Table Document</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink">
                {f.tableDocument.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      {assuranceCardShown(f.assurance.policy) && <Card id="assurance" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Assurance" subtitle="Who confirmed the documents before they went for approval, and the day." actions={<Badge tone={f.assurance.required === NOT_SET ? "warn" : "neutral"}>{f.assurance.required === NOT_SET ? "Policy was not set" : f.assurance.required}</Badge>} />
        <CardBody>
          {f.assurance.rows.length === 0 ? (
            <p className="text-[13px] text-ink-2">{f.assurance.required === NOT_SET ? "The policy was not set when the documents were frozen." : "No confirmation was needed."}</p>
          ) : (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {f.assurance.rows.map((x) => (
                <Row key={x.label} title={x.label} value={x.by ? <Badge tone="ok" dot>Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>}>
                  {x.by && (
                    <span className="text-[12.5px] break-words text-ink-3">
                      {x.by} · {x.on}
                    </span>
                  )}
                </Row>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>}

      <ClausesCard line={clausesSummary({ none: f.clauses.length === 0 ? "No clause was required when the documents were frozen." : null, statuses: f.clauses.map((x) => x.status), noneTone: "neutral" })}>
        <p className="text-[12.5px] text-ink-3">The clauses every agreement carries, as frozen with this version.</p>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {f.clauses.map((x) => (
            <Row key={x.title} title={x.title} value={<Badge tone={x.override ? "neutral" : "ok"}>{x.status}</Badge>}>
              <span className="text-[12.5px] text-ink-3">{x.version}</span>
              {x.override && <span className="text-[12.5px] break-words text-ink-3">{x.override}</span>}
            </Row>
          ))}
        </ul>
      </ClausesCard>
    </>
  );
}

/// A pack frozen before the conditions were recorded with it: the callout, and the recorded answers, with no finding.
function BeforeCards({ c }: { c: Before }) {
  return (
    <Card id="conditions" className="scroll-mt-24 overflow-hidden">
      <CardHeader icon={<UsersIcon size={17} />} title="Tender conditions" subtitle={`Version ${c.version} was frozen before they were recorded with it.`} />
      <CardBody className="flex flex-col gap-5">
        <Callout tone="info">{c.before}</Callout>
        <div>
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
          <Registrations groups={c.groups} />
        </div>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          <Row title={c.restriction.question} value={<Value v={c.restriction.answer} />} />
          <Row title="Needs the regulator's permit" value={<Value v={c.permit.answer} />}>
            {c.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {c.permit.type === NOT_SET ? "not chosen" : c.permit.type}</span>}
          </Row>
        </ul>
      </CardBody>
    </Card>
  );
}

/// The tender's conditions (registrations, restriction, permit) moved to the Overview's Details & compliance
/// card (founder, 2026-10-05): this tab keeps what is judged against the documents themselves.
function LiveCards({ c, packless }: { c: LiveConditions; packless: boolean }) {
  return (
    <>
      {!packless && (
        <>
          {assuranceCardShown(c.assurance.policy) && <Card id="assurance" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              icon={<CheckIcon size={17} />}
              title="Assurance"
              subtitle="Named officers confirm the documents before they go for approval, each with the day."
              actions={<Badge tone={c.assurance.required === NOT_SET ? "warn" : "neutral"}>{c.assurance.required === NOT_SET ? "Policy not set" : c.assurance.required}</Badge>}
            />
            <CardBody className="flex flex-col gap-4">
              {c.assurance.policyNotSet && <Callout tone="warn">{c.assurance.policyNotSet}</Callout>}
              <p className="text-[12.5px] text-ink-3">A confirmation is not withdrawn by later edits to the parts. If the documents changed after it was recorded, remove it and confirm again.</p>
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
            </CardBody>
          </Card>}

          <ClausesCard line={clausesSummary({ none: c.clauses.none, statuses: c.clauses.rows.map((r) => r.status) })}>
            <p className="text-[12.5px] text-ink-3">Leaving a clause out needs a legal endorsement. Who may give one is not checked, because no policy names them. The person who endorses it and the reason are recorded, with whether it was signed in or recorded from their paper.</p>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {c.clauses.rows.map((r) => (
                <Row
                  key={r.code}
                  title={r.title}
                  value={<Badge tone={r.tone}>{r.status}</Badge>}
                  action={r.override ? <RemoveOverrideDrawer exerciseId={c.exerciseId} id={r.override.id} title={r.title} allowed={c.clauses.remove} /> : r.record && r.status === CLAUSE_STATUS.missing ? <OverrideClauseDrawer exerciseId={c.exerciseId} clauseCode={r.code} title={r.title} people={c.people} allowed={r.record} /> : null}
                >
                  <span className="text-[12.5px] text-ink-3">{r.version}</span>
                  {r.override && <span className="text-[12.5px] break-words text-ink-3">Endorsed by {r.override.by}: “{r.override.reason}”</span>}
                  {r.findings.map((f) => (
                    <span key={f} className="text-[12.5px] break-words text-amber-800">{f}</span>
                  ))}
                </Row>
              ))}
            </ul>
          </ClausesCard>
        </>
      )}
    </>
  );
}
