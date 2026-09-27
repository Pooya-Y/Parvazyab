/**
 * The stylesheet of the server-rendered pages, inlined into each one (it is
 * small, and one request less matters to crawlers and first visits). The colour
 * tokens are the web client's (client/src/index.css); styles.test.ts fails when
 * the two drift apart.
 */
export const LIGHT_TOKENS: Record<string, string> = {
  background: "oklch(0.985 0.003 25)",
  foreground: "oklch(0.2 0.02 25)",
  card: "oklch(1 0 0)",
  primary: "oklch(0.55 0.22 25)",
  "primary-foreground": "oklch(0.985 0.005 25)",
  muted: "oklch(0.955 0.006 25)",
  "muted-foreground": "oklch(0.48 0.02 25)",
  accent: "oklch(0.945 0.015 25)",
  success: "oklch(0.5 0.13 155)",
  "chart-1": "#2a78d6",
  border: "oklch(0.905 0.01 25)",
  ring: "oklch(0.55 0.22 25)",
};

export const DARK_TOKENS: Record<string, string> = {
  background: "oklch(0.17 0.015 25)",
  foreground: "oklch(0.96 0.004 25)",
  card: "oklch(0.215 0.018 25)",
  primary: "oklch(0.68 0.19 25)",
  "primary-foreground": "oklch(0.16 0.02 25)",
  muted: "oklch(0.27 0.018 25)",
  "muted-foreground": "oklch(0.72 0.015 25)",
  accent: "oklch(0.3 0.025 25)",
  success: "oklch(0.76 0.14 155)",
  "chart-1": "#3987e5",
  border: "oklch(1 0 0 / 13%)",
  ring: "oklch(0.68 0.19 25)",
};

