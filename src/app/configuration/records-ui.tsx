import { AlertTriangle } from "@/components/icons";

export function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string | number | null;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {warn && (
          <span className="stat__ico stat__ico--warn">
            <AlertTriangle size={15} />
          </span>
        )}
      </div>
      <div className="stat__value">{value ?? <span className="dim">Not set</span>}</div>
      <div className="stat__foot">
        <span className="stat__hint">{hint}</span>
      </div>
    </div>
  );
}

export function Section({
  title,
  blurb,
  empty,
  count,
  action,
  children,
}: {
  title: string;
  blurb: string;
  empty: string;
  count: number;
  /// Present even on an empty section: that is where the first entry gets added.
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section" style={{ marginBottom: 24 }}>
      <div className="section__head">
        <h2 className="h3">{title}</h2>
        {count > 0 && <span className="badge badge--outline">{count}</span>}
        <div className="spacer" />
        {action}
      </div>
      <p className="sm muted" style={{ margin: "0 0 12px" }}>
        {blurb}
      </p>
      {count === 0 ? (
        <div className="card">
          <div className="card__body">
            <div className="empty">
              <div className="empty__t">Not set</div>
              <p className="empty__d">{empty}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dl">
          <div className="tablewrap">{children}</div>
        </div>
      )}
    </section>
  );
}

const PROVENANCE_LABEL: Record<string, string> = {
  STATED: "Stated",
  OBSERVED: "Observed",
  ASSUMED: "Assumed",
};

const PROVENANCE_CHIP: Record<string, string> = {
  STATED: "chip--ok",
  OBSERVED: "chip--info",
  ASSUMED: "chip--warn",
};

export function ProvenanceChip({ value }: { value: string }) {
  return (
    <span className={`chip ${PROVENANCE_CHIP[value] ?? ""}`}>
      {PROVENANCE_LABEL[value] ?? value}
    </span>
  );
}
