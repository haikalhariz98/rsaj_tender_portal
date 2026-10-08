/**
 * Step one of CPD's registration (FR-VND-001), the parts the public form gained in Phase 4a: the address in parts, the date the company was incorporated,
 * the Bumiputera status the applicant declares, and the mobile number with its country's dial code. Pure: the lists and the day are passed in.
 *
 * Nothing here is policy. The lists (states, Bumiputera statuses, dial codes) are the customer's configuration and ship empty. A list that is empty is not
 * a reason to blame the applicant: the states close the form, as the entity types and the countries do, and an empty Bumiputera list simply asks nothing.
 * The Bumiputera status is a CLAIM. The effective status is still the verified restriction-evidence document (BD-615-1), and nothing here reads the claim
 * for anything but showing it, labelled as declared.
 */

import { isDay } from "@/lib/dates";

import type { Finding } from "./types";

export type StepOneFault =
  | "ADDRESS_LINE_REQUIRED"
  | "CITY_REQUIRED"
  | "POSTCODE_REQUIRED"
  | "STATES_NOT_SET"
  | "ADDRESS_STATE_REQUIRED"
  | "ADDRESS_STATE_NOT_LISTED"
  | "BUMIPUTERA_NOT_LISTED"
  | "INCORPORATED_ON_REQUIRED"
  | "INCORPORATED_ON_NOT_A_DAY"
  | "INCORPORATED_IN_FUTURE";

export interface AddressParts {
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  /// A code on the STATE list.
  stateCode: string | null;
}

export interface StepOneInput {
  address: AddressParts;
  /// A code on the BUMIPUTERA_STATUS list, or null: the applicant made no claim.
  bumiputeraClaimCode: string | null;
  /// YYYY-MM-DD as typed, or null.
  incorporatedOn: string | null;
}

export interface StepOneContext {
  /// The organisation's day. The caller has already closed the form while this is null.
  today: string;
  /// The live codes of each configured list. Empty: the list is not set.
  stateCodes: readonly string[];
  bumiputeraCodes: readonly string[];
}

/**
 * The faults of the parts step one gained. The street, the city and the postcode are asked as text, and no postcode format is written here (a postcode's shape
 * is a country's). The date incorporated is required, a real day and not after today (CPD, 2026-10-07): today itself is allowed, since a company may be incorporated
 * on the day it applies. A Bumiputera claim is optional, and when given must be on the list.
 */
export function stepOneFaults(i: StepOneInput, ctx: StepOneContext): Finding<StepOneFault>[] {
  const out: Finding<StepOneFault>[] = [];
  const add = (code: StepOneFault, level: Finding["level"] = "block") => out.push({ code, level });
  if (!i.address.addressLine1.trim()) add("ADDRESS_LINE_REQUIRED");
  if (!i.address.city.trim()) add("CITY_REQUIRED");
  if (!i.address.postcode.trim()) add("POSTCODE_REQUIRED");
  if (ctx.stateCodes.length === 0) add("STATES_NOT_SET");
  else if (!i.address.stateCode) add("ADDRESS_STATE_REQUIRED");
  else if (!ctx.stateCodes.includes(i.address.stateCode)) add("ADDRESS_STATE_NOT_LISTED");
  if (i.bumiputeraClaimCode && !ctx.bumiputeraCodes.includes(i.bumiputeraClaimCode)) add("BUMIPUTERA_NOT_LISTED");
  const day = i.incorporatedOn?.trim() ?? "";
  if (!day) add("INCORPORATED_ON_REQUIRED");
  else if (!isDay(day)) add("INCORPORATED_ON_NOT_A_DAY");
  else if (day > ctx.today) add("INCORPORATED_IN_FUTURE");
  return out;
}

/**
 * The address as one text, for the readers that want one (the register, the exports). The parts in the order a letter is addressed, a line each, the
 * postcode and city together. `stateName` is the state as the list names it; a state no longer listed is left out rather than shown as a code.
 */
export function composeAddress(parts: Pick<AddressParts, "addressLine1" | "addressLine2" | "city" | "postcode">, stateName: string | null): string {
  const clean = (s: string) => s.trim().replace(/\s+/g, " ");
  const town = [clean(parts.postcode), clean(parts.city)].filter(Boolean).join(" ");
  return [clean(parts.addressLine1), clean(parts.addressLine2), town, stateName ? clean(stateName) : ""].filter(Boolean).join("\n");
}

/**
 * A mobile number with its country's dial code. The applicant types the number without it (the form shows the code in front), and the code is joined here, once.
 * A number typed with its own plus sign or a leading 00 is already international and is kept as typed. With no dial code configured nothing is added and the
 * number is taken as typed. No trunk digit is dropped and no length is judged: both are a country's, and the product knows no country.
 */
export function mobileWithDialCode(typed: string, callingCode: string | null): string {
  const number = typed.trim().replace(/\s+/g, " ");
  if (number === "") return "";
  if (callingCode == null || callingCode === "" || number.startsWith("+") || number.startsWith("00")) return number;
  return `${callingCode} ${number}`;
}

/// What a person typed in a day field, brought to a day, or null where it is not one. A day only: `isDay` refuses an impossible one.
export const typedDay = (s: string | null | undefined): string | null => (s && isDay(s.trim()) ? s.trim() : null);
