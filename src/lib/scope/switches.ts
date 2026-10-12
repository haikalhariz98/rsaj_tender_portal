/**
 * The two scope switches pinned on an exercise (SR-08 and SR-09, rulings 12 and 13, ADR 0035). Pure.
 *
 * Whether a customer uses the specification panel, and whether it builds the bill of quantities on screen, is that customer's policy
 * (`ScopePolicy`, two-person path, neither ships set). An exercise takes the organisation's setting when it is created and is never read
 * against the setting again (ruling G1), so changing the setting never rewrites the gates of an exercise in flight.
 *
 * An exercise made while a setting was unset pins "not set": creating is never refused, and submission refuses in words until the officer
 * takes the organisation's setting (`takeSettingFaults`). That act is allowed only while the pin is not set and before the first
 * submission; from then the pins are frozen. It copies the configured value and is not a free choice.
 */

import type { ExerciseStatus } from "@/lib/method/types";

import type { Finding } from "./types";

export type Switch = "specPanelUsed" | "onScreenBillUsed";
export const SWITCHES: readonly Switch[] = ["specPanelUsed", "onScreenBillUsed"];

/// The switches as they stand: on the organisation (`ScopePolicy`) or pinned on an exercise. Null is not set.
export interface SwitchValues {
  specPanelUsed: boolean | null;
  onScreenBillUsed: boolean | null;
}

/// What a new exercise pins: the organisation's setting as it is now, set or not.
export const pinFrom = (setting: SwitchValues): SwitchValues => ({ specPanelUsed: setting.specPanelUsed, onScreenBillUsed: setting.onScreenBillUsed });

/// The words for each switch, as an officer reads them.
export const SWITCH_LABEL: Readonly<Record<Switch, string>> = {
  specPanelUsed: "Specification panel used",
  onScreenBillUsed: "On-screen bill used",
};

/// "Used", "Not used" or "Not set", for a pin or a setting.
export const switchWords = (v: boolean | null): "Used" | "Not used" | "Not set" => (v == null ? "Not set" : v ? "Used" : "Not used");

export type TakeSettingFault = "EXERCISE_CANCELLED" | "ALREADY_SUBMITTED" | "NOTHING_TO_TAKE" | "SETTING_NOT_SET";

export interface TakeSettingResult {
  faults: Finding<TakeSettingFault>[];
  /// The pins to write: only the ones that are not set and whose setting is.
  changes: Partial<SwitchValues>;
  /// The switches whose pin is not set and whose setting is not either.
  stillUnset: Switch[];
}

/**
 * Whether the exercise may take the organisation's setting now, and which pins it takes. Allowed while at least one pin is not set and the
 * setting for it is, and no pack has ever been submitted (`submitted`: some pack has a submission day). A pin that is set is never changed.
 */
export function takeSettingFaults(i: { status: ExerciseStatus; submitted: boolean; pin: SwitchValues; setting: SwitchValues }): TakeSettingResult {
  const hard: Finding<TakeSettingFault>[] = [];
  const unsetFaults: Finding<TakeSettingFault>[] = [];
  const changes: Partial<SwitchValues> = {};
  const stillUnset: Switch[] = [];
  if (i.status === "CANCELLED") hard.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (i.submitted) hard.push({ code: "ALREADY_SUBMITTED", level: "block" });
  const open = SWITCHES.filter((s) => i.pin[s] == null);
  if (open.length === 0) hard.push({ code: "NOTHING_TO_TAKE", level: "block" });
  for (const s of open) {
    if (i.setting[s] == null) {
      stillUnset.push(s);
      unsetFaults.push({ code: "SETTING_NOT_SET", level: "block", data: { switch: SWITCH_LABEL[s] } });
    } else changes[s] = i.setting[s];
  }
  if (hard.length > 0) return { faults: hard, changes: {}, stillUnset };
  // Taking one switch while the other's setting is still unset is still taking: the unset one is reported, not refused.
  if (Object.keys(changes).length === 0) return { faults: unsetFaults, changes, stillUnset };
  return { faults: [], changes, stillUnset };
}
