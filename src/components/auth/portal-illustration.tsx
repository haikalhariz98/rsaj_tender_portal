import { useId } from "react";

/// The supplier landing's artwork: an isometric browser window holding a registration form, a figure pressing
/// submit, and three floating badges (document, building, shield-tick). Original, flat, inline SVG in the
/// product's tokens: no raster, no font, no request.
///
/// Motion is one CSS pass under five seconds (rules under `portal-art-` in globals.css). The attributes below draw
/// the FINISHED picture; the keyframes run from the empty state with `backwards` fill, so reduced motion, a
/// stylesheet that fails to load, or print all show the completed form. Decorative: hidden from assistive tech.
///
/// A group that animates carries no `transform` attribute of its own (a CSS transform would replace it), so each
/// animated group wraps a positioned one.
export function PortalIllustration({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wash = `pa-wash-${id}`;
  const fields = [
    { y: 46, width: 150, delay: "0.5s" },
    { y: 76, width: 170, delay: "0.85s" },
    { y: 106, width: 120, delay: "1.2s" },
    { y: 136, width: 140, delay: "1.55s" },
  ];

  return (
    <svg
      viewBox="0 0 460 400"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        <linearGradient id={wash} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-brand-50)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-brand-100)" }} />
        </linearGradient>
      </defs>

      {/* Backdrop and floor shadow. */}
      <circle cx="235" cy="200" r="178" fill={`url(#${wash})`} />
      <ellipse cx="240" cy="378" rx="160" ry="12" className="fill-brand-100" />

      {/* Connector lines to the floating badges. */}
      <g className="stroke-brand-300" fill="none" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round">
        <path d="M92 112 C110 120 118 128 136 134" />
        <path d="M378 84 C360 100 350 110 332 124" />
        <path d="M392 246 C374 252 356 256 334 258" />
      </g>

      {/* The window. */}
      <g className="portal-art-rise">
        <g transform="translate(130 50) matrix(0.866 0.5 0 1 0 0)">
          {/* Slab edge, drawn behind and offset toward the depth axis. */}
          <rect x="-9" y="-6" width="230" height="190" rx="12" className="fill-brand-300" />
          <rect x="0" y="0" width="230" height="190" rx="12" className="fill-surface stroke-brand-200" strokeWidth="1.5" />
          {/* Title strip. */}
          <path d="M0 12 a12 12 0 0 1 12 -12 h206 a12 12 0 0 1 12 12 v14 h-230 z" className="fill-brand-600" />
          <circle cx="16" cy="13" r="3" className="fill-brand-200" />
          <circle cx="27" cy="13" r="3" className="fill-brand-300" />
          <circle cx="38" cy="13" r="3" className="fill-brand-400" />
          <g className="stroke-white" fill="none" strokeWidth="1.4" strokeLinejoin="round">
            <rect x="196" y="6" width="12" height="14" rx="1" />
            <path d="M200 10h1M203 10h1M200 14h1M203 14h1" strokeLinecap="round" />
          </g>

          {/* Fields: a label stub, then a track that fills. */}
          {fields.map((f, i) => (
            <g key={f.y}>
              <rect x="16" y={f.y - 9} width={i === 3 ? 44 : 56} height="4" rx="2" className="fill-ink-4" />
              <rect x="16" y={f.y} width="198" height="18" rx="6" className="fill-sunken stroke-line-2" strokeWidth="1" />
              <rect
                x="17"
                y={f.y + 1}
                width={f.width}
                height="16"
                rx="5"
                className="portal-art-fill fill-brand-200"
                style={{ animationDelay: f.delay }}
              />
            </g>
          ))}
          {/* A user glyph in the first field, an envelope in the second. */}
          <g className="stroke-brand-700" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="30" cy="55" r="2.4" />
            <path d="M25.5 62c.6-2.6 2.2-3.6 4.5-3.6s3.9 1 4.5 3.6" />
            <rect x="25" y="82" width="11" height="8" rx="1.5" />
            <path d="M25.5 83l5 4 5-4" />
          </g>
          {/* The last field is a password: dots that appear with its fill. */}
          <g className="portal-art-fill fill-brand-700" style={{ animationDelay: "1.55s" }}>
            {[27, 36, 45, 54, 63, 72].map((x) => (
              <circle key={x} cx={x} cy="145" r="2.2" />
            ))}
          </g>

          {/* Submit. */}
          <rect x="16" y="168" width="96" height="22" rx="11" className="portal-art-press fill-brand-600" />
          <path d="M52 179h24M70 175l5 4-5 4" className="stroke-white" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* The figure: flat, no features. */}
      <g>
        <rect x="68" y="318" width="13" height="46" rx="6" className="fill-ink" />
        <rect x="88" y="318" width="13" height="46" rx="6" className="fill-ink-2" />
        <rect x="62" y="354" width="22" height="9" rx="4.5" className="fill-ink" />
        <rect x="87" y="356" width="22" height="9" rx="4.5" className="fill-ink-2" />
        <rect x="62" y="252" width="46" height="74" rx="18" className="fill-brand-500" />
        <circle cx="85" cy="228" r="16" className="fill-brand-200" />
        <path d="M69 226a16 16 0 0 1 32 0c-8 -6 -22 -6 -32 0z" className="fill-ink" />
        <path d="M100 272 L172 256" className="stroke-brand-500" strokeWidth="13" strokeLinecap="round" fill="none" />
        <circle cx="178" cy="254" r="7" className="fill-brand-200" />
        <path d="M66 270 L52 306" className="stroke-brand-500" strokeWidth="12" strokeLinecap="round" fill="none" />
      </g>

      {/* The tick badge, last to arrive. */}
      <g className="portal-art-badge">
        <circle cx="329" cy="150" r="21" className="fill-white" />
        <circle cx="329" cy="150" r="17" className="fill-emerald-500" />
        <path
          d="M320.5 150.5l6 6 11.5-12"
          pathLength={1}
          strokeDasharray="1"
          className="portal-art-tick stroke-white"
          fill="none"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Floating badges. */}
      <g className="portal-art-float">
        <g transform="translate(92 112)">
          <circle r="25" className="fill-surface stroke-brand-200" strokeWidth="1.5" />
          <g className="stroke-brand-700" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-8 -12h10l7 7v15a2 2 0 0 1 -2 2h-15a2 2 0 0 1 -2 -2v-20a2 2 0 0 1 2 -2z" />
            <path d="M2 -12v7h7M-5 2h9M-5 7h9" />
          </g>
        </g>
      </g>
      <g className="portal-art-float-b">
        <g transform="translate(378 84)">
          <circle r="25" className="fill-surface stroke-brand-200" strokeWidth="1.5" />
          <g className="stroke-brand-700" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0 -13l11 4v8c0 7 -5 11 -11 14c-6 -3 -11 -7 -11 -14v-8z" />
            <path d="M-5 0l4 4l7 -8" />
          </g>
        </g>
      </g>
      <g className="portal-art-float">
        <g transform="translate(392 246)">
          <circle r="25" className="fill-surface stroke-brand-200" strokeWidth="1.5" />
          <g className="stroke-brand-700" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="-9" y="-13" width="18" height="26" rx="2" />
            <path d="M-4 -7h2M2 -7h2M-4 -1h2M2 -1h2M-2 13v-6h4v6" />
          </g>
        </g>
      </g>
    </svg>
  );
}
