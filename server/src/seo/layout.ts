import { createHash } from "node:crypto";
import { config } from "../config/env";
import { faDigits, jalaliDate } from "../domain/format";
import { tehranTodayKey } from "../domain/time";
import { html, jsonLd, raw, type Html, type HtmlValue } from "../lib/html";
import { STYLES } from "./styles";

/** Applies the theme the visitor picked in the app (next-themes keeps it under "theme"). */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}`;

/**
 * Built outside the page template so no formatter can touch it: the CSP below
 * allows these two elements by the hash of their exact text.
 */
const INLINE_HEAD = raw(`<script>${THEME_SCRIPT}</script><style>${STYLES}</style>`);

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/**
 * Nothing runs or loads on these pages except the inline stylesheet, the theme
 * snippet (both allowed by hash), the font and icons. JSON-LD blocks are data,
 * which CSP doesn't govern.
 */
export const PAGE_CSP = [
  "default-src 'none'",
  `style-src ${sha256(STYLES)}`,
  `script-src ${sha256(THEME_SCRIPT)}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** An absolute URL on the public site. */
export const siteUrl = (path: string) => new URL(path, config.APP_URL).toString();

// Icons (lucide), inline so they need no request and inherit the text colour.
const svg = (body: string, { fill = false }: { fill?: boolean } = {}) =>
  raw(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
  );
export const icons = {
  plane: svg(
    `<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>`,
  ),
  /** "Forward" in a right-to-left page. */
  chevron: svg(`<path d="m15 18-6-6 6-6"/>`),
  arrow: svg(`<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>`),
  verified: svg(
    `<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>`,
  ),
  star: svg(
    `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
    { fill: true },
  ),
};

export interface Crumb {
  name: string;
  /** Omitted for the current page. */
  path?: string;
}

export function breadcrumbs(trail: Crumb[]): Html {
  return html`<nav class="crumbs" aria-label="مسیر صفحه">
    <ol>
      ${trail.map(
        (c, i) =>
          html`<li>
            ${i > 0 && icons.chevron}${c.path
              ? html`<a href="${c.path}">${c.name}</a>`
              : html`<span aria-current="page">${c.name}</span>`}
          </li>`,
      )}
    </ol>
  </nav>`;
}

/** schema.org BreadcrumbList for the same trail. */
export const breadcrumbData = (trail: Crumb[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.name,
    ...(c.path ? { item: siteUrl(c.path) } : {}),
  })),
});

const NAV = [
  { path: "/explore", label: "مقصدهای ارزان" },
  { path: "/agencies", label: "آژانس‌ها" },
  { path: "/flights", label: "همهٔ مسیرها" },
];

export interface PageOptions {
  title: string;
  description: string;
  /** Path of the canonical URL. */
  path: string;
  /** Keep the page out of search results (it still passes link signals). */
  noindex?: boolean;
  structuredData?: unknown[];
  body: HtmlValue;
}

export function renderPage({
  title,
  description,
  path,
  noindex = false,
  structuredData = [],
  body,
}: PageOptions): string {
  const url = siteUrl(path);
  const year = jalaliDate(tehranTodayKey()).year;
  const doc = html`<!doctype html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>${title}</title>
        <meta name="description" content="${description}" />
        ${noindex
          ? raw(`<meta name="robots" content="noindex, follow">`)
          : html`<link rel="canonical" href="${url}" />`}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="پروازیاب" />
        <meta property="og:locale" content="fa_IR" />
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:image" content="${siteUrl("/icons/icon-512.png")}" />
        <meta name="twitter:card" content="summary" />
        <meta name="theme-color" content="#fbf9f9" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1c1615" media="(prefers-color-scheme: dark)" />
        <link rel="preload" href="/fonts/vazirmatn-v33.003-variable.woff2" as="font" type="font/woff2" crossorigin />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        ${INLINE_HEAD} ${structuredData.map((data) => jsonLd(data))}
      </head>
      <body>
        <a class="skip" href="#main">پرش به محتوای اصلی</a>
        <header class="site-header">
          <div class="wrap">
            <div class="start">
              <a class="brand" href="/" aria-label="پروازیاب — صفحه اصلی"
                ><span class="brand-mark">${icons.plane}</span><span>پروازیاب</span></a
              >
              <nav class="site-nav" aria-label="ناوبری اصلی">
                ${NAV.map(
                  (n) => html`<a href="${n.path}" ${path === n.path ? raw(` aria-current="page"`) : ""}>${n.label}</a>`,
                )}
              </nav>
            </div>
            <a class="button" href="/">جستجوی پرواز</a>
          </div>
        </header>
        <main id="main" tabindex="-1">
          <div class="wrap">${body}</div>
        </main>
        <footer class="site-footer">
          <div class="wrap">
            <nav aria-label="پیوندهای پروازیاب">
              <a href="/">جستجوی پرواز</a>
              ${NAV.map((n) => html`<a href="${n.path}">${n.label}</a>`)}
            </nav>
            <p>© ${faDigits(year)} پروازیاب</p>
          </div>
        </footer>
      </body>
    </html>`;
  return doc.value;
}
