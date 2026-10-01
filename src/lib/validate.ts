/**
 * Form validation, as pure functions.
 *
 * Route handlers and components never restate a rule. A form posts a `FormData`, this
 * turns it into either a typed record or a map of field errors, and the server action
 * is left with nothing to decide.
 *
 * Nothing here supplies a default value. A pre-filled threshold or a pre-selected
 * method is a customer's policy choice shipped as software, which is the one thing
 * this product must not do — so a missing required field is an error, never a guess.
 */

import { fitsMoneyColumn, parseSen } from "@/lib/money";

export type FieldErrors = Record<string, string>;

export interface Valid<T> {
  ok: true;
  value: T;
}
export interface Invalid {
  ok: false;
  errors: FieldErrors;
}
export type Parsed<T> = Valid<T> | Invalid;

/// Collects field errors while reading a form, so one submission reports every fault
/// rather than the first.
export class FormReader {
  readonly errors: FieldErrors = {};

  constructor(private readonly data: FormData) {}

  private raw(name: string): string {
    const v = this.data.get(name);
    return typeof v === "string" ? v.trim() : "";
  }

  text(name: string, label: string, opts: { required?: boolean; max?: number } = {}): string {
    const v = this.raw(name);
    if (!v) {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return "";
    }
    if (opts.max && v.length > opts.max) {
      this.errors[name] = `${label} must be ${opts.max} characters or fewer.`;
    }
    return v;
  }

  /// A code is a configuration key. Kept to a conservative character set so it can be
  /// used in a URL and matched against a rule without escaping.
  code(name: string, label: string, opts: { taken?: readonly string[] } = {}): string {
    const v = this.text(name, label, { required: true, max: 60 });
    if (!v) return "";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(v)) {
      this.errors[name] = `${label} may use letters, numbers, hyphen and underscore only.`;
      return v;
    }
    if (opts.taken?.some((t) => t.toLowerCase() === v.toLowerCase())) {
      this.errors[name] = `${label} is already in use.`;
    }
    return v;
  }

  optionalText(name: string): string | null {
    return this.raw(name) || null;
  }

  bool(name: string): boolean {
    // An unchecked checkbox posts nothing at all.
    return this.data.get(name) != null;
  }

  int(name: string, label: string, opts: { required?: boolean; min?: number } = {}): number | null {
    const v = this.raw(name);
    if (!v) {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return null;
    }
    const n = Number(v);
    if (!Number.isInteger(n)) {
      this.errors[name] = `${label} must be a whole number.`;
      return null;
    }
    if (opts.min != null && n < opts.min) {
      this.errors[name] = `${label} cannot be below ${opts.min}.`;
      return null;
    }
    return n;
  }

  /// Money is read as a string and handed to Prisma as a Decimal at the boundary.
  /// Parsing to a float here would lose the last sen on a large contract.
  money(name: string, label: string, opts: { required?: boolean } = {}): string | null {
    const v = this.raw(name).replace(/,/g, "");
    if (!v) {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return null;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(v)) {
      this.errors[name] = `${label} must be an amount, to at most two decimal places.`;
      return null;
    }
    // Every money column is Decimal(18, 2): a larger amount is refused here, by name, rather
    // than failing the save as a numeric overflow.
    if (!fitsMoneyColumn(parseSen(v))) {
      this.errors[name] = `${label} is too large to record: at most 16 digits before the decimal point.`;
      return null;
    }
    return v;
  }

  date(name: string, label: string, opts: { required?: boolean } = {}): Date | null {
    const v = this.raw(name);
    if (!v) {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return null;
    }
    const d = new Date(v + "T00:00:00.000Z");
    if (Number.isNaN(d.getTime())) {
      this.errors[name] = `${label} is not a date.`;
      return null;
    }
    return d;
  }

  choice<T extends string>(
    name: string,
    label: string,
    allowed: readonly T[],
    opts: { required?: boolean } = {},
  ): T | null {
    const v = this.raw(name);
    if (!v) {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return null;
    }
    if (!(allowed as readonly string[]).includes(v)) {
      this.errors[name] = `${label} is not one of the available options.`;
      return null;
    }
    return v as T;
  }

  /// Record a fault that spans more than one field.
  reject(name: string, message: string): void {
    this.errors[name] = message;
  }

  get failed(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  finish<T>(value: T): Parsed<T> {
    return this.failed ? { ok: false, errors: this.errors } : { ok: true, value };
  }
}

/// An end date must not precede the start. Effective dating is everywhere in this
/// product, so the check lives once.
export function checkPeriod(
  reader: FormReader,
  from: Date | null,
  to: Date | null,
  field = "effectiveTo",
): void {
  if (from && to && to <= from) {
    reader.reject(field, "The end date must fall after the start date.");
  }
}
