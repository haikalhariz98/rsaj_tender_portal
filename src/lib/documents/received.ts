/**
 * The paper's received day (NFR-AUD-005). Stored-at is the server's; "received on" is
 * the day the paper came in, typed by the officer, in the organisation's days. It is
 * optional, but a typed one is never in the future — and with no time zone set there is
 * no "today" to judge it against, so it is refused naming the setting, never judged in UTC.
 */

import type { Finding } from "./types";

export type ReceivedFault = "RECEIVED_ON_INVALID" | "TIME_ZONE_UNSET" | "RECEIVED_ON_FUTURE";

export function receivedOnFault(day: string | null, today: string | null): Finding<ReceivedFault> | null {
  if (day == null || day === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return { code: "RECEIVED_ON_INVALID", level: "block" };
  if (today == null) return { code: "TIME_ZONE_UNSET", level: "block" };
  if (day > today) return { code: "RECEIVED_ON_FUTURE", level: "block", data: { today } };
  return null;
}
