import { Chip } from "@/components/ui/badge";
import { GATE_ITEM_NOTE, GATE_LABEL, GATE_STATE_LABEL, gateDetailText } from "@/lib/award/gate-words";

/**
 * The pre-signature readiness gate's items (FR-CON-008), as the award's Conditions tab and the contract's
 * record both show them: one list, so the two never say different things.
 */
export function ReadinessGateList({ items, bondNotRequiredReason }: { items: readonly { key: string; state: "MET" | "NOT_MET" | "NOT_SET"; detail: readonly string[] }[]; bondNotRequiredReason: string }) {
  return (
    <ul className="divide-y divide-line/70">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-ink">{GATE_LABEL[i.key as keyof typeof GATE_LABEL]}</span>
            {i.detail.length > 0 && <span className="block text-[12.5px] break-words text-ink-3">{gateDetailText(i, bondNotRequiredReason)}</span>}
            {GATE_ITEM_NOTE[i.key as keyof typeof GATE_LABEL] && <span className="block text-[12.5px] break-words text-ink-3">{GATE_ITEM_NOTE[i.key as keyof typeof GATE_LABEL]}</span>}
          </span>
          <Chip tone={i.state === "MET" ? "ok" : i.state === "NOT_SET" ? "warn" : "err"}>{GATE_STATE_LABEL[i.state]}</Chip>
        </li>
      ))}
    </ul>
  );
}