const vars = (tokens: Record<string, string>) =>
  Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value};`)
    .join("");

/**
 * Light by default, dark when the system asks for it, and either one when the
 * visitor picked it in the app (the theme script adds `.light`/`.dark`).
 */
const THEME = `
:root{${vars(LIGHT_TOKENS)}color-scheme:light}
@media (prefers-color-scheme:dark){:root:not(.light){${vars(DARK_TOKENS)}color-scheme:dark}}
:root.dark{${vars(DARK_TOKENS)}color-scheme:dark}`;

const BASE = `
@font-face{font-family:"Vazirmatn";src:url("/fonts/vazirmatn-v33.003-variable.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
*,::before,::after{box-sizing:border-box}
html{font-family:"Vazirmatn","Segoe UI",Tahoma,sans-serif;-webkit-text-size-adjust:100%;scrollbar-gutter:stable}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--background);color:var(--foreground);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit;text-underline-offset:.3em;text-decoration-thickness:1px}
a:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-radius:.25rem}
bdi{unicode-bidi:isolate}
svg{flex-shrink:0}
.wrap{width:100%;max-width:72rem;margin-inline:auto;padding-inline:1rem}
@media (min-width:40rem){.wrap{padding-inline:1.5rem}}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip{position:absolute;inset-inline-start:1rem;top:-4rem;z-index:10;padding:.5rem .75rem;border-radius:.375rem;background:var(--card);box-shadow:0 1px 4px rgb(0 0 0/.2)}
.skip:focus{top:.5rem}
.num{font-variant-numeric:tabular-nums}
.muted{color:var(--muted-foreground)}
.code{display:inline-block;padding:0 .3125rem;border-radius:.25rem;background:var(--muted);color:var(--muted-foreground);font-size:.75rem;font-weight:600;letter-spacing:.03em;line-height:1.5;vertical-align:.125em}`;

const CHROME = `
.site-header{border-bottom:1px solid var(--border)}
.site-header .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;height:3.5rem}
.site-header .start{display:flex;align-items:center;gap:1.5rem}
.brand{display:flex;align-items:center;gap:.5rem;text-decoration:none;font-size:1.125rem;font-weight:800;line-height:1}
.brand-mark{display:grid;place-items:center;width:2rem;height:2rem;border-radius:.5rem;background:var(--primary);color:var(--primary-foreground)}
.site-nav{display:none;gap:.25rem}
.site-nav a{padding:.375rem .625rem;border-radius:.375rem;font-size:.875rem;font-weight:500;text-decoration:none;white-space:nowrap}
.site-nav a:hover,.site-nav a[aria-current=page]{background:var(--accent)}
@media (min-width:40rem){.site-header .wrap{height:4rem}.brand{font-size:1.25rem}.brand-mark{width:2.25rem;height:2.25rem}}
@media (min-width:48rem){.site-nav{display:flex}}
.button{display:inline-flex;align-items:center;justify-content:center;gap:.375rem;min-height:2.25rem;padding:.375rem 1rem;border:1px solid transparent;border-radius:.375rem;background:var(--primary);color:var(--primary-foreground);font-size:.875rem;font-weight:600;line-height:1.4;text-align:center;text-decoration:none}
.button:hover{background:color-mix(in oklab,var(--primary) 88%,black)}
.button.block{display:flex;width:100%;min-height:2.75rem;font-size:.9375rem}
.button.quiet{background:transparent;border-color:var(--border);color:var(--foreground)}
.button.quiet:hover{background:var(--accent)}
.button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
main{flex:1;padding-bottom:3.5rem}
.site-footer{border-top:1px solid var(--border);background:color-mix(in oklab,var(--muted) 45%,transparent);font-size:.875rem;color:var(--muted-foreground)}
.site-footer .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 2rem;padding-block:1.5rem}
.site-footer nav{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem}
.site-footer p{margin:0}
.site-footer a{text-decoration:none}
.site-footer a:hover{color:var(--foreground);text-decoration:underline}`;

const CONTENT = `
.crumbs{margin:1.25rem 0 .75rem;font-size:.8125rem;color:var(--muted-foreground)}
.crumbs ol{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .375rem;margin:0;padding:0;list-style:none}
.crumbs li{display:flex;align-items:center;gap:.375rem}
.crumbs a{text-decoration:none}
.crumbs a:hover{color:var(--foreground);text-decoration:underline}
.crumbs svg{width:.875rem;height:.875rem;opacity:.6}
h1{margin:0;font-size:clamp(1.5rem,1.15rem + 1.5vw,2.25rem);font-weight:800;line-height:1.35}
h2{margin:0 0 .25rem;font-size:1.1875rem;font-weight:800;line-height:1.5}
h3{margin:0 0 .25rem;font-size:1rem;font-weight:700;line-height:1.6}
.route{display:flex;align-items:center;gap:.375rem;margin:0 0 .375rem;font-size:.8125rem;color:var(--muted-foreground)}
.route svg{width:.875rem;height:.875rem}
.lede{max-width:46rem;margin:.625rem 0 0;color:var(--muted-foreground)}
.lede strong{color:var(--foreground);font-weight:700}
.note{margin:0 0 1rem;font-size:.875rem;color:var(--muted-foreground)}
.guide{display:grid;gap:2.25rem;margin-top:1.75rem}
.guide>.content>section+section{margin-top:2.75rem}
@media (min-width:64rem){.guide{grid-template-columns:minmax(0,1fr) 20rem;grid-template-areas:"content summary";align-items:start;gap:3.5rem}.guide>.content{grid-area:content}.guide>.summary{grid-area:summary;position:sticky;top:1.5rem}}
.summary{padding:1.25rem;border:1px solid var(--border);border-radius:.5rem;background:var(--card)}
.summary .label{margin:0;font-size:.8125rem;color:var(--muted-foreground)}
.summary .price{margin:.125rem 0 0;font-size:1.75rem;font-weight:800;line-height:1.35}
.summary .price small{margin-inline-start:.25rem;font-size:.875rem;font-weight:500;color:var(--muted-foreground)}
.summary .when{margin:0 0 1rem;font-size:.9375rem}
.summary .button+.button{margin-top:.5rem}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:.875rem 1.25rem;margin:1.25rem 0 0;padding-top:1.25rem;border-top:1px solid var(--border)}
.facts dt{font-size:.75rem;color:var(--muted-foreground)}
.facts dd{margin:0;font-size:.9375rem;font-weight:700}
.updated{margin:1rem 0 0;font-size:.75rem;color:var(--muted-foreground)}
.calendar{width:calc(100% + .5rem);margin-inline:-.25rem;border-collapse:separate;border-spacing:.25rem;table-layout:fixed}
.calendar+.note{margin-top:.75rem}
.calendar caption{margin-bottom:.25rem;padding-inline:.25rem;font-size:.8125rem;color:var(--muted-foreground);text-align:start}
.calendar th{padding:.125rem 0;font-size:.75rem;font-weight:500;color:var(--muted-foreground);text-align:center}
.calendar td{height:3.75rem;padding:0;vertical-align:top}
.calendar .day{display:flex;flex-direction:column;justify-content:space-between;height:100%;padding:.375rem .4375rem;border:1px solid var(--border);border-radius:.375rem;background:var(--card);text-decoration:none}
.calendar a.day:hover{border-color:var(--foreground)}
.calendar .d{font-size:.75rem;line-height:1.2;color:var(--muted-foreground)}
.calendar .d b{color:var(--foreground);font-weight:700}
.calendar .p{font-size:.875rem;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
.calendar .none{border-style:dashed;background:transparent}
.calendar .none .p{font-weight:400;color:var(--muted-foreground)}
.calendar .best{border-color:var(--success);box-shadow:inset 0 0 0 1px var(--success)}
.calendar .best .p{color:var(--success)}
@media (max-width:26rem){.calendar{border-spacing:.125rem;width:calc(100% + .25rem);margin-inline:-.125rem}.calendar td{height:3.25rem}.calendar .day{padding:.25rem}.calendar .p{font-size:.75rem}}
.flights{margin:0;padding:0;list-style:none;border-top:1px solid var(--border)}
.flights li{border-bottom:1px solid var(--border)}
.flights a{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 0;text-decoration:none}
.flights a:hover .who{text-decoration:underline}
.flights .what{min-width:0}
.flights .line{display:flex;flex-wrap:wrap;align-items:baseline;gap:.125rem .5rem}
.flights .time{font-size:1.0625rem;font-weight:800;line-height:1.4}
.flights .who{font-size:.9375rem;font-weight:600}
.flights .small{display:block;font-size:.75rem;font-weight:400;line-height:1.6;color:var(--muted-foreground)}
.flights .price{flex-shrink:0;font-weight:800;text-align:end;white-space:nowrap}
.data{width:100%;border-collapse:collapse;font-size:.9375rem}
.data th{padding:.5rem 0;padding-inline-end:.75rem;border-bottom:1px solid var(--border);font-size:.75rem;font-weight:500;color:var(--muted-foreground);text-align:start}
.data td{padding:.625rem 0;padding-inline-end:.75rem;border-bottom:1px solid var(--border);vertical-align:middle}
.data tbody th{padding:.625rem 0;padding-inline-end:.75rem;border-bottom:1px solid var(--border);font-size:.9375rem;font-weight:600;color:var(--foreground);text-align:start;vertical-align:middle}
.data th:last-child,.data td:last-child{padding-inline-end:0}
.data .end{text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}
.data a{font-weight:600;text-decoration:none}
.data a:hover{text-decoration:underline}
.badge{display:flex;align-items:center;gap:.1875rem;font-size:.75rem;font-weight:500;color:var(--success)}
.badge svg{width:.875rem;height:.875rem}
.stars{display:inline-flex;align-items:center;gap:.25rem;white-space:nowrap}
.stars svg{width:.875rem;height:.875rem;color:var(--foreground)}
.parts{display:grid;gap:.625rem;margin:0;padding:0;list-style:none}
.parts li{display:grid;grid-template-columns:5.5rem minmax(0,1fr) 2.5rem;align-items:center;gap:.75rem;font-size:.875rem}
.parts .hint{font-size:.75rem;color:var(--muted-foreground)}
.bar{display:block;width:100%;height:.5rem}
.bar .track{fill:var(--muted)}
.bar .fill{fill:var(--chart-1)}
.faq h3{margin-top:1.25rem}
.faq p{max-width:46rem;margin:0;color:var(--muted-foreground)}
.routes{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:0 2rem;margin:0;padding:0;list-style:none}
.routes li{border-bottom:1px solid var(--border)}
.routes a{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding:.625rem 0;text-decoration:none}
.routes a:hover .to{text-decoration:underline}
.routes .to{font-weight:600}
.routes .from{font-size:.8125rem;color:var(--muted-foreground);white-space:nowrap}
.routes .from b{font-weight:700;color:var(--foreground)}
.related{margin-top:2.75rem}
.related h3{margin:1.5rem 0 .25rem;font-size:.9375rem}
.related h3:first-of-type{margin-top:.75rem}
.origins{columns:18rem;column-gap:3rem;margin-top:2.25rem}
.origin{break-inside:avoid;margin-bottom:2.25rem}
.origin h2{display:flex;align-items:baseline;gap:.5rem}
.origin .routes{display:block}
.origin h2 span{font-size:.8125rem;font-weight:500;color:var(--muted-foreground)}
.empty{max-width:34rem;margin:3.5rem auto 0;text-align:center}
.empty p{margin:.5rem 0 1.5rem;color:var(--muted-foreground)}
.empty .actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem}`;

export const STYLES = `${THEME}${BASE}${CHROME}${CONTENT}`.replace(/\n/g, "");
