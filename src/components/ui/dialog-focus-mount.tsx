"use client";

import { useEffect } from "react";

import { installDialogFocus } from "./dialog-focus";

/// Mounted once in the root layout. Renders nothing; see `dialog-focus.ts`.
export function DialogFocus() {
  useEffect(() => installDialogFocus(document), []);
  return null;
}
