"use client";

import { useEffect } from "react";

/// A link to `#anchor` that lands on a folded section opens it (note 0005 R13, the address is a reason to start open).
/// Browsers open a fold only for a target inside it, and a fold's own id is on the fold, so this does it.
export function OpenOnHash({ id }: { id?: string }) {
  useEffect(() => {
    if (!id) return;
    const run = () => {
      if (window.location.hash !== `#${id}`) return;
      const el = document.getElementById(id);
      if (!el) return;
      // The fold itself and every fold around it.
      let opened = false;
      for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) {
        if (!d.open) {
          d.open = true;
          opened = true;
        }
      }
      if (opened) el.scrollIntoView();
    };
    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, [id]);
  return null;
}
