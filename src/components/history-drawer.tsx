"use client";

import { useEffect, useState, useTransition } from "react";

import { historyOf, type HistoryEntry } from "@/app/configuration/history";
import { ClockIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { rowFieldLabel } from "@/lib/audit/diff";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";

const ACTION: Record<HistoryEntry["action"], { label: string; tone: "ok" | "info" | "err" }> = {
  CREATE: { label: "Created", tone: "ok" },
  UPDATE: { label: "Changed", tone: "info" },
  DELETE: { label: "Removed", tone: "err" },
};

/**
 * One record's history: what changed, from what to what, when, and why.
 *
 * Every write in Configuration is already audited in the same transaction as the
 * change; this is where it can be read. Loaded when opened — the trail is not part
 * of the screen until somebody asks for it.
 */
export function HistoryButton({
  entity,
  entityId,
  label,
  iconOnly = false,
}: {
  entity: string;
  entityId: string;
  /// What the record is called, for the drawer's title.
  label: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [pending, startTransition] = useTransition();

  const show = () => {
    setOpen(true);
    startTransition(async () => setEntries(await historyOf(entity, entityId)));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`History of ${label}`}
        title="History"
        className={iconOnly ? iconButtonClass("sm") : buttonClass("ghost", "sm")}
      >
        <ClockIcon size={15} />
        {!iconOnly && "History"}
      </button>

      {open && (
        <div
          className={DRAWER_SCRIM}
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`History of ${label}`}
            className={drawerPanelClass("md")}
          >
            <DrawerHeader
              icon={<ClockIcon size={17} />}
              title="History"
              subtitle={label}
              onClose={() => setOpen(false)}
            />

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {pending || entries == null ? (
                <p className="text-[13px] text-ink-3">Loading…</p>
              ) : entries.length === 0 ? (
                <EmptyState size="sm" title="Nothing recorded">
                  No change to this record has been recorded.
                </EmptyState>
              ) : (
                <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
                  {entries.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-brand-500 ring-4 ring-surface" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ACTION[e.action].tone}>{ACTION[e.action].label}</Badge>
                        <span className="text-[12.5px] text-ink-3">{e.when}</span>
                      </div>
                      {e.part && <p className="mt-1.5 text-[13px] font-semibold break-words text-ink">{e.part}</p>}
                      <p className="mt-1 text-[12.5px] text-ink-3">
                        {e.actorName ?? (e.unattributed ? "Not attributed — this screen does not yet record who acted" : "Unknown")}
                      </p>
                      {e.reason && (
                        <p className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px] text-ink-2">“{e.reason}”</p>
                      )}
                      {e.changes.length > 0 && (
                        <dl className="mt-2 flex flex-col gap-1.5">
                          {e.changes.map((c) => (
                            <div key={c.field} className="text-[13px]">
                              <dt className="font-semibold text-ink-2">{rowFieldLabel(c.field, e.changes.map((x) => x.field))}</dt>
                              <dd className="break-words text-ink-3">
                                {e.action === "CREATE" ? (
                                  <span className="text-ink">{c.after ?? "empty"}</span>
                                ) : (
                                  <>
                                    <span className="line-through decoration-ink-4">{c.before ?? "empty"}</span>
                                    {" → "}
                                    <span className="text-ink">{c.after ?? "empty"}</span>
                                  </>
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
