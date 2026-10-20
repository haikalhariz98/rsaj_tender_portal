/**
 * What the supplier portal's front door says about the organisation (design note 0006, rulings L3 to L5).
 *
 * Every word here is the organisation's own choice, stored nullable: the public portal's address, a headline, one line and three highlights (each with an
 * optional icon from the sign-in page's fixed set). Nothing is seeded. Unset means the element is not drawn, except the headline, where the product's neutral
 * word "Supplier portal" stands (a product label like "Sign in", never a sentence about the organisation), and the address, which is said to be unset where an
 * officer would need it.
 *
 * The address belongs to the organisation and is used only as an outbound link drawn on the staff copy. It never feeds the Origin guard, form tokens,
 * redirects, cookies or email (ruling L5), and it is stored as an origin, so a path, a query or a fragment typed with it is dropped.
 *
 * Pure: the screens ask `portalView` what to draw, and the configuration editor asks `portalPageFaults` and `normalisePortalPage` and stores what comes back.
 */
import { safeLinkHref, SIGN_IN_ICON_LABEL, signInIconOf, withScheme, type SignInIcon } from "./sign-in-page";

export const PORTAL_TEXT_FIELDS = ["headline", "line", "highlight1", "highlight2", "highlight3"] as const;
export const PORTAL_ICON_FIELDS = ["highlight1Icon", "highlight2Icon", "highlight3Icon"] as const;
export const PORTAL_FIELDS = ["publicAddress", ...PORTAL_TEXT_FIELDS, ...PORTAL_ICON_FIELDS] as const;
export type PortalField = (typeof PORTAL_FIELDS)[number];

export type PortalPageInput = Partial<Record<PortalField, string | null | undefined>>;
export type PortalPageSettings = Record<PortalField, string | null>;

export const PORTAL_LABEL: Record<PortalField, string> = {
  publicAddress: "Public portal address",
  headline: "Headline",
  line: "One line",
  highlight1: "First highlight",
  highlight1Icon: "First highlight's icon",
  highlight2: "Second highlight",
  highlight2Icon: "Second highlight's icon",
  highlight3: "Third highlight",
  highlight3Icon: "Third highlight's icon",
};

export const PORTAL_MAX: Record<PortalField, number> = {
  publicAddress: 300,
  headline: 60,
  line: 120,
  highlight1: 40,
  highlight1Icon: 20,
  highlight2: 40,
  highlight2Icon: 20,
  highlight3: 40,
  highlight3Icon: 20,
};

/// The product's own word when no headline is set.
export const PORTAL_DEFAULT_HEADLINE = "Supplier portal";

const clean = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

/// The origin of an address that a link may point at (http or https, a host, no credentials), or null. Used when the setting is saved and again when the page is
/// drawn, so a value written some other way is never made a link.
export function portalOrigin(value: string | null | undefined): string | null {
  const href = safeLinkHref(value);
  return href ? new URL(href).origin : null;
}

/// The values to store: trimmed, blank as null, a bare domain given https, the address cut down to its origin.
export function normalisePortalPage(input: PortalPageInput): PortalPageSettings {
  const out = {} as PortalPageSettings;
  for (const f of PORTAL_FIELDS) {
    const v = clean(input[f]);
    out[f] = v === "" ? null : v;
  }
  if (out.publicAddress) {
    const withHttps = withScheme(out.publicAddress);
    out.publicAddress = portalOrigin(withHttps) ?? withHttps;
  }
  for (const f of PORTAL_ICON_FIELDS) if (out[f]) out[f] = out[f]!.toLowerCase();
  return out;
}

/// What is wrong with what was typed, by field, in words. Empty when it can be stored.
export function portalPageFaults(input: PortalPageInput): Partial<Record<PortalField, string>> {
  const v = normalisePortalPage(input);
  const faults: Partial<Record<PortalField, string>> = {};
  for (const f of PORTAL_FIELDS) {
    const text = v[f];
    if (text && text.length > PORTAL_MAX[f]) faults[f] = `${PORTAL_LABEL[f]} can be at most ${PORTAL_MAX[f]} characters. This is ${text.length}.`;
  }
  for (const f of PORTAL_ICON_FIELDS) {
    if (v[f] && !signInIconOf(v[f])) faults[f] = `${PORTAL_LABEL[f]} must be one of the icons in the list.`;
  }
  if (v.publicAddress && !faults.publicAddress && !portalOrigin(v.publicAddress)) {
    faults.publicAddress = `${PORTAL_LABEL.publicAddress} must be a web address starting with https:// (or http://), for example https://suppliers.example.com.`;
  }
  return faults;
}

/// How a stored value reads where a person sees it (the change history): an icon by its label, anything else as it is.
export function portalValueLabel(field: PortalField, value: string | null): string | null {
  if (value == null || !(PORTAL_ICON_FIELDS as readonly string[]).includes(field)) return value;
  const icon = signInIconOf(value);
  return icon ? SIGN_IN_ICON_LABEL[icon] : value;
}

export interface PortalView {
  /// The organisation's headline, else the product's neutral word.
  headline: string;
  /// Not drawn when null: no stand-in sentence.
  line: string | null;
  /// Up to three, in order, none without words. `icon` is null where none was chosen: the page then draws the neutral tick.
  highlights: { text: string; icon: SignInIcon | null }[];
  /// The public portal's origin, or null when it is unset or not an address a link may point at.
  publicAddress: string | null;
}

export function portalView(settings: Partial<PortalPageSettings> | null): PortalView {
  const s = normalisePortalPage(settings ?? {});
  const highlights = (["highlight1", "highlight2", "highlight3"] as const).flatMap((f) => {
    const text = s[f];
    // An icon with no words beside it says nothing, so it goes with them.
    return text == null ? [] : [{ text, icon: signInIconOf(s[`${f}Icon` as const]) }];
  });
  return { headline: s.headline ?? PORTAL_DEFAULT_HEADLINE, line: s.line, highlights, publicAddress: portalOrigin(s.publicAddress) };
}

/// A link to the same page on the public portal: its origin, then the path. Null where no address is set.
export function publicPortalHref(address: string | null, path: string): string | null {
  const origin = portalOrigin(address);
  return origin ? `${origin}${path}` : null;
}
