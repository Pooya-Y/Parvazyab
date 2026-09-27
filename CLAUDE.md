# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Parvazyab (پروازیاب) is a Persian, RTL-first flight-price comparison site. Agencies publish flight listings (by
form, CSV/JSON import or an API with keys); search merges listings that are the same real flight into one card
showing every agency's price, ranks the cards, and links out to the agency to buy through a click-counting
redirect. Around that: price calendars and trends, price-drop alerts (inbox, email, web push), SMS or password
sign-in, agency profiles and reviews, admin moderation, an installable PWA, and server-rendered route pages for
search engines. npm workspaces: `client/` (React 19, Vite, Tailwind 4, shadcn/Radix) and `server/` (Express 5,
TypeORM + PostgreSQL, Redis cache, Zod, a separate worker process). One lockfile, at the root.

## Commands

Run from the repository root unless noted.

```bash
npm install                     # all workspaces
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis   # dev DB/cache on 127.0.0.1:55432/56379
npm run dev:server              # API on :4000 (tsx watch); reads server/.env
npm run dev:worker              # scheduled jobs (tsx watch)
npm run dev                     # Vite on :5173; proxies /api and the SEO paths to $VITE_API_PROXY (default :4000)
npm run typecheck               # tsc for client and server — run before every commit
npm run lint                    # ESLint (client only)
npm test                        # server unit tests (node:test via tsx), then client tests (Vitest)
npm run test:int                # server integration tests; needs TEST_DATABASE_URL (see Tests)
npm run build                   # production builds of both workspaces
npm run seed -w server          # seed demo data without starting the API
docker compose up -d --build    # full stack at http://localhost:8080; needs JWT_SECRET in a root .env (see .env.example)
```

Single tests:

```bash
cd server && npx tsx --test src/services/flightsCore.test.ts
cd server && npx tsx --test --test-name-pattern="Tehran" src/services/flightsCore.test.ts
cd server && TEST_DATABASE_URL=postgres://parvazyab:parvazyab@127.0.0.1:55432/parvazyab_test npx tsx --test src/api/alerts.int.ts
cd client && npx vitest run src/lib/persian.test.ts -t "route problems"
```

- Add dependencies from the root with `npm install <pkg> -w client` / `-w server`. Both Dockerfiles use the repo root as
  build context and run `npm ci --workspace …` against the root lockfile, so an out-of-sync lockfile breaks the image
  build.
- :8080 serves a built client image; client changes show up there only after `docker compose up -d --build client`.
  `VITE_API_PROXY=http://localhost:8080 npm run dev` works on the UI against the Dockerized API.
- `GET /api/health` reports `db`/`cache` status and backs the Docker healthcheck. The worker's healthcheck is a
  heartbeat file.
- With `SEED_DEMO_DATA=true` (the Compose default) the API seeds demo data on startup and the worker keeps a rolling
  two-week demo timetable: agencies `skybazaar@example.com` and `parvazino@example.com`, user `user@example.com`, all
  with password `Demo1234!`. `ADMIN_EMAIL`/`ADMIN_PASSWORD` create an admin account on startup.
- Mail, SMS and push default to "console" transports (the API logs what would be sent; outside production the log
  includes links and codes). Real transports and their variables are documented in `.env.example`.
- Formatting: root `.prettierrc` (printWidth 120). `client/src/components/ui/` is vendored shadcn code in its own
  style and is excluded in `.prettierignore` — don't reformat it.

## Architecture

### Server request path

`server.ts` initializes TypeORM, runs pending migrations, optionally seeds, then connects Redis (optional: when it is
down, `services/redis.ts#cached` falls through to the loader). `app.ts` mounts middleware, `api/router.ts` under
`/api`, and `seo/router.ts` (HTML pages, outside `/api`). Routers (`api/*Routes.ts`) stay thin: parse input with the
Zod schemas in `api/schemas.ts`, call a service, serialize. Express 5 forwards thrown and rejected errors to
`http/errors.ts#errorHandler`, the only place that shapes JSON error responses. Per-IP limiters for credential and
messaging endpoints live in `api/limiters.ts`; `/api/v1` gets a 2 MB body limit, everything else 100 KB.

