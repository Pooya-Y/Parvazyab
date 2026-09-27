# Parvazyab (پروازیاب)

A Persian (RTL) flight-price comparison site: one card per real flight, with the prices every agency sells it for.

## What it does

- **Travellers:** one-way and round-trip search with a price calendar, date strip and 60-day price trend; filters
  for stops, airlines, cabin, charter/scheduled fares and departure/arrival time; cheapest destinations from a
  city; saved flights; price-drop alerts by in-app inbox, email and browser push; shareable searches and flights;
  agency profiles with reviews. Sign in by SMS code or email and password (with verification and reset).
- **Agencies:** listings by form, CSV/JSON import and export (Jalali dates accepted), an API with keys and an
  OpenAPI document, buy-click analytics, a public profile, replies to reviews, and verification requests.
- **Administrators:** suspension of accounts and listings, review reports, agency verification and an audit log.
- **Everyone:** an installable app that opens offline, and server-rendered route guides (`/flights/thr-mhd`)
  with a sitemap for search engines.

## Stack

- **Client:** React 19, Vite, TypeScript, Tailwind CSS 4, Radix/shadcn primitives, self-hosted Vazirmatn font; a
  hand-written service worker (production builds only)
- **Server:** Express 5, TypeScript, PostgreSQL (TypeORM), Redis (ioredis) cache, Zod validation; a separate
  worker process for scheduled jobs
- **Auth:** JWT (HS256) in an httpOnly, SameSite=Lax cookie, revocable per account; bcrypt password hashes;
  one-time SMS codes
- **Deploy:** Docker Compose — nginx serves the app, proxies `/api` and the server-rendered pages

## Run with Docker

```bash
cp .env.example .env   # then set JWT_SECRET: 32+ random characters (the command to generate one is in the file)
docker compose up -d --build
```

Open http://localhost:8080. On startup the API applies migrations and, with `SEED_DEMO_DATA=true` (the default in
Compose), creates demo data; the worker keeps a rolling two-week demo timetable.

If `up` stops with "dependency failed to start: container …-api-1 is unhealthy", run `docker compose logs api`:
the API names any invalid setting in `.env` (most often a `JWT_SECRET` shorter than 32 characters) and exits.

Demo accounts (password `Demo1234!`):

- Agency: `skybazaar@example.com`, `parvazino@example.com`
- User: `user@example.com`

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` (12+ characters) in `.env` to create an admin account on startup.
Behind HTTPS, set `COOKIE_SECURE=true`.

Email, SMS and push work out of the box in "console" mode (the API logs that a message was due). `.env.example`
explains each real transport: SMTP (with an optional local Mailpit inbox: `docker compose --profile mail up -d`),
Kavenegar for SMS, and VAPID keys for browser push.

## Local development

```bash
npm install
cp server/.env.example server/.env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis   # on 127.0.0.1:55432 / :56379
npm run dev:server        # API on :4000 (tsx watch)
npm run dev:worker        # scheduled jobs (price snapshots, alerts, clean-up)
npm run dev               # Vite on :5173; proxies /api and the server-rendered pages to :4000
```

`VITE_API_PROXY` changes the dev proxy target (e.g. `http://localhost:8080` to use the Dockerized API).
`VITE_API_URL` sets the API base URL for a separately hosted API (default `/api`).
With the console transports, sign-in codes and emailed links appear in the API log.

## Scripts (repository root)

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run build`     | Production build of client and server                     |
| `npm run typecheck` | TypeScript checks for both workspaces                     |
| `npm test`          | Server unit tests (`node:test`) and client tests (Vitest) |
| `npm run test:int`  | Server integration tests against PostgreSQL (see below)   |
| `npm run lint`      | ESLint for the client                                     |

Unit tests need no database. Integration tests (`server/src/**/*.int.ts`) start the API against a real database
named in `TEST_DATABASE_URL`, which they wipe — its name must end in `_test`:

```bash
TEST_DATABASE_URL=postgres://parvazyab:parvazyab@127.0.0.1:55432/parvazyab_test npm run test:int
```

## Architecture

```text
client/src/
  pages/              Route components (lazy-loaded); dashboard/ holds the account, agency and admin screens
  components/         Search, flights, alerts, agencies, admin, auth, charts, layout, ui (vendored shadcn)
  hooks/              Auth, saved flights, notifications, PWA install/online state
  lib/                Typed API client, fetch hook, Persian/Jalali formatting, URL search state, push, errors
client/public/        Service worker, offline page, manifest, icons, font

server/src/
  api/                Routers and Zod schemas (HTTP boundary); v1Routes is the agency API
  auth/               Sessions, one-time tokens, SMS codes
  services/           Search/ranking, calendars, trends, alerts, clicks, import, agencies, moderation, push
  notify/             Mail, SMS and push transports, email templates
  seo/                Server-rendered route guides, sitemap, robots.txt
  jobs/               Scheduler for the worker (one run at a time across replicas)
  database/           TypeORM entities, data source, migrations, seed
  domain/             Airports, airlines, ranking weights, Tehran time, Jalali calendar, formatting
```

### Conventions

- **Times are Iran time.** Iran uses a fixed UTC+03:30 offset, so date/hour filters and displays use it
  explicitly — never the server's or browser's time zone. Dates travel as Gregorian `yyyy-mm-dd` keys and are
  shown in the Jalali calendar.
- **One visibility rule.** Every traveller-facing read (search, calendars, trends, alerts, route guides, the buy
  redirect) uses `services/visibility.ts`: active, not departed, and neither the listing nor its agency suspended.
- **Search state lives in the URL**, so results survive reloads and can be shared.
- **Errors are codes.** The API returns stable codes; the client maps them to Persian messages in
  `client/src/lib/errors.ts`. Internal error text is never sent.
- Search results are cached in Redis for 30 s per route/day, and derived data (calendars, trends, guides) briefly;
  listing writes invalidate them. The API keeps working without Redis.
