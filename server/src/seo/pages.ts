/**
 * The server-rendered pages under /flights: a directory of routes and a guide
 * per route. They exist for search engines and first visits from them, so they
 * carry real text (prices, dates, airlines) in plain HTML and hand every action
 * — searching, booking — to the app.
 */
import { airportCity } from "../domain/airports";
import {
  faDigits,
  FA_WEEKDAYS,
  formatClockFa,
  formatDateKeyFa,
  formatDurationFa,
  formatNumberFa,
  formatTehranTimeFa,
  formatTomanFa,
  iranWeekday,
  jalaliDate,
  jalaliMonthName,
  placeName,
} from "../domain/format";
import { html, raw, type Html } from "../lib/html";
import type { DayPart, GuideDay, GuideFlight, RouteGuide, RouteSummary } from "../services/routeGuides";
import { DAY_PARTS, GUIDE_DAYS } from "../services/routeGuides";
import { breadcrumbData, breadcrumbs, icons, renderPage, type Crumb } from "./layout";

// ---------------------------------------------------------------------------
// Links into the app and between guides
// ---------------------------------------------------------------------------

export const guidePath = (originCode: string, destinationCode: string) =>
  `/flights/${originCode.toLowerCase()}-${destinationCode.toLowerCase()}`;

const searchPath = (originCode: string, destinationCode: string, date?: string) =>
  `/search?${new URLSearchParams({ from: originCode, to: destinationCode, ...(date ? { date } : {}) })}`;

const flightPath = (guide: RouteGuide, flight: GuideFlight) =>
  `/flight/${encodeURIComponent(flight.id)}?${new URLSearchParams({
    from: guide.originCode,
    to: guide.destinationCode,
    date: flight.date,
  })}`;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** ["الف", "ب", "پ"] → "الف، ب و پ" */
