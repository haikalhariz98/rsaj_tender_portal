"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BellIcon,
  ChevronRight,
  HelpCircle,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import { ButtonLink, iconButtonClass } from "@/components/ui/button";
import { useSay } from "@/components/i18n/language-context";
import { w, type Words } from "@/lib/contract/labels";
import { CRUMB_WORDS, NESTED_LABEL, RECORD_LABEL, SEGMENT_LABEL, SHELL_WORDS } from "@/lib/i18n/catalogues/shell";
import { workspaceFor } from "@/lib/nav";
import type { ShellUser } from "@/lib/shell";

import { LanguageSwitch } from "./language-switch";
import { useRecordCrumb, useRecordParentCrumb } from "./record-crumb";
import { UserMenu } from "./user-menu";

export interface Crumb {
  label: Words;
  href: string;
}

/// A record's name is data: the same in both languages, and never marked as untranslated.
const named = (name: string): Words => w(name, name);

/**
 * The breadcrumb's crumbs for a path, given the names the page gave its record (and the record it sits
 * under). Pure, so a test can hold every crumb to a page that exists. Labels are `Words` (NFR-LNG-001, ADR 0040), rendered through `say`.
 */
export function crumbTrail(segments: readonly string[], recordName: string | null, parentName: string | null): Crumb[] {
  // A printable document sits under its record: "Awards › AW/1 › Print", the document's
  // own slug left off (the page names it).
  const printAt = segments.indexOf("print");
  const crumbs: Crumb[] = segments.slice(0, printAt > 0 ? printAt + 1 : segments.length).map((segment, i) => ({
    // An unmapped segment is a record's key — a committee's code, say. Codes never
    // reach a screen; the page's own header names the record, so the crumb says what
    // kind of record it is.
    // "committees" at the top is the running of sittings; under Configuration it is
    // the setup of the bodies. Same word, two screens.
    label:
      segments[0] === "committees"
        ? i === 0
          ? CRUMB_WORDS.committeeSittings
          : CRUMB_WORDS.sitting
        : (NESTED_LABEL[`${segments[i - 1] ?? ""}/${segment}`] ??
          (segment === "edit" ? CRUMB_WORDS.edit : undefined) ??
          SEGMENT_LABEL[segment] ??
          RECORD_LABEL[segments[i - 1] ?? ""] ??
          CRUMB_WORDS.details),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));
  // The last crumb names the record where the page has said which one it is.
  const last = crumbs[crumbs.length - 1];
  const lastSegment = segments[segments.length - 1];
  if (recordName && last && printAt < 0 && !SEGMENT_LABEL[lastSegment] && lastSegment !== "edit" && lastSegment !== "new") last.label = named(recordName);
  // A record's own crumb, where the page names it and a sub-page sits under it.
  if (recordName && lastSegment === "edit" && crumbs.length >= 2) crumbs[crumbs.length - 2].label = named(recordName);
  // A page under a record (an exercise's Appendix) names the record, not "Details": the crumb before a
  // known section word is the record's key.
  if (recordName && printAt < 0 && lastSegment !== "edit" && SEGMENT_LABEL[lastSegment] && crumbs.length >= 3) {
    const keyAt = crumbs.length - 2;
    if (!SEGMENT_LABEL[segments[keyAt]]) crumbs[keyAt].label = named(recordName);
  }
  if (recordName && printAt > 0) {
    // The record's key is the crumb that names it; a section between it and the print ("Documents") keeps its own word.
    const keyAt = segments.findIndex((sg, i) => i > 0 && !SEGMENT_LABEL[sg]);
    crumbs[keyAt > 0 && keyAt < printAt ? keyAt : printAt - 1].label = named(recordName);
    crumbs[printAt].label = CRUMB_WORDS.print;
  }
  // The print crumb is the page itself (the document's own slug left off): it links to the page, never to a bare …/print.
  if (printAt > 0) crumbs[printAt].href = "/" + segments.join("/");
  // AC-17, AC-23: Awards is no section any more; a printed award document sits under the Contracts list.
  if (segments[0] === "awards") {
    crumbs[0].label = CRUMB_WORDS.contracts;
    crumbs[0].href = "/projects";
  }

  // An exercise's documents are the Tender documents tab, not the register of documents: named so, and linked to the tab (no page of its own sits at that path).
  if (segments[0] === "sourcing") {
    segments.forEach((sg, i) => {
      if (sg === "documents" && i >= 2) {
        crumbs[i].label = CRUMB_WORDS.tenderDocuments;
        crumbs[i].href = `/sourcing/${segments[1]}?tab=documents`;
      }
    });
  }

  // A page under an exercise names the exercise (its reference, from the page) at the exercise's crumb, never at its
  // own; a section with no page of its own is the exercise's tab that holds it.
  if (segments[0] === "sourcing" && segments.length >= 3 && segments[1] !== "new") {
    const id = segments[1];
    crumbs[1].label = recordName ? named(recordName) : CRUMB_WORDS.exercise;
    const SECTION: Record<string, [Words, string]> = {
      evaluation: [CRUMB_WORDS.evaluation, "?tab=evaluation&section=report"],
      label: [CRUMB_WORDS.sales, "?tab=bids&section=sales"],
      opening: [CRUMB_WORDS.bidOpening, "?tab=bids&section=schedule"],
    };
    const section = SECTION[segments[2]];
    if (section) crumbs[2] = { label: section[0], href: `/sourcing/${id}${section[1]}` };
    const last = crumbs.length - 1;
    if (last >= 3) crumbs[last].label = segments[2] === "label" ? CRUMB_WORDS.saleLabel : printAt > 0 ? CRUMB_WORDS.print : (NESTED_LABEL[`${segments[last - 1]}/${segments[last]}`] ?? SEGMENT_LABEL[segments[last]] ?? crumbs[last].label);
    if (last === 2 && recordName && crumbs[2].label.en === recordName) crumbs[2].label = SEGMENT_LABEL[segments[2]] ?? (segments[2] === "edit" ? CRUMB_WORDS.edit : crumbs[2].label);
  }

  // A certificate sits on its contract's Documents tab: "Projects › <contract> › Documents › <certificate>"; no page
  // of its own sits at …/certificates, so that crumb is the tab.
  if (segments[0] === "projects" && segments[2] === "certificates" && crumbs.length >= 3) {
    if (parentName) crumbs[1].label = named(parentName);
    crumbs[2].label = CRUMB_WORDS.documents;
    crumbs[2].href = `/projects/${segments[1]}?tab=documents`;
  }
  // 6.13 Part A step 4: a variation sits on its contract's Variations tab: "Projects › <contract> › Variations › <variation>".
  if (segments[0] === "projects" && segments[2] === "variations" && crumbs.length >= 3) {
    if (parentName) crumbs[1].label = named(parentName);
    crumbs[2].label = CRUMB_WORDS.variations;
    crumbs[2].href = `/projects/${segments[1]}?tab=variations`;
  }

  return crumbs;
}

export function Topbar({
  organisation,
  user,
  hasAlerts,
  onMenu,
  signOut,
  signInHref = "/sign-in",
}: {
  organisation: string;
  /// Null until authentication exists. Rendered as "not signed in", never as a person.
  user: ShellUser | null;
  /// Whether anything is waiting. The bell's dot claims there is; it must not lie.
  hasAlerts: boolean;
  onMenu: () => void;
  /// The sign-out action, from the layout.
  signOut: (data: FormData) => Promise<void>;
  /// Where "Sign in" leads when nobody is signed in: the staff's page, or on the public copy the supplier portal's own (Phase 4a).
  signInHref?: string;
}) {
  const pathname = usePathname();
  const say = useSay();
  const workspace = workspaceFor(pathname);

  const segments = pathname.split("/").filter(Boolean);
  const recordName = useRecordCrumb();
  const parentName = useRecordParentCrumb();
  const crumbs = crumbTrail(segments, recordName, parentName);

  // The organisation's name is data, the same in both languages.
  const rootLabel: Words = workspace === "supplier" ? SHELL_WORDS.supplierPortal : named(organisation);
  const rootHref = workspace === "supplier" ? "/supplier" : "/";
  const trail = workspace === "supplier" ? crumbs.slice(1) : crumbs;
  const all = [
    { label: rootLabel, href: rootHref },
    ...(trail.length === 0
      ? [{ label: workspace === "supplier" ? SHELL_WORDS.home : SHELL_WORDS.dashboard, href: pathname }]
      : trail),
  ];

  return (
    <header className="sticky top-0 z-20 flex print:hidden h-16 items-center gap-2 border-b border-line/60 bg-canvas/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label={say(SHELL_WORDS.openNavigation)}
        className={iconButtonClass("md", false, "-ml-2 lg:hidden")}
      >
        <MenuIcon size={20} />
      </button>

      <nav aria-label={say(SHELL_WORDS.breadcrumb)} className="flex min-w-0 shrink items-center gap-1.5 text-[13.5px]">
        {all.map((crumb, i) => {
          const last = i === all.length - 1;
          return (
            <span
              key={crumb.href + i}
              // The organisation's crumb gives way below 2xl, so the record and its section keep their width beside the search box.
              className={i === 0 && workspace !== "supplier" && all.length > 2 ? "hidden min-w-0 items-center gap-1.5 2xl:flex" : i < all.length - 1 ? "hidden shrink-0 items-center gap-1.5 whitespace-nowrap sm:flex" : "flex min-w-0 items-center gap-1.5"}
            >
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-ink">
                  {say(crumb.label)}
                </span>
              ) : (
                <>
                  <Link
                    href={crumb.href}
                    className="truncate text-ink-3 no-underline hover:text-ink hover:no-underline"
                  >
                    {say(crumb.label)}
                  </Link>
                  <ChevronRight size={14} className="shrink-0 text-ink-4" />
                </>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        disabled
        aria-label={say(SHELL_WORDS.search)}
        title={say(SHELL_WORDS.searchNotBuilt)}
        className="hidden h-10 w-56 shrink-0 2xl:w-64 cursor-not-allowed items-center gap-2.5 overflow-hidden rounded-full border border-line bg-surface px-4 text-[13.5px] text-ink-4 md:flex"
      >
        <SearchIcon size={16} />
        <span className="flex-1 truncate text-left">{say(SHELL_WORDS.search)}</span>
      </button>

      {workspace === "supplier" ? (
        <button type="button" disabled aria-label={say(SHELL_WORDS.notifications)} title={say(SHELL_WORDS.supplierNoticesNotBuilt)} className={iconButtonClass()}>
          <BellIcon size={19} />
        </button>
      ) : (
        <Link href="/inbox" aria-label={say(hasAlerts ? SHELL_WORDS.inboxUnread : SHELL_WORDS.inbox)} title={say(hasAlerts ? SHELL_WORDS.unreadNotices : SHELL_WORDS.yourInbox)} className={iconButtonClass()}>
          <BellIcon size={19} />
          {hasAlerts && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-canvas" />}
        </Link>
      )}
      <button
        type="button"
        disabled
        aria-label={say(SHELL_WORDS.help)}
        title={say(SHELL_WORDS.helpNotBuilt)}
        className={iconButtonClass("md", false, "hidden sm:inline-flex")}
      >
        <HelpCircle size={19} />
      </button>
      {/* Where a person may choose, the switch; it replaces the fixed "EN" mark that named a language nobody could change. */}
      <LanguageSwitch />

      <span className="mx-1.5 hidden h-6 w-px bg-line-2 sm:block" />

      {/* Who is signed in, from the session. Nobody signed in is said as such, with the way in: no avatar and no name is shown that is not a person's. */}
      {user ? (
        <UserMenu user={user} signOut={signOut} />
      ) : (
        <ButtonLink href={signInHref} variant="secondary" size="sm" icon={<UserIcon size={15} />}>
          {say(SHELL_WORDS.signIn)}
        </ButtonLink>
      )}
    </header>
  );
}
