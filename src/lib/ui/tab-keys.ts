/// The pure part of the shared Tabs strip's keyboard: where an arrow key moves focus, and
/// whether arriving there selects the tab.
///
/// A plain tab's panel is already on the client, so it is selected as focus arrives
/// (automatic activation; selecting only rewrites `?tab=`). A tab with sections is loaded
/// by the server, so selecting it is a navigation: arrowing onto it only moves focus (a
/// roving tabindex), and Enter or Space — the button's own click — selects it. Arrowing
/// past several such tabs therefore pushes no navigation at all.

export interface TabKeySpec {
  id: string;
  sections?: readonly unknown[];
}

export type TabKeyMove = { focus: string; select: boolean };

/// Whether selecting the tab asks the server for it (a navigation), rather than showing a panel already here.
export const navigatesOnSelect = (tab: TabKeySpec): boolean => (tab.sections?.length ?? 0) > 0;

/**
 * Where a key moves focus from the focused tab: ArrowRight/ArrowLeft to the next/previous
 * tab (wrapping), Home/End to the first/last. Null for any other key, or an empty strip.
 * Moves from the tab that has focus, not the one selected, so focus-only moves keep going.
 */
export function tabKeyMove(tabs: readonly TabKeySpec[], focusedId: string | undefined, key: string): TabKeyMove | null {
  if (tabs.length === 0) return null;
  const from = Math.max(0, tabs.findIndex((t) => t.id === focusedId));
  let to: number;
  switch (key) {
    case "ArrowRight":
      to = (from + 1) % tabs.length;
      break;
    case "ArrowLeft":
      to = (from + tabs.length - 1) % tabs.length;
      break;
    case "Home":
      to = 0;
      break;
    case "End":
      to = tabs.length - 1;
      break;
    default:
      return null;
  }
  const next = tabs[to];
  return { focus: next.id, select: !navigatesOnSelect(next) };
}