export function joinFa(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join("، ")} و ${items[items.length - 1]}`;
}

const count = (n: number) => formatNumberFa(n);
/** Prices in the calendar are in thousands of toman (the caption says so). */
const thousands = (toman: number) => formatNumberFa(Math.round(toman / 1000));
const stopsText = (stops: number) => (stops === 0 ? "مستقیم" : `${faDigits(stops)} توقف`);
const routeName = (originCode: string, destinationCode: string) =>
  `${placeName(originCode)} به ${placeName(destinationCode)}`;

const DAY_PART_TEXT: Record<DayPart, { label: string; hint: string }> = {
  early: { label: "بامداد", hint: "۰۰ تا ۰۶" },
  morning: { label: "صبح", hint: "۰۶ تا ۱۲" },
  afternoon: { label: "بعدازظهر", hint: "۱۲ تا ۱۸" },
  evening: { label: "شب", hint: "۱۸ تا ۲۴" },
};

const SHORT_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function routeCodes(originCode: string, destinationCode: string): Html {
  return html`<p class="route">
    <bdi class="code">${originCode}</bdi>${icons.arrow}<bdi class="code">${destinationCode}</bdi>
  </p>`;
}

/**
 * Links to route guides. Under a heading that already names one end ("from
 * Tehran"), only the other end is shown; screen readers still hear the whole route.
 */
function routeList(routes: RouteSummary[], show: "route" | "destination" | "origin" = "route"): Html {
  const name = (r: RouteSummary) => {
    const from = placeName(r.originCode);
    const to = placeName(r.destinationCode);
    if (show === "destination") return html`<span class="sr-only">${from} به </span>${to}`;
    if (show === "origin") return html`${from}<span class="sr-only"> به ${to}</span>`;
    return html`${from} به ${to}`;
  };
  return html`<ul class="routes">
    ${routes.map(
      (r) =>
        html`<li>
          <a href="${guidePath(r.originCode, r.destinationCode)}"
            ><span class="to">${name(r)}</span
            ><span class="from">از <b class="num">${formatNumberFa(r.minPrice)}</b> تومان</span></a
          >
        </li>`,
    )}
  </ul>`;
}

// ---------------------------------------------------------------------------
// Route guide
// ---------------------------------------------------------------------------

/** "مهر و آبان ۱۴۰۵", or across a new year "اسفند ۱۴۰۴ و فروردین ۱۴۰۵". */
function monthsSpanned(days: GuideDay[]): string {
  const months: { month: number; year: number }[] = [];
  for (const d of days) {
    const j = jalaliDate(d.date);
    const last = months[months.length - 1];
    if (!last || last.month !== j.month) months.push({ month: j.month, year: j.year });
  }
  const sameYear = months.every((m) => m.year === months[0].year);
  if (sameYear) return `${joinFa(months.map((m) => jalaliMonthName(m.month)))} ${faDigits(months[0].year)}`;
  return joinFa(months.map((m) => `${jalaliMonthName(m.month)} ${faDigits(m.year)}`));
}

/**
 * The window as a Saturday-first month grid, ending with the week of the last
 * day anything flies (agencies often list only a couple of weeks ahead).
 */
function calendar(guide: RouteGuide): { table: Html; lastShown: string; trimmed: boolean } {
  const cheapest = guide.cheapest?.price ?? null;
  const leading = iranWeekday(guide.days[0].date);
  let lastFlying = guide.days.length - 1;
  while (lastFlying > 0 && guide.days[lastFlying].minPrice === null) lastFlying--;
  const shownCount = Math.min(guide.days.length, Math.ceil((leading + lastFlying + 1) / 7) * 7 - leading);
  const shown = guide.days.slice(0, shownCount);
  const cells: (Html | null)[] = Array.from({ length: leading }, () => null);
  shown.forEach((day, i) => {
    const j = jalaliDate(day.date);
    const label =
      i === 0 || j.day === 1 ? html`<b>${faDigits(j.day)} ${jalaliMonthName(j.month)}</b>` : faDigits(j.day);
    const date = formatDateKeyFa(day.date, { weekday: true });
    if (day.minPrice === null) {
      cells.push(
        html`<span class="day none"
          ><span class="sr-only">${date}: پروازی ثبت نشده</span><span class="d" aria-hidden="true">${label}</span
          ><span class="p" aria-hidden="true">—</span></span
        >`,
      );
      return;
    }
    cells.push(
      html`<a
        class="day${day.minPrice === cheapest ? " best" : ""}"
        href="${searchPath(guide.originCode, guide.destinationCode, day.date)}"
        aria-label="${date}: از ${formatTomanFa(day.minPrice)}، ${count(day.flights)} پرواز"
        ><span class="d">${label}</span><span class="p">${thousands(day.minPrice)}</span></a
      >`,
    );
  });
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  const table = html`<table class="calendar">
    <caption>
      ${monthsSpanned(shown)} — کمترین قیمت هر روز، به هزار تومان
    </caption>
    <thead>
      <tr>
        ${SHORT_WEEKDAYS.map(
          (short, i) =>
            html`<th scope="col">
              <span aria-hidden="true">${short}</span><span class="sr-only">${FA_WEEKDAYS[i]}</span>
            </th>`,
        )}
      </tr>
    </thead>
    <tbody>
      ${weeks.map(
        (week) =>
          html`<tr>
            ${week.map((cell) => html`<td>${cell}</td>`)}
          </tr>`,
      )}
    </tbody>
  </table>`;
  return { table, lastShown: shown[shown.length - 1].date, trimmed: shownCount < guide.days.length };
}

function cheapestDaysSentence(guide: RouteGuide): string | null {
  const best = guide.days
    .filter((d): d is GuideDay & { minPrice: number } => d.minPrice !== null)
    .sort((a, b) => a.minPrice - b.minPrice || a.date.localeCompare(b.date))
    .slice(0, 3);
  if (best.length < 2) return null;
  return `ارزان‌ترین روزها: ${joinFa(best.map((d) => `${formatDateKeyFa(d.date, { weekday: true })} (${formatTomanFa(d.minPrice)})`))}.`;
}

function upcomingList(guide: RouteGuide): Html {
  return html`<ol class="flights">
    ${guide.upcoming.map(
      (f) =>
        html`<li>
          <a href="${flightPath(guide, f)}">
            <span class="what">
              <span class="line"
                ><b class="time num">${formatTehranTimeFa(f.departAt)}</b><span class="who">${f.airline}</span
                ><bdi class="code">${f.flightNo}</bdi></span
              >
              <span class="small"
                >${formatDateKeyFa(f.date, { weekday: true })} · ${stopsText(f.stops)} ·
                ${formatDurationFa(f.durationMin)}</span
              >
            </span>
            <span class="price num"
              >${formatTomanFa(f.price)}<span class="small">${count(f.agencies)} آژانس</span></span
            >
          </a>
        </li>`,
    )}
  </ol>`;
}

function airlinesTable(guide: RouteGuide): Html {
  return html`<table class="data">
    <thead>
      <tr>
        <th scope="col">ایرلاین</th>
        <th scope="col" class="end">پرواز</th>
        <th scope="col" class="end">کمترین قیمت (تومان)</th>
      </tr>
    </thead>
    <tbody>
      ${guide.airlines.map(
        (a) =>
          html`<tr>
            <th scope="row">${a.name}</th>
            <td class="end">${count(a.flights)}</td>
            <td class="end">${formatNumberFa(a.minPrice)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

function agenciesTable(guide: RouteGuide): Html {
  return html`<table class="data">
    <thead>
      <tr>
        <th scope="col">آژانس</th>
        <th scope="col">امتیاز</th>
        <th scope="col" class="end">پرواز</th>
        <th scope="col" class="end">کمترین قیمت (تومان)</th>
      </tr>
    </thead>
    <tbody>
      ${guide.agencies.map(
        (a) =>
          html`<tr>
            <th scope="row">
              ${a.slug ? html`<a href="/agencies/${a.slug}">${a.name}</a>` : a.name}${a.verified &&
              html`<span class="badge">${icons.verified}تأییدشده</span>`}
            </th>
            <td>
              ${a.rating
                ? html`<span class="stars"
                    >${icons.star}<span class="num">${formatNumberFa(a.rating.average)}</span
                    ><span class="muted">(${count(a.rating.count)})</span></span
                  >`
                : html`<span class="muted">—</span>`}
            </td>
            <td class="end">${count(a.flights)}</td>
            <td class="end">${formatNumberFa(a.minPrice)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

function departuresList(guide: RouteGuide): Html {
  const parts = guide.departures!.parts;
  const most = Math.max(...Object.values(parts));
  return html`<ul class="parts">
    ${DAY_PARTS.map(({ id }) => {
      const n = parts[id];
      const share = most ? Math.max((n / most) * 100, n ? 3 : 0) : 0;
      return html`<li>
        <span>${DAY_PART_TEXT[id].label} <span class="hint">${DAY_PART_TEXT[id].hint}</span></span>
        ${raw(
          `<svg class="bar" width="100%" height="8" aria-hidden="true" focusable="false"><rect class="track" width="100%" height="8" rx="4"/>${n ? `<rect class="fill" x="${(100 - share).toFixed(2)}%" width="${share.toFixed(2)}%" height="8" rx="4"/>` : ""}</svg>`,
        )}
        <span class="num">${count(n)}</span>
      </li>`;
    })}
  </ul>`;
}

function trendSentence(guide: RouteGuide): string | null {
  const t = guide.trend;
  if (!t) return null;
  const average = formatTomanFa(Math.round(t.average / 1000) * 1000);
  const change = faDigits(Math.abs(t.deltaPercent));
  const now =
    t.verdict === "below"
      ? `کمترین قیمت امروز ${change}٪ پایین‌تر از میانگین ۶۰ روز گذشته (${average}) است.`
      : t.verdict === "above"
        ? `کمترین قیمت امروز ${change}٪ بالاتر از میانگین ۶۰ روز گذشته (${average}) است.`
        : `کمترین قیمت امروز نزدیک به میانگین ۶۰ روز گذشته (${average}) است.`;
  return `${now} در این مدت کمترین قیمت ثبت‌شده ${formatTomanFa(t.low)} و بیشترینش ${formatTomanFa(t.high)} بوده است.`;
}

interface Faq {
  question: string;
  answer: string;
}

function faqs(guide: RouteGuide): Faq[] {
  const from = placeName(guide.originCode);
  const to = placeName(guide.destinationCode);
  const list: Faq[] = [];
  if (guide.cheapest) {
    list.push({
      question: `ارزان‌ترین بلیط هواپیما ${from} به ${to} چند است؟`,
      answer: `در ${faDigits(GUIDE_DAYS)} روز آینده ارزان‌ترین بلیط ${formatTomanFa(guide.cheapest.price)} است، برای ${formatDateKeyFa(guide.cheapest.date, { weekday: true })}. این قیمت از میان ${count(guide.flights)} پرواز و ${count(guide.agencies.length)} آژانس پیدا شده و با هر تغییر آژانس‌ها به‌روز می‌شود.`,
    });
  }
  if (guide.duration) {
    const { shortest, typical } = guide.duration;
    const hasDirect = guide.directFlights > 0;
    const answer = hasDirect
      ? typical === shortest
        ? `پروازهای مستقیم این مسیر ${formatDurationFa(typical)} طول می‌کشند.`
        : `پروازهای مستقیم این مسیر معمولاً ${formatDurationFa(typical)} طول می‌کشند و کوتاه‌ترینشان ${formatDurationFa(shortest)} است.`
      : `این مسیر در ${faDigits(GUIDE_DAYS)} روز آینده پرواز مستقیم ندارد؛ پروازهای با توقف معمولاً ${formatDurationFa(typical)} طول می‌کشند.`;
    list.push({ question: `پرواز ${from} به ${to} چقدر طول می‌کشد؟`, answer });
  }
  if (guide.airlines.length) {
    list.push({
      question: `کدام ایرلاین‌ها از ${from} به ${to} پرواز دارند؟`,
      answer: `${joinFa(guide.airlines.map((a) => a.name))} در ${faDigits(GUIDE_DAYS)} روز آینده در این مسیر پرواز ${guide.airlines.length > 1 ? "دارند" : "دارد"}.`,
    });
  }
  if (guide.departures) {
    const perDay = Math.round((guide.flights / GUIDE_DAYS) * 10) / 10;
    list.push({
      question: `روزانه چند پرواز از ${from} به ${to} انجام می‌شود؟`,
      answer: `در ${faDigits(GUIDE_DAYS)} روز آینده ${count(guide.flights)} پرواز ثبت شده است، یعنی به‌طور میانگین روزی ${formatNumberFa(perDay)} پرواز. زودترین پرواز ساعت ${formatClockFa(guide.departures.earliest)} و دیرترین ساعت ${formatClockFa(guide.departures.latest)} حرکت می‌کند.`,
    });
  }
  if (guide.charterFlights > 0) {
    list.push({
      question: `بلیط چارتری ${from} به ${to} هم هست؟`,
      answer: `بله؛ ${count(guide.charterFlights)} پرواز از ${count(guide.flights)} پرواز این مسیر بلیط چارتری دارند. نوع هر بلیط (چارتری یا سیستمی) کنار قیمتش در نتایج جستجو آمده است.`,
    });
  }
  return list;
}

function relatedSection(guide: RouteGuide): Html | false {
  const { reverse, fromOrigin, toDestination } = guide.related;
  if (!reverse && !fromOrigin.length && !toDestination.length) return false;
  return html`<section class="related" aria-labelledby="related-title">
    <h2 id="related-title">مسیرهای مرتبط</h2>
    ${reverse &&
    html`<h3>مسیر برگشت</h3>
      ${routeList([reverse])}`}
    ${fromOrigin.length > 0 &&
    html`<h3>از ${placeName(guide.originCode)} به مقصدهای دیگر</h3>
      ${routeList(fromOrigin, "destination")}`}
    ${toDestination.length > 0 &&
    html`<h3>به ${placeName(guide.destinationCode)} از شهرهای دیگر</h3>
      ${routeList(toDestination, "origin")}`}
  </section>`;
}

function guideTrail(guide: RouteGuide): Crumb[] {
  return [
    { name: "پروازیاب", path: "/" },
    { name: "مسیرهای پرواز", path: "/flights" },
    { name: routeName(guide.originCode, guide.destinationCode) },
  ];
}

function emptyGuideBody(guide: RouteGuide): Html {
  return html`${breadcrumbs(guideTrail(guide))} ${routeCodes(guide.originCode, guide.destinationCode)}
    <h1>بلیط هواپیما ${routeName(guide.originCode, guide.destinationCode)}</h1>
    <p class="lede">
      در ${faDigits(GUIDE_DAYS)} روز آینده پروازی از ${airportCity(guide.originCode)} به
      ${airportCity(guide.destinationCode)} ثبت نشده است. آژانس‌ها هر روز پرواز تازه اضافه می‌کنند؛ مسیرهای نزدیک را
      ببینید یا بعداً دوباره سر بزنید.
    </p>
    <div class="guide">
      <div class="content">
        <p><a class="button" href="${searchPath(guide.originCode, guide.destinationCode)}">جستجوی این مسیر</a></p>
        ${relatedSection(guide)}
      </div>
    </div>`;
}

export function routeGuidePage(guide: RouteGuide): string {
  const from = placeName(guide.originCode);
  const to = placeName(guide.destinationCode);
  const path = guidePath(guide.originCode, guide.destinationCode);
  const trail = guideTrail(guide);

  if (!guide.cheapest) {
    return renderPage({
      title: `بلیط هواپیما ${from} به ${to} | پروازیاب`,
      description: `قیمت بلیط هواپیما ${airportCity(guide.originCode)} به ${airportCity(guide.destinationCode)} را در پروازیاب با قیمت آژانس‌های مختلف مقایسه کنید.`,
      path,
      // Nothing to show yet: keep it out of the index until flights appear.
      noindex: true,
      body: emptyGuideBody(guide),
    });
  }

  const cheapestDate = formatDateKeyFa(guide.cheapest.date, { weekday: true });
  const price = formatTomanFa(guide.cheapest.price);
  const questions = faqs(guide);
  const trend = trendSentence(guide);
  const bestDays = cheapestDaysSentence(guide);
  const days = calendar(guide);
  const body = html`${breadcrumbs(trail)} ${routeCodes(guide.originCode, guide.destinationCode)}
    <h1>بلیط هواپیما ${from} به ${to}</h1>
    <p class="lede">
      ${count(guide.flights)} پرواز از ${airportCity(guide.originCode)} به ${airportCity(guide.destinationCode)} در
      ${faDigits(GUIDE_DAYS)} روز آینده، با قیمت ${count(guide.agencies.length)} آژانس کنار هم. ارزان‌ترین بلیط
      <strong>${price}</strong> است، برای ${cheapestDate}.
    </p>

    <div class="guide">
      <aside class="summary" aria-labelledby="summary-title">
        <h2 class="sr-only" id="summary-title">خلاصهٔ مسیر</h2>
        <p class="label">ارزان‌ترین بلیط در ${faDigits(GUIDE_DAYS)} روز آینده</p>
        <p class="price num">${formatNumberFa(guide.cheapest.price)}<small>تومان</small></p>
        <p class="when">${cheapestDate}</p>
        <a class="button block" href="${searchPath(guide.originCode, guide.destinationCode, guide.cheapest.date)}"
          >پروازهای ${cheapestDate}</a
        >
        <a class="button block quiet" href="${searchPath(guide.originCode, guide.destinationCode)}">همهٔ تاریخ‌ها</a>
        <dl class="facts">
          <div>
            <dt>پرواز در ${faDigits(GUIDE_DAYS)} روز</dt>
            <dd class="num">${count(guide.flights)}</dd>
          </div>
          <div>
            <dt>پرواز مستقیم</dt>
            <dd>
              ${guide.directFlights === guide.flights
                ? "همه"
                : guide.directFlights === 0
                  ? "ندارد"
                  : `${count(guide.directFlights)} از ${count(guide.flights)}`}
            </dd>
          </div>
          ${guide.duration &&
          html`<div>
            <dt>مدت پرواز</dt>
            <dd>${formatDurationFa(guide.duration.typical)}</dd>
          </div>`}
          <div>
            <dt>ایرلاین و آژانس</dt>
            <dd>${count(guide.airlines.length)} ایرلاین، ${count(guide.agencies.length)} آژانس</dd>
          </div>
        </dl>
        <p class="updated">قیمت‌ها ساعت ${formatTehranTimeFa(guide.generatedAt)} به‌روز شده‌اند.</p>
      </aside>

      <div class="content">
        <section aria-labelledby="calendar-title">
          <h2 id="calendar-title">قیمت بلیط ${from} به ${to} در ${faDigits(GUIDE_DAYS)} روز آینده</h2>
          <p class="note">روی هر روز بزنید تا پروازهای آن را با قیمت همهٔ آژانس‌ها ببینید.</p>
          ${days.table}
          ${days.trimmed &&
          html`<p class="note">
            آژانس‌ها برای بعد از ${formatDateKeyFa(days.lastShown, { weekday: true })} هنوز پروازی ثبت نکرده‌اند.
          </p>`}
          ${bestDays && html`<p class="note">${bestDays}</p>`}
        </section>

        ${guide.upcoming.length > 0 &&
        html`<section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">ارزان‌ترین پروازهای هفتهٔ پیش رو</h2>
          <p class="note">به ترتیب قیمت؛ هر پرواز را با قیمت همهٔ آژانس‌هایش ببینید.</p>
          ${upcomingList(guide)}
        </section>`}
        ${trend &&
        html`<section aria-labelledby="trend-title">
          <h2 id="trend-title">روند قیمت</h2>
          <p class="lede">${trend}</p>
        </section>`}

        <section aria-labelledby="airlines-title">
          <h2 id="airlines-title">ایرلاین‌های این مسیر</h2>
          <p class="note">پروازها و کمترین قیمت هر ایرلاین در ${faDigits(GUIDE_DAYS)} روز آینده.</p>
          ${airlinesTable(guide)}
        </section>

        <section aria-labelledby="agencies-title">
          <h2 id="agencies-title">آژانس‌های فروشنده</h2>
          <p class="note">امتیاز از نظر مسافرانی است که از هر آژانس خرید کرده‌اند.</p>
          ${agenciesTable(guide)}
        </section>

        ${guide.departures &&
        html`<section aria-labelledby="times-title">
          <h2 id="times-title">ساعت پروازها</h2>
          <p class="note">
            زودترین پرواز ساعت <span class="num">${formatClockFa(guide.departures.earliest)}</span> و دیرترین ساعت
            <span class="num">${formatClockFa(guide.departures.latest)}</span> حرکت می‌کند (به وقت ایران).
          </p>
          ${departuresList(guide)}
        </section>`}
        ${questions.length > 0 &&
        html`<section class="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">پرسش‌های رایج</h2>
          ${questions.map(
            (q) =>
              html`<h3>${q.question}</h3>
                <p>${q.answer}</p>`,
          )}
        </section>`}
        ${relatedSection(guide)}
      </div>
    </div>`;

  return renderPage({
    title: `بلیط هواپیما ${from} به ${to}؛ از ${price} | پروازیاب`,
    description: `مقایسهٔ قیمت بلیط هواپیما ${airportCity(guide.originCode)} به ${airportCity(guide.destinationCode)} در ${count(guide.agencies.length)} آژانس. ارزان‌ترین بلیط ${faDigits(GUIDE_DAYS)} روز آینده ${price}، ${cheapestDate}؛ ${count(guide.flights)} پرواز از ${count(guide.airlines.length)} ایرلاین.`,
    path,
    structuredData: [
      breadcrumbData(trail),
      ...(questions.length
        ? [
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: questions.map((q) => ({
                "@type": "Question",
                name: q.question,
                acceptedAnswer: { "@type": "Answer", text: q.answer },
              })),
            },
          ]
        : []),
    ],
    body,
  });
}

// ---------------------------------------------------------------------------
// Directory of routes
// ---------------------------------------------------------------------------

export function routeIndexPage(routes: RouteSummary[]): string {
  const trail: Crumb[] = [{ name: "پروازیاب", path: "/" }, { name: "مسیرهای پرواز" }];
  const byOrigin = new Map<string, RouteSummary[]>();
  for (const r of routes) byOrigin.set(r.originCode, [...(byOrigin.get(r.originCode) ?? []), r]);
  const origins = [...byOrigin.entries()].sort(
    ([, a], [, b]) => b.reduce((s, r) => s + r.flights, 0) - a.reduce((s, r) => s + r.flights, 0),
  );

  const body = html`${breadcrumbs(trail)}
    <h1>مسیرهای پرواز</h1>
    ${routes.length
      ? html`<p class="lede">
            ارزان‌ترین قیمت ${faDigits(GUIDE_DAYS)} روز آینده برای ${count(routes.length)} مسیر از
            ${count(origins.length)} فرودگاه. هر مسیر را باز کنید تا تقویم قیمت، ایرلاین‌ها و آژانس‌هایش را ببینید.
          </p>
          <div class="origins">
            ${origins.map(
              ([origin, list]) =>
                html`<section class="origin" aria-labelledby="from-${origin.toLowerCase()}">
                  <h2 id="from-${origin.toLowerCase()}">
                    از ${airportCity(origin)} <span>${count(list.length)} مسیر</span>
                  </h2>
                  ${routeList(list, "destination")}
                </section>`,
            )}
          </div>`
      : html`<div class="empty">
          <p>فعلاً پروازی برای ${faDigits(GUIDE_DAYS)} روز آینده ثبت نشده است.</p>
          <div class="actions"><a class="button" href="/">جستجوی پرواز</a></div>
        </div>`}`;

  return renderPage({
    title: "بلیط هواپیما؛ همهٔ مسیرها و ارزان‌ترین قیمت‌ها | پروازیاب",
    description: `ارزان‌ترین قیمت بلیط هواپیما در ${faDigits(GUIDE_DAYS)} روز آینده برای ${count(routes.length)} مسیر داخلی و خارجی، با قیمت آژانس‌های مختلف کنار هم.`,
    path: "/flights",
    noindex: routes.length === 0,
    structuredData: [breadcrumbData(trail)],
    body,
  });
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

export function notFoundPage(path: string): string {
  return renderPage({
    title: "صفحه پیدا نشد | پروازیاب",
    description: "این صفحه در پروازیاب وجود ندارد.",
    path,
    noindex: true,
    body: html`<div class="empty">
      <h1>این صفحه پیدا نشد</h1>
      <p>نشانی را بررسی کنید، یا مسیرتان را از فهرست مسیرها پیدا کنید.</p>
      <div class="actions">
        <a class="button" href="/flights">همهٔ مسیرها</a>
        <a class="button quiet" href="/">جستجوی پرواز</a>
      </div>
    </div>`,
  });
}
