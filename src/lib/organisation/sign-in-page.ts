/**
 * What the staff sign-in page says about the organisation, and how it is judged.
 *
 * Every word here is the organisation's own choice, stored nullable: the portal name, the headline, the supporting sentence, three
 * highlights (each with an optional icon from a fixed set), the tagline and the three footer links. Nothing is proposed. Unset means the element is not drawn (or, for the card's
 * title, the neutral product word "Sign in" stands); it never means a stand-in sentence about the organisation.
 *
 * Pure: the page asks `signInView` what to draw and renders it, and the configuration action asks `signInPageFaults` and
 * `normaliseSignInPage` and stores what comes back.
 */
import { dayIn } from "@/lib/dates";

export const SIGN_IN_TEXT_FIELDS = ["portalName", "headline", "supportingText", "highlight1", "highlight2", "highlight3", "tagline"] as const;
export const SIGN_IN_LINK_FIELDS = ["privacyUrl", "termsUrl", "helpDeskUrl"] as const;
/// The icon beside each highlight. Optional: unset draws the neutral tick, because an icon nobody chose would claim a meaning nobody gave it.
export const SIGN_IN_ICON_FIELDS = ["highlight1Icon", "highlight2Icon", "highlight3Icon"] as const;
export const SIGN_IN_FIELDS = [...SIGN_IN_TEXT_FIELDS, ...SIGN_IN_ICON_FIELDS, ...SIGN_IN_LINK_FIELDS] as const;

/// The fixed set a highlight's icon is chosen from. These are setting keys: they are stored, and never drawn as text. The screen shows `SIGN_IN_ICON_LABEL`
/// in the settings form and a drawing (src/components/icons.tsx) on the sign-in page. Adding one means a drawing for it, and the sign-in screen's map says so.
export const SIGN_IN_ICONS = ["document", "people", "shield", "check", "lock", "clock", "chart", "award", "building", "globe", "wallet"] as const;
export type SignInIcon = (typeof SIGN_IN_ICONS)[number];

export const SIGN_IN_ICON_LABEL: Record<SignInIcon, string> = {
  document: "Document",
  people: "Group of people",
  shield: "Shield with a tick",
  check: "Tick",
  lock: "Padlock",
  clock: "Clock",
  chart: "Chart",
  award: "Award rosette",
  building: "Building",
  globe: "Globe",
  wallet: "Wallet",
};

const isIconField = (f: SignInField): f is (typeof SIGN_IN_ICON_FIELDS)[number] => (SIGN_IN_ICON_FIELDS as readonly string[]).includes(f);

/// The icon a stored value names, or null: a value that is not in the set (written some other way) is never drawn.
export function signInIconOf(value: string | null | undefined): SignInIcon | null {
  return (SIGN_IN_ICONS as readonly string[]).includes(value ?? "") ? (value as SignInIcon) : null;
}

/// How a stored value reads where a person sees it (the change history): an icon by its label, anything else as it is.
export function signInValueLabel(field: SignInField, value: string | null): string | null {
  if (!isIconField(field) || value == null) return value;
  const icon = signInIconOf(value);
  return icon ? SIGN_IN_ICON_LABEL[icon] : value;
}

export type SignInField = (typeof SIGN_IN_FIELDS)[number];

/// What the form posts: text as typed, absent or empty where left blank.
export type SignInPageInput = Partial<Record<SignInField, string | null | undefined>>;

/// What is stored: trimmed, blank as null.
export type SignInPageSettings = Record<SignInField, string | null>;

export const SIGN_IN_LABEL: Record<SignInField, string> = {
  portalName: "Portal name",
  headline: "Headline",
  supportingText: "Supporting sentence",
  highlight1: "First highlight",
  highlight2: "Second highlight",
  highlight3: "Third highlight",
  highlight1Icon: "First highlight's icon",
  highlight2Icon: "Second highlight's icon",
  highlight3Icon: "Third highlight's icon",
  tagline: "Tagline",
  privacyUrl: "Privacy link",
  termsUrl: "Terms link",
  helpDeskUrl: "Help desk link",
};

export const SIGN_IN_MAX: Record<SignInField, number> = {
  portalName: 80,
  headline: 90,
  supportingText: 200,
  highlight1: 40,
  highlight2: 40,
  highlight3: 40,
  highlight1Icon: 20,
  highlight2Icon: 20,
  highlight3Icon: 20,
  tagline: 120,
  privacyUrl: 300,
  termsUrl: 300,
  helpDeskUrl: 300,
};

const LINK_NAME: Record<(typeof SIGN_IN_LINK_FIELDS)[number], string> = { privacyUrl: "Privacy", termsUrl: "Terms", helpDeskUrl: "Help Desk" };

