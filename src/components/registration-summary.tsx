import type { ReactNode } from "react";

import { Chip, SulitTag, SulitWithheld } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import type { SummarySection } from "@/lib/portal/registration/summary";

/**
 * The registration summary as cards (Phase 4b, B5): the one drawing of `registrationSummary`, used for the supplier's step 5 and for the CPD reviewer's Applications tab, so the officer reads
 * exactly what the applicant read. A section is a card; each item is a label, its value and, under it, the note that says what the office should know of it ("Not scanned", "Format not
 * checked"). A SULIT section the reader may not see shows "SULIT · withheld" and the reason in words, and nothing of its values.
 */

const SULIT_SECTIONS = new Set<SummarySection["key"]>(["contacts", "creditor"]);

const NOTE_TONE = { ok: "text-emerald-700", warn: "text-amber-800", err: "text-rose-700" } as const;

export function RegistrationSummaryCards({
  sections,
  className,
  extra,
  actions,
}: {
  sections: readonly SummarySection[];
  className?: string;
  /** Extra content to put under a section, by its key. */
  extra?: Partial<Record<SummarySection["key"], ReactNode>>;
  /** A control in a section's header, by its key: the public form's "Edit", back to the step the section came from. */
  actions?: Partial<Record<SummarySection["key"], ReactNode>>;
}) {
  return (
    <div className={cx("flex flex-col gap-5", className)}>
      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader
            title={s.title}
            actions={
              SULIT_SECTIONS.has(s.key) || actions?.[s.key] ? (
                <span className="inline-flex items-center gap-2">
                  {SULIT_SECTIONS.has(s.key) && <SulitTag />}
                  {actions?.[s.key]}
                </span>
              ) : undefined
            }
          />
          <CardBody>
            {s.withheld ? (
              <div className="flex flex-col gap-1.5">
                <SulitWithheld words={s.withheld.en} compact />
                <p className="text-[13.5px] text-ink-2">{s.withheld.en}</p>
              </div>
            ) : s.items.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">{s.empty ?? "Nothing to show."}</p>
            ) : (
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {s.items.map((it, i) => (
                  <div key={i} className="min-w-0">
                    <dt className="text-[12px] font-semibold text-ink-3">{it.label}</dt>
                    <dd className="mt-0.5 text-[14px] break-words text-ink">
                      {it.value}
                      {it.chip && (
                        <Chip tone="warn" className="ml-2 align-middle">
                          {it.chip}
                        </Chip>
                      )}
                    </dd>
                    {it.note && <dd className={cx("mt-0.5 text-[12.5px] break-words", it.tone ? NOTE_TONE[it.tone] : "text-ink-3")}>{it.note}</dd>}
                  </div>
                ))}
              </dl>
            )}
            {extra?.[s.key]}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
