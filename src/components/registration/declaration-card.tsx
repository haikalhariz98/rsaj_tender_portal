"use client";

import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/field";

/**
 * The declaration that the information is true (FR-VND-006), with its own tick, on the registration's last step. The wording is the office's, filled with its name, or the card says it is
 * not set. Shared by the signed-in wizard, where the password signs it (`children`), and the public form (ADR 0041), where it is the applicant's tick, never called a signature: the page
 * gives the words that say who makes it and when (`byLine`).
 */
export function DeclarationCard({
  text,
  byLine,
  subtitle,
  confirmed,
  onConfirm,
  error,
  children,
}: {
  /// The filled wording, or null while none is set.
  text: string | null;
  /// Who makes it and when, in the page's own words.
  byLine: string;
  subtitle?: string;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  /// The words of a finding about the tick, where there is one.
  error?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title="Declaration" subtitle={subtitle} />
      <CardBody>
        {text ? (
          <>
            <div className="rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{text}</div>
            <p className="mt-3 text-[13px] text-ink-3">{byLine}</p>
            <div className="mt-3">
              <Checkbox label="I have read this declaration and confirm it." checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
              {error && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{error}</p>}
            </div>
            {children}
          </>
        ) : (
          <Callout tone="warn" title="Declaration text not set">
            Tell the procurement office.
          </Callout>
        )}
      </CardBody>
    </Card>
  );
}
