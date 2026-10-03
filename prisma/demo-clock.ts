/**
 * The demo's clock (6.13 Part A step 5; split from demo-acts.ts in run 3 residual C4 so it is tested on its own). While
 * `onDemoClock` runs, `new Date()` and `Date.now()` answer the demo's instant; outside it Date is the real one. Any date
 * is still a Date (`instanceof`), whichever constructor made it. Re-entrant: a nested call answers its own instant and
 * gives the outer one back on return, and the real clock is restored only when the outermost call ends (also when it
 * throws). No side effect on import.
 */

export const RealDate = Date;
let fixed: number | null = null;
let depth = 0;

class DemoDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0 && fixed != null) super(fixed);
    else super(...(args as []));
  }
  static now() {
    return fixed ?? RealDate.now();
  }
  /// Any date is a Date, whichever constructor made it (a row read before the act, a driver's own).
  static [Symbol.hasInstance](x: unknown) {
    return x instanceof RealDate;
  }
}

/// A local time in Kuala Lumpur ("2026-06-09T10:00", UTC+8, no daylight saving) as the instant.
export const kl = (local: string) => new RealDate(RealDate.parse(`${local}:00.000+08:00`));

/// The instant the demo's clock answers now, or null outside it (a row's clock-stamped columns take it).
export const demoInstant = (): number | null => fixed;

/// Run `fn` with the clock answering `when` (Kuala Lumpur local time).
export async function onDemoClock<T>(when: string, fn: () => Promise<T>): Promise<T> {
  const outer = fixed;
  fixed = kl(when).getTime();
  if (depth++ === 0) globalThis.Date = DemoDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    fixed = outer;
    if (--depth === 0) globalThis.Date = RealDate;
  }
}
