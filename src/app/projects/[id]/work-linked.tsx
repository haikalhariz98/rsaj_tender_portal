import Link from "next/link";

import { LinkIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Note } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { BOARD_DONE_DAYS } from "@/lib/work/board";
import { STATUS_WORDS } from "@/lib/work/labels";
import { LINKED_WORDS, linkedMovesWhen, linkedRegisterHref, type LinkedCard } from "@/lib/work/linked";

import { WorkPanelShell } from "./work-controls";

/**
 * A linked card, opened (0008 4.6): the act's facts and one button to its register. Read only: nothing here moves or edits the act, and no item links to it (WB-11), so the
 * button is a plain link and the register's own page asks its gate.
 */
export function LinkedCardPanel({ contractId, card, closeHref }: { contractId: string; card: LinkedCard | null; closeHref: string }) {
  if (!card) {
    return (
      <WorkPanelShell label="Linked card" closeHref={closeHref} title="Not on the board">
        <Note>That act is not on this contract&apos;s board. It may have been decided more than {BOARD_DONE_DAYS} days ago.</Note>
      </WorkPanelShell>
    );
  }
  const words = LINKED_WORDS[card.kind];
  return (
    <WorkPanelShell label={`Linked ${card.label}`} closeHref={closeHref} title={card.label} subtitle={<span className="inline-flex items-center gap-1.5"><LinkIcon size={13} /> {words.register}</span>} badge={<Badge>{card.stateWords}</Badge>}>
      <div className="flex flex-col gap-5">
        <KeyValues
          columns={2}
          items={[
            { label: "On the board", value: STATUS_WORDS[card.column].en },
            ...(card.decidedOn ? [{ label: "Decided on", value: formatDate(dayToDate(card.decidedOn)) }] : []),
          ]}
        />
        <p className="text-[13.5px] text-ink-3">{linkedMovesWhen(card.kind)}</p>
        <div>
          <ButtonLink href={linkedRegisterHref(contractId, card.kind, card.id)} size="sm">
            {words.open}
          </ButtonLink>
        </div>
      </div>
    </WorkPanelShell>
  );
}

/// The List's pinned group above page 1 (Open view): each card opens its panel. Capped; the rest are on the board.
export function LinkedPinned({ cards, more, hrefOf }: { cards: LinkedCard[]; more: number; hrefOf: (c: LinkedCard) => string }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="linked-pinned-h" className="mx-5 mb-3 rounded-xl border border-dashed border-ink-3/60 px-4 py-3 sm:mx-6">
      <h3 id="linked-pinned-h" className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
        <LinkIcon size={14} /> Contract acts
      </h3>
      <ul className="flex flex-col gap-1.5">
        {cards.map((c) => (
          <li key={`${c.kind}:${c.id}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <Link href={hrefOf(c)} scroll={false} className="font-semibold">
              {c.label}
            </Link>
            <Badge>{c.stateWords}</Badge>
            <span className="text-ink-3">{STATUS_WORDS[c.column].en}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-[12.5px] text-ink-3">Showing the first {cards.length}. The board has the rest.</p>}
    </section>
  );
}
