"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Toggle } from "@/components/ui/toggle";

import { recordAttendance } from "./actions";

const OPTIONS = [
  { value: "yes", label: "Present", tone: "ok" },
  { value: "no", label: "Absent", tone: "neutral" },
] as const;

/// Founder, 2026-10-05: attendance is one press on the member's line, not a drawer. It records
/// through the same action as before, so every rule on the register still applies; a refusal
/// is shown under the toggle. Who an alternate stands in for is still chosen in its drawer.
export function AttendanceToggle({ meetingId, personId, name, attended, standingInForSeatId }: { meetingId: string; personId: string; name: string; attended: boolean | null; standingInForSeatId: string | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<"yes" | "no" | null>(attended == null ? null : attended ? "yes" : "no");

  const press = (v: "yes" | "no") => {
    if (v === shown) return;
    const before = shown;
    setShown(v);
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("meetingId", meetingId);
      data.set("personId", personId);
      data.set("attended", v);
      if (v === "yes" && standingInForSeatId) data.set("standingInForSeatId", standingInForSeatId);
      const result = await recordAttendance({ ok: false }, data);
      if (!result.ok) {
        setShown(before);
        setError(result.message ?? Object.values(result.errors ?? {})[0] ?? "The attendance was not recorded.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <Toggle label={`Attendance of ${name}`} options={OPTIONS} value={shown} onChange={press} disabled={busy} />
      {error && (
        <span role="alert" className="max-w-[40ch] text-right text-[12px] font-medium text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
