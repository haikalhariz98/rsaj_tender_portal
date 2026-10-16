/**
 * Ruling 20bt: one focus rule for every overlay built on `DRAWER_SCRIM` or `CONFIRM_SCRIM`. A dialog marks itself `aria-modal="true"`; while one is open, Tab and
 * Shift+Tab cycle inside the top one, focus moves in when it opens, Escape closes it, and focus goes back to what opened it. It is installed once, by `DialogFocus` in the
 * root layout, so no dialog carries its own copy and a new one gets the rule by marking itself modal.
 *
 * Escape: most dialogs already close on it. This waits a moment and, if the dialog is still there, presses the scrim, which is the close every dialog already wires (and
 * which a dialog that is busy saving refuses). So a dialog is never closed twice and none is left without an Escape.
 */

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

const visible = (el: HTMLElement) => !el.hidden && el.getAttribute("aria-hidden") !== "true" && el.closest("[hidden], [inert]") === null;

/// The controls a keyboard can reach inside a dialog, in order.
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.matches(":disabled") || el.getAttribute("tabindex") === "-1" || (el instanceof HTMLInputElement && el.type === "hidden")) return false;
    return visible(el);
  });
}

/// Where Tab goes from `active`, or null when the browser may carry on by itself.
export function tabTarget(items: readonly HTMLElement[], dialog: HTMLElement, active: Element | null, backwards: boolean): HTMLElement | null {
  if (items.length === 0) return dialog;
  const first = items[0];
  const last = items[items.length - 1];
  if (!active || !dialog.contains(active)) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}

const ESCAPE_GRACE_MS = 60;

export function installDialogFocus(doc: Document = document): () => void {
  const win = doc.defaultView!;
  const openers = new Map<HTMLElement, HTMLElement | null>();
  let lastOutside: HTMLElement | null = null;

  const dialogs = () => Array.from(doc.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
  const top = () => dialogs().at(-1) ?? null;

  const onFocusIn = (e: FocusEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && !t.closest('[aria-modal="true"]')) lastOutside = t;
  };

  const sync = () => {
    const now = dialogs();
    for (const d of now) {
      if (openers.has(d)) continue;
      openers.set(d, lastOutside && lastOutside.isConnected ? lastOutside : null);
      if (!d.contains(doc.activeElement)) {
        const first = focusables(d)[0];
        if (!first && !d.hasAttribute("tabindex")) d.setAttribute("tabindex", "-1");
        (first ?? d).focus({ preventScroll: true });
      }
    }
    for (const [d, opener] of Array.from(openers)) {
      if (d.isConnected) continue;
      openers.delete(d);
      if (openers.size === 0 && opener?.isConnected && (doc.activeElement === doc.body || doc.activeElement === null)) opener.focus({ preventScroll: true });
    }
  };
  const observer = new win.MutationObserver(sync);
  observer.observe(doc.body, { childList: true, subtree: true });
  sync();

  const onKeyDown = (e: KeyboardEvent) => {
    const d = top();
    if (!d) return;
    if (e.key === "Tab") {
      const next = tabTarget(focusables(d), d, doc.activeElement, e.shiftKey);
      if (next) {
        if (next === d && !d.hasAttribute("tabindex")) d.setAttribute("tabindex", "-1");
        e.preventDefault();
        next.focus();
      }
    } else if (e.key === "Escape") {
      win.setTimeout(() => {
        if (!d.isConnected || top() !== d) return;
        const scrim = d.parentElement;
        if (!scrim || !scrim.className.includes("fixed")) return;
        scrim.dispatchEvent(new (win.PointerEvent ?? win.MouseEvent)("pointerdown", { bubbles: true }));
      }, ESCAPE_GRACE_MS);
    }
  };

  doc.addEventListener("focusin", onFocusIn);
  doc.addEventListener("keydown", onKeyDown);
  return () => {
    observer.disconnect();
    doc.removeEventListener("focusin", onFocusIn);
    doc.removeEventListener("keydown", onKeyDown);
    openers.clear();
  };
}
