"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The name of the record a screen shows, for the breadcrumb's last crumb.
 *
 * The top bar only knows the path, and a path ends in a record's key — a code that
 * must never reach a screen. A page that knows the record's name renders
 * <RecordCrumb label=…/>; until one does, the crumb falls back to the kind of record.
 */
let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRecordCrumb(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function RecordCrumb({ label }: { label: string }) {
  useEffect(() => {
    current = label;
    emit();
    return () => {
      if (current === label) current = null;
      emit();
    };
  }, [label]);
  return null;
}
