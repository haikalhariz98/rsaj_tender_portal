import type { AccountStatus } from "@/generated/prisma/client";

import { secondPersonNotice } from "./administration-rules";

/// What a person's sign-in account shows in the People list, and which acts it offers. Pure: the page asks, the list renders.
/// (Moved from the retired Sign-in accounts page, rule for rule: nothing here is new policy.)

interface AccountFacts {
  status: AccountStatus;
  isYou: boolean;
  isAdministrator: boolean;
  personActive: boolean;
  lockedUntil: Date | null;
  failedAttempts: number;
  holdings: { offices: number; seats: number; delegations: number };
  held: { offices: number; seats: number; delegations: number };
}

export type Standing = { text: "Active" | "Not activated" | "Locked" | "Disabled"; tone: "ok" | "warn" | "err" };

export function signInStanding(r: Pick<AccountFacts, "status" | "lockedUntil">, now: Date): Standing {
  if (r.status === "DISABLED") return { text: "Disabled", tone: "err" };
  if (r.lockedUntil && r.lockedUntil > now) return { text: "Locked", tone: "warn" };
  return r.status === "PENDING_ACTIVATION" ? { text: "Not activated", tone: "warn" } : { text: "Active", tone: "ok" };
}

export interface AccountActs {
  /// A code to issue; `notice` is set where it must be proposed to a second person instead.
  code: { purpose: "ACTIVATION" | "RESET"; notice: string | null } | null;
  admin: "GRANT" | "REVOKE" | null;
  unlock: boolean;
  enable: boolean;
  disable: boolean;
}

export function accountActs(r: AccountFacts, now: Date): AccountActs {
  // A code for an administrator's account, or for a person who holds or has held anything, needs a second person.
  const notice = secondPersonNotice({ isAdministrator: r.isAdministrator, held: r.held });
  const holdsNow = r.holdings.offices + r.holdings.seats + r.holdings.delegations > 0;
  const locked = (r.lockedUntil != null && r.lockedUntil > now) || r.failedAttempts > 0;
  return {
    code: r.status === "PENDING_ACTIVATION" ? { purpose: "ACTIVATION", notice } : r.status === "ACTIVE" && !r.isYou ? { purpose: "RESET", notice } : null,
    admin: r.status === "ACTIVE" && r.personActive && !r.isAdministrator && !holdsNow ? "GRANT" : r.status === "ACTIVE" && r.isAdministrator ? "REVOKE" : null,
    unlock: locked && r.status !== "DISABLED",
    enable: r.status === "DISABLED",
    disable: r.status !== "DISABLED" && !r.isYou,
  };
}
