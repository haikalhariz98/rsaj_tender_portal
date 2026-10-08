"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { CheckIcon, ChevronDown, SearchIcon } from "@/components/icons";
import {
  CLEAR_LABEL,
  choiceDropped,
  filterOptions,
  joinValues,
  labelOfChoice,
  moveActive,
  planChoices,
  remoteNote,
  remoteSearchUrl,
  resultsAnnouncement,
  toggleValue,
  typeahead,
  wantsSearch,
  type MoveKey,
  type Opt,
  type RemoteStatus,
} from "@/lib/ui/select-logic";

import { Avatar } from "./avatar";
import { NOTCH_LABEL, NOTCH_WRAP, inputClass, type ControlSize } from "./control";
import { cx } from "./cx";
import { fieldAria, useFieldContext } from "./field-context";

/// A choice, written the way a native <option> is: `<option value="x">Label</option>`
/// works unchanged. `data-sub` adds a second line, `data-avatar` a person's initials
/// (people lists only: beside anything else initials read like codes). `Option` is the
/// same thing with an `icon` slot.
export function Option(
  props: {
    value?: string | number;
    disabled?: boolean;
    icon?: ReactNode;
    children?: ReactNode;
    "data-sub"?: string;
    "data-avatar"?: string;
  },
): ReactNode {
  void props; // a marker: Select reads its props and never renders it
  return null;
}

type Item = Opt & { icon?: ReactNode; avatar?: string; clear?: boolean };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

type OptionLike = {
  value?: string | number;
  disabled?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  "data-sub"?: string;
  "data-avatar"?: string;
};

function readOptions(children: ReactNode, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      readOptions((child.props as { children?: ReactNode }).children, out);
      return;
    }
    if (child.type !== "option" && child.type !== Option) return;
    const p = (child as ReactElement<OptionLike>).props;
    const label = textOf(p.children);
    out.push({
      // As in a native option: no value attribute means the text is the value.
      value: p.value !== undefined ? String(p.value) : label,
      label,
      disabled: p.disabled,
      sub: p["data-sub"],
      avatar: p["data-avatar"],
      icon: p.icon,
    });
  });
  return out;
}

type Common = {
  size?: ControlSize;
  /// Draws the notched label itself. Inside a Field, leave it out: the Field draws it.
  label?: ReactNode;
  /// Shown while nothing is chosen and no empty option names the unchosen state.
  placeholder?: string;
  /// Default: a search box when there are more than seven options.
  searchable?: boolean;
  /// `chip` is the compact pill used in toolbars: no notched label, `aria-label` names it.
  variant?: "field" | "chip";
  /// A chip's own words, shown before the chosen value ("Status").
  chipLabel?: string;
  /// Phase 4b: the choices are searched on the server, not held on the page (a registry's thousands of codes). `url` answers `?q=` with `{ options: [{ value, label }], hasMore }`; `minChars`
  /// is how much must be typed first (0: the first page is listed on opening); `token` rides in `x-form-token`; `labels` names the values the page already holds (the draft's chosen codes),
  /// because their options are not among the results. Options and the chosen values read as the labels the server gives ("code — name"); a value with no label is never shown as itself.
  search?: { url: string; minChars?: number; token?: string | null; labels?: Readonly<Record<string, string>> };
  children?: ReactNode;
};

type Attrs = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size" | "multiple" | "value" | "defaultValue" | "onChange" | "children" | "placeholder"
>;

export type SingleSelectProps = Attrs &
  Common & {
    multiple?: false;
    value?: string | number;
    defaultValue?: string | number;
    onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  };

export type MultiSelectProps = Attrs &
  Common & {
    /// Several choices, posted as ONE field of newline-joined values (never N entries
    /// under one name, which a server reading one value would silently cut to the first).
    multiple: true;
    value?: string[];
    defaultValue?: string[];
    onValuesChange?: (values: string[]) => void;
  };

