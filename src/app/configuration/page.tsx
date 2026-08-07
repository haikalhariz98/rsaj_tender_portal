import Link from "next/link";

import { ChevronRight } from "@/components/icons";
import { CONFIG_SECTIONS } from "@/lib/nav";

export default function ConfigurationPage() {
  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Configuration</h1>
            </div>
            <p className="pagehead__sub">
              The rules the portal runs on. A change here takes effect immediately, everywhere.
            </p>
          </div>
        </div>
      </div>

      <div className="stack stack--lg">
        {CONFIG_SECTIONS.map((group) => (
          <section className="section" key={group.group}>
            <div className="section__head">
              <h2 className="h3">{group.group}</h2>
            </div>
            <div className="grid g3">
              {group.items.map((item) =>
                item.built ? (
                  <Link key={item.href} href={item.href} className="stat stat--clickable">
                    <div className="stat__top">
                      <span className="stat__label">{item.label}</span>
                      <span className="stat__ico stat__ico--brand">
                        <ChevronRight size={15} />
                      </span>
                    </div>
                    <p className="sm dim" style={{ marginTop: 10, lineHeight: "18px" }}>
                      {item.description}
                    </p>
                  </Link>
                ) : (
                  <div key={item.href} className="stat" style={{ opacity: 0.62 }}>
                    <div className="stat__top">
                      <span className="stat__label">{item.label}</span>
                      <span className="badge badge--warn">soon</span>
                    </div>
                    <p className="sm dim" style={{ marginTop: 10, lineHeight: "18px" }}>
                      {item.description}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