const clean = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

const hasScheme = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url);

/// A bare domain is given https. Anything already carrying a scheme is left alone for the check to judge.
export function withScheme(url: string): string {
  return hasScheme(url) && !/^[^/\s:]+:\d+(\/|$)/.test(url) ? url : `https://${url}`;
}

/// The address, if it is one a link may point at: http or https, with a host, and no credentials in it. Null otherwise.
/// Used when the setting is saved and again when the page is drawn, so a value written some other way is never made a link.
export function safeLinkHref(url: string | null | undefined): string | null {
  const text = (url ?? "").trim();
  if (!text || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname || parsed.username || parsed.password) return null;
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
  return parsed.href;
}

/// The values to store: trimmed, blank as null, a bare domain given https.
export function normaliseSignInPage(input: SignInPageInput): SignInPageSettings {
  const out = {} as SignInPageSettings;
  for (const f of SIGN_IN_FIELDS) {
    const v = clean(input[f]);
    out[f] = v === "" ? null : v;
  }
  for (const f of SIGN_IN_LINK_FIELDS) if (out[f]) out[f] = withScheme(out[f]!);
  for (const f of SIGN_IN_ICON_FIELDS) if (out[f]) out[f] = out[f]!.toLowerCase();
  return out;
}

/// What is wrong with what was typed, by field, in words. Empty when it can be stored.
export function signInPageFaults(input: SignInPageInput): Partial<Record<SignInField, string>> {
  const v = normaliseSignInPage(input);
  const faults: Partial<Record<SignInField, string>> = {};
  for (const f of SIGN_IN_FIELDS) {
    const text = v[f];
    if (text && text.length > SIGN_IN_MAX[f]) faults[f] = `${SIGN_IN_LABEL[f]} can be at most ${SIGN_IN_MAX[f]} characters. This is ${text.length}.`;
  }
  for (const f of SIGN_IN_ICON_FIELDS) {
    if (v[f] && !signInIconOf(v[f])) faults[f] = `${SIGN_IN_LABEL[f]} must be one of the icons in the list.`;
  }
  for (const f of SIGN_IN_LINK_FIELDS) {
    if (v[f] && !faults[f] && !safeLinkHref(v[f])) faults[f] = `${SIGN_IN_LABEL[f]} must be a web address starting with https:// (or http://), for example https://www.example.com/help.`;
  }
  return faults;
}

export interface SignInView {
  /// The card's title: the portal name, else the neutral product word.
  title: string;
  /// The portal name, when set: the spaced-caps line over the headline and the "Welcome to" line over the title.
  portalName: string | null;
  headline: string | null;
  supportingText: string | null;
  /// Up to three, in order, none without words. `icon` is null where none was chosen: the page then draws the neutral tick.
  highlights: { text: string; icon: SignInIcon | null }[];
  tagline: string | null;
  /// Only the links that are set and safe, in the order they are shown.
  links: { label: string; href: string }[];
  /// The year in the footer, in the organisation's own zone.
  year: string;
  organisationName: string;
  /// Whether there is anything for the left panel to carry: an image, a logo or any of its words. With none, the card stands alone.
  hasPanel: boolean;
}

/// The neutral product word when no portal name is set.
export const SIGN_IN_DEFAULT_TITLE = "Sign in";

export function signInView(
  settings: Partial<SignInPageSettings> | null,
  context: { organisationName: string; hasImage: boolean; hasLogo: boolean; now: Date; timeZone: string | null },
): SignInView {
  const s = normaliseSignInPage(settings ?? {});
  const highlights = (["highlight1", "highlight2", "highlight3"] as const).flatMap((f) => {
    const text = s[f];
    // An icon with no words beside it says nothing, so it goes with them.
    return text == null ? [] : [{ text, icon: signInIconOf(s[`${f}Icon` as const]) }];
  });
  const links = SIGN_IN_LINK_FIELDS.flatMap((f) => {
    const href = safeLinkHref(s[f]);
    return href ? [{ label: LINK_NAME[f], href }] : [];
  });
  const year = dayIn(context.now, context.timeZone).slice(0, 4);
  const hasPanel = context.hasImage || context.hasLogo || !!(s.portalName || s.headline || s.supportingText || highlights.length || s.tagline);
  return {
    title: s.portalName ?? SIGN_IN_DEFAULT_TITLE,
    portalName: s.portalName,
    headline: s.headline,
    supportingText: s.supportingText,
    highlights,
    tagline: s.tagline,
    links,
    year,
    organisationName: context.organisationName,
    hasPanel,
  };
}
