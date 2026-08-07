import Link from "next/link";

/**
 * A module that is agreed but not yet built.
 *
 * It appears in the navigation because the shape of the portal is settled and hiding
 * it would misrepresent the plan. It says plainly that it is not here yet, because a
 * screen that looks finished and does nothing is worse than an empty one.
 */
export function NotBuilt({
  title,
  summary,
  willInclude,
}: {
  title: string;
  summary: string;
  willInclude: string[];
}) {
  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">{title}</h1>
              <span className="badge badge--warn">Not built yet</span>
            </div>
            <p className="pagehead__sub">{summary}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="empty">
            <div className="empty__t">This module has not been built</div>
            <p className="empty__d">
              It is in the plan and it is in the navigation, so the shape of the portal is
              visible. Nothing here is working yet.
            </p>
            <div className="empty__a">
              <Link href="/" className="btn btn--sm">
                Back to the dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="section__head">
          <h2 className="h3">What it will hold</h2>
        </div>
        <div className="card">
          <div className="card__body">
            <ul className="stack stack--sm">
              {willInclude.map((line) => (
                <li key={line} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="dot" style={{ marginTop: 7 }} />
                  <span className="sm muted">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
