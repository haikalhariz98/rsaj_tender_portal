/// Where a tab (and a section of it) is: the same page, with the tab and the section named. `keep` is any other address
/// parameters the page needs to stay put (the case page's `stage`), written first. Without it the address is exactly
/// `?tab=<tab>` or `?tab=<tab>&section=<section>`, as the shared Tabs strip has always written it.
export function tabHref(pathname: string, tab: string, section?: string, keep?: Readonly<Record<string, string>>): string {
  const parts = Object.entries(keep ?? {})
    .filter(([k]) => k !== "tab" && k !== "section")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  parts.push(`tab=${encodeURIComponent(tab)}`);
  if (section) parts.push(`section=${encodeURIComponent(section)}`);
  return `${pathname}?${parts.join("&")}`;
}
