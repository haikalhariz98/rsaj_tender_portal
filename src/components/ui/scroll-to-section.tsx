"use client";

import { useEffect } from "react";

/// An old address that names a section of a tab (`?tab=documents` is Documents' Certificates card, WRS-7) lands with that section in view.
export function ScrollToSection({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView();
  }, [id]);
  return null;
}
