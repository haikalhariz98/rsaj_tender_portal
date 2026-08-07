"use client";

import { useState, type ReactNode } from "react";

import { ChevronDown } from "@/components/icons";

/**
 * A collapsible group. Used to hold each decision type's rules, so 92 rows across
 * 29 types can sit on one screen without any of them being hidden behind a filter.
 */
export function Accordion({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="acc">
      <button
        type="button"
        className="acc__h"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="grow trunc">{title}</span>
        {meta && (
          <span className="row">
            <span className="xs dim">{meta}</span>
          </span>
        )}
        <ChevronDown size={16} className="acc__ch" />
      </button>
      {open && <div className="acc__b">{children}</div>}
    </div>
  );
}
