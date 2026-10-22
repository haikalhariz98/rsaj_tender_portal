"use client";

import { useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UNSCANNED_CONFIRM_PARAM, UNSCANNED_QUESTION } from "@/lib/documents/applicant-scan";

/**
 * The one link to a stored version's bytes. A file sent by someone not signed in, while no malware scanner is configured (RSEC-2), is never opened on a plain click: the shared
 * question is asked first, and only the confirmed request carries the parameter the download route asks for. Any other file is a plain link.
 */
export function DownloadLink({
  href,
  unscanned = false,
  className,
  children,
  ...rest
}: {
  href: string;
  /// Sent by an applicant, and nothing scans: ask before it is opened.
  unscanned?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  target?: string;
  rel?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!unscanned)
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  return (
    <>
      <a
        href={href}
        className={className}
        aria-label={rest["aria-label"]}
        onClick={(e) => {
          e.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </a>
      {asking && (
        <ConfirmDialog
          question={UNSCANNED_QUESTION}
          confirmLabel="Download"
          cancelLabel="Cancel"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            const url = new URL(href, window.location.href);
            url.searchParams.set(UNSCANNED_CONFIRM_PARAM, "1");
            window.location.assign(url.toString());
          }}
        />
      )}
    </>
  );
}