`worker.ts` runs the jobs in `jobs/scheduler.ts` (price snapshots, alert evaluation, clean-ups, demo timetable). Each
run takes a Postgres advisory lock, so replicas never run a job twice; a run is scheduled only after the previous
one finishes.

### Flight search pipeline (`server/src/services`)

1. `flightService.loadRouteFlights(origin, dest, date?)` loads visible listings for the route (optionally one Iran
   calendar day), attaches agency names/profiles, canonicalizes airline spellings (`domain/airlineRegistry.ts`), and
   groups them. The result is cached in Redis for 30 s under the `search:` prefix.
2. `flightsCore.groupOffersByFlight` merges listings into one `FlightCard` per real flight. Identity is
   `airline__flightNo__departureMinute`, and that string is also the flight `id` used in URLs and stored as `flightKey`
   for saved flights — changing the format breaks saved flights and shared links.
3. `applyFilters` → `rankFlights` (score from `domain/rankingWeights.ts`, plus Persian badges and "why" reasons computed
   relative to the filtered set) → `sortFlights` → `pairableFirst` (round trips: flights that can't pair with the other
   leg's choice, per `departFrom`/`arriveBy`, go last). Only then is the page cut: `/api/search` answers
   `{ flights, total, offset, limit, minPrice }`, ten by default (`limit` up to 100), so ranking, `total` and `minPrice`
   always describe the whole result set. A single flight comes from `/api/flights/:origin-:dest/:id` (`date` ranks it
   within its day).
4. Derived data (price calendar, 60-day trend, cheapest destinations, route guides) is cached under the same `search:`
   prefix. Every listing write must call `invalidate(SEARCH_CACHE_PREFIX)` (see `services/accountService.ts`).

**Visibility has one definition**: `services/visibility.ts` (`VISIBLE_LISTING_SQL` for raw SQL over alias `f`,
`whereVisible` for query builders) — active, not departed, listing not suspended, owning agency not suspended. Every
traveller-facing read (search, calendars, trends, explore, alerts, route guides, the buy redirect) must use it.

### Data layer

Entities are TypeORM `EntitySchema`s (no decorators) in `database/entities.ts`, mapped to the snake_case columns of the
SQL migrations via explicit `name:`; `synchronize` is off. Newer tables (tokens, alerts, clicks, API keys, profiles,
reviews, push subscriptions, audit log) are accessed with raw SQL through `AppDataSource.query`. A schema change needs
a migration class in `database/migrations/` **and** an entry in the `migrations` array of `database/dataSource.ts`
(classes rather than globs, so the same list works under tsx and in compiled `dist`). `bigint` price columns are
converted to numbers by a transformer.

Raw `UPDATE`/`DELETE` through `AppDataSource.query` returns `[rows, rowCount]`, not rows: to read what changed, wrap it
as `WITH x AS (UPDATE … RETURNING …) SELECT … FROM x`. Don't update and delete the same row in one statement.

### Auth and accounts

JWT (HS256) in the httpOnly cookie `parvazyab_session`, carrying `{ sub, ver }`; `ver` must equal
`accounts.session_version`, so `auth.ts#revokeSessions` (password change/reset, "sign out everywhere") ends every
session. Accounts sign in with email + password or a phone number + SMS code (`auth/otp.ts`, `services/phoneAuth.ts`);
every account has an email or a phone (a DB check). Guests are real accounts with a reserved email domain that can be
upgraded or merged (`services/guests.ts`). One-time email links (verification, reset) come from `auth/tokens.ts`; the
token travels in the URL fragment.

`requireUser` loads the account into `res.locals.user`, `requireRole(...)` guards routes, handlers read the user with
`sessionUser(res)`, and `moderation.ts#forbidSuspended` blocks writes by suspended accounts. `sanitizeUser` adds
`accountRole` (`"agency" | "user"`): the client checks `role === "admin"` for admin features and
`accountRole === "agency"` for agency features. Only credential endpoints use the strict limiters — `/auth/me` is
called on every page load and must not be behind one. Security and admin actions are written to the audit log
(`services/audit.ts`, action names in `AUDIT_ACTIONS`, IPs HMAC-hashed).

### Notifications and outbound links

`services/notifications.ts#notify` writes the in-app inbox row and then emails (verified addresses only) and pushes
(`services/push.ts`, subscriptions pruned when gone or failing) in the background via `lib/background.ts`. Transports
in `notify/` (mail, SMS, push) each have a `memory` mode that only `NODE_ENV=test` may use. Push endpoints are
allowlisted to the browsers' push services (SSRF). "Buy" links go through `/api/go/:listingId`, which counts the click
(`services/clicks.ts`) and redirects; the client builds them with `lib/api.ts#offerHref`, never from `bookingUrl`.

### Agency API

`/api/v1` (`api/v1Routes.ts`) authenticates with API keys (`services/apiKeys.ts`, `pvz_<prefix>_<secret>`, only a hash
stored) and shares the import pipeline (`services/listingImport.ts`) with the dashboard's CSV/JSON import. The OpenAPI
document (`api/openapi.ts`, served at `/api/v1/openapi.json`) is hand-written — update it with any v1 change.

### Server-rendered pages (`server/src/seo`)

`/flights`, `/flights/:origin-:destination`, `/sitemap.xml` and `/robots.txt` are HTML/XML rendered by the API from
`services/routeGuides.ts`; nginx (`client/nginx.conf`) and the Vite dev proxy route exactly these paths to the API.
Build markup with `lib/html.ts#html`, which escapes every interpolation unless it is `Html` — never concatenate data
into HTML. Pages run under a CSP that allows only the inline `<style>` and theme `<script>` by hash: no `style="…"`
attributes, no other scripts. Prettier formats `html` templates as HTML, so anything whitespace-sensitive (those two
elements) is built outside them. Colour tokens in `seo/styles.ts` mirror `client/src/index.css`; a test fails when
they drift. The SPA must link to these pages with a plain `<a href>`, not a router `Link`.

### Client

- `lib/api.ts` is the only code that calls `fetch`; failures throw `ApiError(status, code, details)`. Response types in
  `lib/types.ts` mirror the server by hand (there is no shared package) — update them with any API change. All
  timestamps in API responses are epoch milliseconds.
- `lib/use-api-query.ts` is the data hook (no React Query). A string key identifies the request (`null` skips it); a
  new key aborts the in-flight request so stale responses can't win; previous data stays visible while refetching;
  `invalidate(tag)` refetches subscribers; `setData` applies a mutation's result locally.
- Session state comes from `AuthProvider` (`hooks/use-auth.tsx`, one `/auth/me` per load). `signOut(leave)` runs the
  navigation in the same transition as clearing the user; navigating after `signOut()` resolves lets `RequireAuth`
  redirect to `/auth` first. Signing out also unsubscribes this browser from push.
- `/dashboard` is nested routes (`pages/dashboard/`) guarded by `RequireAuth`/`RequireRole`.
- Search state lives in the URL. `lib/search-state.ts` parses and serializes it and maps it to API params.
  `pages/Search.tsx` remounts the results per route so a new route shows skeletons instead of the previous route's
  flights. `lib/use-paged-search.ts` fetches results ten at a time as the list's end scrolls into view; the client never
  holds every result, so counts and the lowest fare come from the response, and round-trip choices are looked up by id.
- PWA: `public/sw.js` is hand-written (network-first pages with the shell as offline fallback, cache-first hashed
  assets, API never cached, push display) and `lib/pwa.ts` registers it in production builds only.

## Cross-cutting conventions

- **Iran time everywhere.** Iran is fixed at UTC+03:30 (no DST since 2022). Server `domain/time.ts` and client
  `lib/persian.ts` apply the offset explicitly. Never use local-time `Date` APIs (`getHours`, `new Date(y, m, d)`,
  `toLocaleString`) for flight times or date filters — the server runs in UTC and users may be abroad. Dates travel as
  Gregorian `yyyy-mm-dd` keys and are displayed in the Jalali calendar (`lib/persian.ts` on the client,
  `domain/jalali.ts` + `domain/format.ts` on the server); imports also accept Jalali dates.
- **Errors are codes.** Throw `new HttpError(status, "CODE")` on the server. Zod refinement messages are codes too (e.g.
  `UNKNOWN_AIRPORT`) and reach the client in `details` as `"field: CODE"`. Every user-facing code needs a Persian
  message in `client/src/lib/errors.ts`. Unexpected errors become a generic 500; never send internal messages.
- **Booking links are http(s) only**: `httpUrl` in `api/schemas.ts` on write, `safeExternalUrl` on the client before
  rendering any link from the API. CSV export neutralizes spreadsheet formulas (`lib/csv.ts`).
- **Airport data is duplicated**: `server/src/domain/airports.ts` is what the API validates against;
  `client/src/domain/airports.ts` adds English names for search. Change both together.
- Prices compared across time (alert thresholds) use integer basis points, not floats.

## UI conventions (Persian / RTL)

- The document is `dir="rtl"` and Radix is wrapped in `DirectionProvider dir="rtl"`. Use logical Tailwind utilities
  (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, `text-start`), not `left`/`right`/`ml`/`mr`/`pl`/`pr`. Pick directional
  icons for RTL (previous = `ChevronRight`, next = `ChevronLeft`).
- Wrap Latin runs inside Persian text (IATA codes, flight numbers, emails, phone numbers) in `<bdi>` or `dir="ltr"`,
  otherwise the bidi algorithm reorders neighbouring arrows and punctuation.
- Render numbers, prices, times and durations through the `lib/persian.ts` formatters (`toFaDigits`, `formatToman` /
  `formatPrice`, `formatTime`, `formatDuration`, `formatStops`). UI copy is formal written Persian.
- Design tokens live in `client/src/index.css`: `--success` marks price advantages so they don't compete with the red
  primary call to action; `--chart-*` are the validated data colours (charts never use the brand red);
  `container-page` is the page-width utility. Build pages from `PageShell`, empty/error states from `StateMessage`,
  and controls from `components/ui` (shadcn primitives already adjusted for RTL).
- Mobile is a first-class target: layouts must hold at 320–414 px without horizontal scroll.

## Constraints enforced by tooling

- Client `tsconfig.app.json` sets `erasableSyntaxOnly` (no enums, no constructor parameter properties) and
  `noUnusedLocals`/`noUnusedParameters`.
- `eslint-plugin-react-hooks` v7 treats synchronous `setState` in an effect body and impure calls like `Date.now()`
  during render as errors. Established patterns: set state only in async callbacks, `useState(() => Date.now())`,
  derive state during render (or key a component) instead of syncing it in an effect, and `useEffectEvent` for
  callbacks used inside effects.
- The server compiles to CommonJS (`module: NodeNext` without `"type": "module"`), so relative imports carry no file
  extension, except dynamic `import()`, which needs `.js`. Its `lib` predates ES2023 array methods (`findLast`,
  `findLastIndex`). `*.test.ts`, `*.int.ts` and `src/test/` are excluded from the build by `tsconfig.build.json`.

## Tests

- Server unit tests (`*.test.ts`): `node:test` + `node:assert/strict`, run by tsx, no Postgres or Redis. `app.test.ts`
  starts `createApp()` on an ephemeral port for requests rejected before touching storage; pure logic (ranking,
  grouping, alert decisions, route guides, CSV, Jalali, rendering) is tested directly.
- Server integration tests (`*.int.ts`): the first import must be `test/use-test-database.ts`, which points the app at
  `TEST_DATABASE_URL` (refused unless the database name ends in `_test`, since suites truncate every table), switches
  mail/SMS/push to memory transports and disables Redis. Suites pass `{ skip }` to `describe`, so they skip without the
  variable. `test/harness.ts` provides `startServer`, `TestClient` (cookie jar; an `ip` argument isolates per-IP rate
  limits), `createAccount`, `signIn` and `createListing`. Read sent messages from `mailOutbox`/`smsOutbox`/`pushOutbox`
  after `drainBackgroundTasks()`.
- Client: Vitest in the `node` environment, `src/**/*.test.ts` only — pure logic (Jalali calendar, formatting, URL
  state, error mapping, push key decoding); there is no DOM/component test setup.