export function Select(props: SingleSelectProps | MultiSelectProps) {
  const {
    size = "md",
    label,
    placeholder,
    searchable,
    variant = "field",
    chipLabel,
    children,
    id: idProp,
    name,
    className,
    disabled,
    required,
    form,
  } = props;
  const multiple = props.multiple === true;
  const chip = variant === "chip";

  const ctx = useFieldContext();
  const base = useId();
  const id = idProp ?? `${base}-t`;
  const listId = `${base}-list`;
  const ownLabelId = label ? `${base}-label` : undefined;
  const optId = (i: number) => `${base}-o${i}`;

  const items = useMemo(() => readOptions(children), [children]);

  // ---- value --------------------------------------------------------------------
  const controlled = props.value !== undefined;
  const [inner, setInner] = useState<string[]>(() => {
    const d = props.value ?? props.defaultValue;
    if (d === undefined) return [];
    return Array.isArray(d) ? d : [String(d)];
  });
  const chosen: string[] = useMemo(
    () => (controlled ? (Array.isArray(props.value) ? props.value : [String(props.value)]) : inner),
    [controlled, props.value, inner],
  );
  const single = chosen[0] ?? "";
  const hasValue = !multiple ? single !== "" : chosen.length > 0;

  // An uncontrolled choice whose option the caller has just taken away (a budget code once the
  // account changes) is cleared, not shown as its raw value. Only a value that was offered and then
  // dropped: a saved value with no option from the start keeps showing as it always did.
  const offered = useRef(items);
  useEffect(() => {
    const before = offered.current;
    offered.current = items;
    if (!controlled && !multiple && choiceDropped(before, items, single)) setInner([""]);
  }, [items, controlled, multiple, single]);

  // The empty option is a placeholder (required field, or a generic prompt such as
  // "Choose") or a real choice ("None", "Not set"); the rule lives in select-logic.
  const isRequired = !!(required || ctx.required);
  const plan = useMemo(
    () => planChoices(items, { required: isRequired, multiple, hasValue }),
    [items, isRequired, multiple, hasValue],
  );
  const clearRow = useMemo<Item | null>(() => (plan.clear ? { value: "", label: CLEAR_LABEL, clear: true } : null), [plan.clear]);

  const nativeRef = useRef<HTMLSelectElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  // ---- open state ---------------------------------------------------------------
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const typed = useRef({ text: "", at: 0 });

  // ---- searching on the server (Phase 4b) ---------------------------------------
  const searchUrl = props.search?.url;
  const searchMin = props.search?.minChars ?? 0;
  const searchToken = props.search?.token ?? null;
  const searchLabels = props.search?.labels;
  // The rows the server last answered, and the query they answer. A query the answer is not for is one still being searched (derived, never stored).
  const [remote, setRemote] = useState<{ rows: Item[]; more: boolean; failed: boolean; query: string | null }>({ rows: [], more: false, failed: false, query: null });
  const typedQuery = query.trim();
  const remoteStatus: RemoteStatus = !searchUrl || typedQuery.length < searchMin ? "idle" : remote.query !== typedQuery ? "loading" : remote.failed ? "error" : "ready";
  const [known, setKnown] = useState<Record<string, string>>({});

  const searchOn = searchUrl ? true : wantsSearch(items, searchable);
  // The rows for a query. "Clear selection" heads the list, and is not searched through. Searched on the server, the rows are what the server returned for the query.
  const rowsFor = useCallback(
    (q: string): Item[] => {
      if (searchUrl) return q.trim().length < searchMin ? [] : remote.rows;
      const found = searchOn ? filterOptions(plan.rows, q) : plan.rows;
      return clearRow && !q.trim() ? [clearRow, ...found] : found;
    },
    [plan.rows, clearRow, searchOn, searchUrl, searchMin, remote.rows],
  );
  const shown = useMemo(() => rowsFor(query), [rowsFor, query]);

  useEffect(() => {
    if (!searchUrl || !open) return;
    const q = query.trim();
    if (q.length < searchMin) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(remoteSearchUrl(searchUrl, q), { signal: ctl.signal, credentials: "same-origin", headers: searchToken ? { "x-form-token": searchToken } : undefined });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { options?: { value: string; label: string }[]; hasMore?: boolean };
        const rows = (body.options ?? []).map((o) => ({ value: String(o.value), label: String(o.label) }));
        setKnown((k) => ({ ...k, ...Object.fromEntries(rows.map((o) => [o.value, o.label])) }));
        setRemote({ rows, more: body.hasMore === true, failed: false, query: q });
        setActive(rows.length ? 0 : -1);
      } catch {
        if (!ctl.signal.aborted) setRemote({ rows: [], more: false, failed: true, query: q });
      }
    }, q ? 250 : 0);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [searchUrl, searchMin, searchToken, open, query]);

  const coarse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  const openList = useCallback(
    (initialQuery = "", from?: MoveKey) => {
      if (disabled) return;
      const list = rowsFor(initialQuery);
      const selected = list.findIndex((o) => chosen.includes(o.value) && !o.disabled);
      touched.current = false;
      setQuery(initialQuery);
      let at = selected >= 0 ? selected : moveActive(list, -1, "ArrowDown");
      if (from === "ArrowUp" && selected < 0) at = moveActive(list, -1, "ArrowUp");
      if (from === "End") at = moveActive(list, -1, "End");
      if (from === "Home") at = moveActive(list, -1, "Home");
      if (from) touched.current = true;
      setActive(at);
      setOpen(true);
    },
    [disabled, rowsFor, chosen],
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) trigger.current?.focus();
  }, []);

  // ---- committing a choice ------------------------------------------------------
  function commitSingle(value: string) {
    const el = nativeRef.current;
    if (!el) return;
    // The hidden native select is what a form reads and what listeners hear, so the
    // value goes through it as a real change event: onChange(e => e.target.value) and a
    // form-level onChange (RecordEditor's showWhen) both fire as they did for a native one.
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function commitMulti(next: string[]) {
    if (!controlled) setInner(next);
    if (props.multiple) props.onValuesChange?.(next);
  }

  function choose(o: Item | undefined) {
    if (!o || o.disabled) return;
    if (multiple) {
      commitMulti(toggleValue(chosen, o.value));
      return;
    }
    commitSingle(o.value);
    close(true);
  }

  // ---- placing the list ---------------------------------------------------------
  const place = useCallback(() => {
    const t = trigger.current;
    const p = pop.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, chip ? 208 : 256), vw - 32);
    p.style.width = `${width}px`;
    p.style.left = `${Math.min(Math.max(16, r.left), vw - 16 - width)}px`;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const natural = p.offsetHeight;
    if (natural > below && above > below) {
      p.style.top = "auto";
      p.style.bottom = `${vh - r.top + 6}px`;
    } else {
      p.style.bottom = "auto";
      p.style.top = `${r.bottom + 6}px`;
    }
  }, [chip]);

  useLayoutEffect(() => {
    if (!open) return;
    const p = pop.current;
    try {
      p?.showPopover?.();
    } catch {
      /* already showing */
    }
    place();
    if (searchOn && !coarse()) searchRef.current?.focus({ preventScroll: true });
  }, [open, place, searchOn]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const outside = (e: PointerEvent) => {
      const n = e.target as Node;
      if (pop.current?.contains(n) || trigger.current?.contains(n)) return;
      close(false);
    };
    // Escape belongs to the open list alone. A drawer or dialog listens on the document,
    // and Next hydrates on the document too, so a React handler cannot get in front of
    // it; a capture listener on the window runs before every one of them.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close(true);
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, place, close]);

  // Keep the active row in view as the arrow keys move it.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optId is stable per mount
  }, [open, active]);

  // ---- keyboard -----------------------------------------------------------------
  function moveTo(key: MoveKey) {
    touched.current = true;
    setActive((a) => moveActive(shown, a, key));
  }

  function onKeyDown(e: ReactKeyboardEvent, inSearch: boolean) {
    const k = e.key;
    const mods = e.ctrlKey || e.metaKey;
    if (!open) {
      if (disabled) return;
      if (k === "ArrowDown" || k === "ArrowUp" || (!inSearch && (k === "Home" || k === "End"))) {
        e.preventDefault();
        openList("", k as MoveKey);
      } else if (k === "Enter" || k === " ") {
        e.preventDefault();
        openList();
      } else if (k.length === 1 && !mods && !e.altKey) {
        if (searchOn) {
          e.preventDefault();
          openList(k);
        } else if (!multiple) {
          // Closed and typing: jump to the match, as a native select does.
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at < 700 ? t.text + k : k;
          t.at = now;
          const at = typeahead(plan.rows, t.text, plan.rows.findIndex((o) => o.value === single));
          if (at >= 0) commitSingle(plan.rows[at].value);
        } else {
          openList();
        }
      }
      return;
    }
    switch (k) {
      case "ArrowDown":
      case "ArrowUp":
      case "PageDown":
      case "PageUp":
        e.preventDefault();
        moveTo(k);
        return;
      case "Home":
      case "End":
        if (inSearch) return; // moves the caret in the search box
        e.preventDefault();
        moveTo(k);
        return;
      case "Enter":
        e.preventDefault();
        if (active >= 0) choose(shown[active]);
        else close(true);
        return;
      case " ":
        if (inSearch) return; // a space belongs to the query
        e.preventDefault();
        if (active >= 0) choose(shown[active]);
        return;
      case "Escape":
        // Not the drawer's: Escape closes the list first, the form on the next press.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      case "Tab":
        if (touched.current && active >= 0 && !multiple) choose(shown[active]);
        else setOpen(false);
        setQuery("");
        trigger.current?.focus();
        return;
      default:
        if (!inSearch && k.length === 1 && !mods && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at < 700 ? t.text + k : k;
          t.at = now;
          const at = typeahead(shown, t.text, active);
          if (at >= 0) {
            touched.current = true;
            setActive(at);
          }
        }
    }
  }

  // ---- what the trigger shows ---------------------------------------------------
  const selectedItems = chosen.map((v) => items.find((o) => o.value === v) ?? { value: v, label: searchUrl ? labelOfChoice(v, searchLabels, known) : v });
  const emptyOption = items.find((o) => o.value === "");
  const placeholderText = plan.role === "placeholder";
  const aria = fieldAria(ctx, props);
  const labelledBy = aria["aria-labelledby"] ?? ownLabelId;
  const invalid = aria["aria-invalid"];
  const listHeight = "max-h-[min(18rem,50dvh)]";

  const first = selectedItems[0];
  let display: ReactNode;
  if (multiple) {
    display =
      selectedItems.length === 0 ? (
        <span className="truncate text-ink-4">{placeholder ?? "Select…"}</span>
      ) : (
        <span className="flex min-w-0 flex-wrap gap-1">
          {selectedItems.map((o) => (
            <span key={o.value} className="max-w-full truncate rounded-full bg-brand-50 px-2.5 py-0.5 text-[12.5px] font-medium text-brand-800">
              {o.label}
            </span>
          ))}
        </span>
      );
  } else if (first && first.value !== "") {
    const it = first as Item;
    display = (
      <>
        {it.avatar ? <Avatar name={it.avatar} size="xs" /> : (it as Item).icon}
        <span className={cx("min-w-0 truncate", chip && "font-semibold")} title={it.label}>
          {it.label}
        </span>
      </>
    );
  } else {
    display = (
      <span className={cx("truncate", emptyOption?.label && !placeholderText ? "text-ink-3" : "text-ink-4")}>
        {emptyOption?.label || placeholder || "Select an option"}
      </span>
    );
  }

  const triggerEl = (
    <button
      ref={trigger}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && !searchOn && active >= 0 ? optId(active) : undefined}
      aria-labelledby={labelledBy}
      aria-label={props["aria-label"]}
      aria-describedby={aria["aria-describedby"]}
      aria-invalid={invalid}
      aria-required={isRequired || undefined}
      disabled={disabled}
      title={props.title}
      onClick={() => {
        // Enter and Space are handled in onKeyDown; this is the pointer and touch path.
        if (open) close(false);
        else openList();
      }}
      onKeyDown={(e) => onKeyDown(e, false)}
      onKeyUp={(e) => {
        // A button clicks on Space's key-up; the key-down already did the work.
        if (e.key === " ") e.preventDefault();
      }}
      className={
        chip
          ? cx(
              "inline-flex h-9 w-auto max-w-full items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3.5 text-[13px] font-medium text-ink transition outline-none",
              "hover:border-ink-4 focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/15 aria-expanded:border-brand-500",
              hasValue && chipLabel && "border-brand-300 bg-brand-50 text-brand-800",
              "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
            )
          : inputClass(
              size,
              cx(
                "flex cursor-pointer items-center gap-2 text-left",
                multiple && "h-auto min-h-10 py-1.5",
                "aria-expanded:border-brand-500 aria-expanded:ring-4 aria-expanded:ring-brand-500/15",
              ),
            )
      }
    >
      {chip && chipLabel && <span>{chipLabel}</span>}
      {chip && !chipLabel && !hasValue ? (
        <span className="truncate">{emptyOption?.label ?? placeholder ?? "Select"}</span>
      ) : (
        (!chip || hasValue) && <span className={cx("flex min-w-0 items-center gap-2", chip ? "max-w-40" : "flex-1")}>{display}</span>
      )}
      <ChevronDown
        size={size === "sm" || chip ? 14 : 16}
        className={cx("ml-auto shrink-0 text-ink-3 transition-transform", open && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );

  const popover = open && (
    <div
      ref={pop}
      popover="manual"
      style={{ position: "fixed", inset: "auto", margin: 0 }}
      className="z-50 rounded-2xl border border-line bg-surface p-1.5 text-left font-normal whitespace-normal text-ink shadow-pop"
      onKeyDown={(e) => {
        // The search box and the rows share one handler; the box reports itself.
        if (e.target === searchRef.current) onKeyDown(e, true);
      }}
    >
      {searchOn && (
        <div className="relative px-0.5 pb-1.5">
          <SearchIcon size={15} className="pointer-events-none absolute top-[calc(50%-3px)] left-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search"
            value={query}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
              touched.current = false;
              setActive(moveActive(rowsFor(q), -1, "ArrowDown"));
            }}
            className="h-9 w-full rounded-xl bg-sunken pr-3 pl-9 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-labelledby={labelledBy}
        aria-label={props["aria-label"]}
        className={cx(listHeight, "overflow-y-auto overscroll-contain [scrollbar-color:var(--color-line-2)_transparent] [scrollbar-width:thin]")}
      >
        {shown.map((o, i) => {
          const on = chosen.includes(o.value);
          return (
            <li
              key={o.clear ? "clear" : o.value}
              id={optId(i)}
              role="option"
              aria-selected={on}
              aria-disabled={o.disabled || undefined}
              data-active={i === active || undefined}
              // Keep focus where it is: a pointer-down on a row must not blur the search box.
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => i !== active && !o.disabled && setActive(i)}
              onClick={() => choose(o)}
              className={cx(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] pointer-coarse:min-h-11",
                o.disabled ? "cursor-not-allowed text-ink-3" : "cursor-pointer",
                i === active && !o.disabled && "bg-sunken",
                on ? "font-semibold text-brand-800" : !o.disabled && (o.clear ? "text-ink-3" : "text-ink"),
              )}
            >
              {o.avatar ? <Avatar name={o.avatar} size="xs" /> : o.icon}
              <span className="min-w-0 flex-1">
                <span className={cx("block break-words", (o.clear || (o.value === "" && !on)) && "text-ink-3")}>{o.label}</span>
                {o.sub && <span className="block text-[12px] font-normal break-words text-ink-3">{o.sub}</span>}
              </span>
              {on && <CheckIcon size={15} className="shrink-0 text-brand-700" aria-hidden="true" />}
            </li>
          );
        })}
        {searchUrl ? (
          (() => {
            const note = remoteNote({ status: remoteStatus, count: shown.length, more: remote.more, minChars: searchMin, query });
            return note ? (
              <li role="presentation" className="px-3 py-2 text-[13px] text-ink-3">
                {note}
              </li>
            ) : null;
          })()
        ) : (
          shown.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-[13px] text-ink-3">
              {plan.rows.length === 0 ? "Nothing to choose yet" : `No matches for “${query.trim()}”`}
            </li>
          )
        )}
      </ul>
      <div aria-live="polite" className="sr-only">
        {searchUrl ? (remoteStatus === "loading" ? "Searching" : remoteStatus === "error" ? "The list could not be loaded" : resultsAnnouncement(shown.length)) : resultsAnnouncement(shown.length)}
      </div>
    </div>
  );

  return (
    <div className={cx(NOTCH_WRAP, chip ? "inline-block" : "block w-full", className)}>
      {label && (
        <label id={ownLabelId} htmlFor={id} className={NOTCH_LABEL}>
          {label}
          {required && (
            <span className="ml-0.5 text-rose-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {triggerEl}
      {popover}
      {multiple ? (
        name && <input ref={hiddenRef} type="hidden" name={name} value={joinValues(chosen)} form={form} disabled={disabled} />
      ) : (
        <select
          ref={nativeRef}
          name={name}
          form={form}
          value={single}
          required={required}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            if (!controlled) setInner([e.target.value]);
            (props as SingleSelectProps).onChange?.(e);
          }}
        >
          {items.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
