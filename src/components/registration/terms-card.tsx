"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/field";
import { TextDrawerLink } from "@/components/ui/text-drawer";
import { APPLY } from "@/lib/portal/labels";

/**
 * The terms card at the end of step 5 (REG-4, ADR 0041 D4): one short line, the Terms and Conditions and the Personal Data Notice each opening read-only in the shared drawer, and one required
 * tick that agrees both. Shared by the public form and the signed-in wizard. The texts are the server's, filled and hashed there: the card only shows them and reports the tick. While either
 * is not set, the card says which, and there is nothing to tick.
 */
export function TermsCard({
  terms,
  notice,
  confirmed,
  onConfirm,
  missing,
}: {
  /// The terms text in force, filled with the organisation's name, or null while none is set.
  terms: { en: string } | null;
  /// The Personal Data Notice, filled, or null while it is not set.
  notice: { en: string } | null;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  /// What is not set, in words, when `terms` or `notice` is null.
  missing?: readonly string[];
}) {
  return (
    <Card>
      <CardHeader title={APPLY.termsTitle.en} />
      <CardBody>
        {terms && notice ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink-2">{APPLY.termsLine.en}</p>
            {/* A div, not a paragraph: each link's drawer is drawn beside it, and a drawer holds headings. */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
              <TextDrawerLink label={APPLY.termsLink.en} title={APPLY.termsLink.en} text={terms.en} />
              <TextDrawerLink label={APPLY.noticeLink.en} title={APPLY.noticeLink.en} text={notice.en} />
            </div>
            <Checkbox label={APPLY.termsTick.en} required checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
          </div>
        ) : (
          <Callout tone="warn" title={missing && missing.length ? missing.join(" ") : APPLY.termsTitle.en} />
        )}
      </CardBody>
    </Card>
  );
}
