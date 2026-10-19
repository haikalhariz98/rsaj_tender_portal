import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { readinessGate } from "@/lib/award/readiness";
import { type LoadedAward } from "@/lib/award/repo";
import { formatDate } from "@/lib/format";
import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { AddConditionDrawer, SatisfyConditionDrawer } from "@/app/awards/editors";


export function ConditionsPanel({ l, gate, kinds, today }: { l: LoadedAward; gate: ReturnType<typeof readinessGate>; kinds: { value: string; label: string }[]; today: string | null }) {
  const { award } = l;
  const open = award.status !== "CANCELLED";
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title={<Say words={P.conditionsPrecedent} />} actions={<Badge tone={gate.ready ? "ok" : "warn"}>{gate.ready ? "Ready" : "Not ready"}</Badge>} />
        <ReadinessGateList items={gate.items} bondNotRequiredReason={award.bondNotRequiredReason} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title={<Say words={P.beforeWorkStarts} />} actions={open ? <AddConditionDrawer id={award.id} kinds={kinds} /> : undefined} divided={award.conditions.length > 0} />
        {award.conditions.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {award.conditions.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{c.kindName}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[c.reference || null, c.requiredBy ? `needed by ${formatDate(c.requiredBy)}` : "no day set", c.satisfiedOn ? `met ${formatDate(c.satisfiedOn)}` : "not met", c.excludesEot ? "a delay gives no extension of time" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {open && !c.satisfiedOn && <SatisfyConditionDrawer id={award.id} conditionId={c.id} name={c.kindName} today={today} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
