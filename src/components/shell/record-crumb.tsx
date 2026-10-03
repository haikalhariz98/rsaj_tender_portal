"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The name of the record a screen shows, for the breadcrumb's last crumb.
 *
 * The top bar only knows the path, and a path ends in a record's key — a code that
 * must never reach a screen. A page that knows the record's name renders
 * <RecordCrumb label=…/>; until one does, the crumb falls back to the kind of record.
 * A record that sits under another (a certificate under its contract) names that one too,
 * as `parent`, so neither crumb shows a key.
 */
let current: string | null = null;
let currentParent: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRecordCrumb(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/// The name of the record the shown record sits under, where the page gave one.
export function useRecordParentCrumb(): string | null {
  return useSyncExternalStore(subscribe, () => currentParent, () => null);
}

export function RecordCrumb({ label, parent }: { label: string; parent?: string }) {
  useEffect(() => {
    current = label;
    currentParent = parent ?? null;
    emit();
    return () => {
      if (current === label) {
        current = null;
        currentParent = null;
      }
      emit();
    };
  }, [label, parent]);
  return null;
}
