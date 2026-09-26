# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Parvazyab (پروازیاب) is a Persian, RTL-first flight-price comparison site. Agencies publish flight listings; search
merges listings that are the same real flight into one card showing every agency's price, ranks the cards, and links
out to the agency to buy. npm workspaces: `client/` (React 19, Vite, Tailwind 4, shadcn/Radix) and `server/`
(Express 5, TypeORM + PostgreSQL, Redis cache, Zod). One lockfile, at the root.

## Commands

Run from the repository root unless noted.

```bash
npm install                     # all workspaces
npm run dev:server              # API on :4000 (tsx watch); reads server/.env; needs Postgres + Redis
npm run dev                     # Vite on :5173; proxies /api to $VITE_API_PROXY (default http://localhost:4000)
npm run typecheck               # tsc for client and server
npm run lint                    # ESLint (client only)
npm test                        # server tests (node:test via tsx), then client tests (Vitest)
npm run build                   # production builds of both workspaces
npm run seed -w server          # seed demo data without starting the API
docker compose up -d --build    # full stack at http://localhost:8080; needs JWT_SECRET in a root .env (see .env.example)
```

Single tests:

```bash
cd server && npx tsx --test src/services/flightsCore.test.ts
cd server && npx tsx --test --test-name-pattern="Tehran" src/services/flightsCore.test.ts
cd client && npx vitest run src/lib/persian.test.ts
cd client && npx vitest run src/lib/search-state.test.ts -t "route problems"
```

- Add dependencies from the root with `npm install <pkg> -w client` / `-w server`. Both Dockerfiles use the repo root as
  build context and run `npm ci --workspace …` against the root lockfile, so an out-of-sync lockfile breaks the image
  build.
- `docker-compose.yml` does not publish the Postgres/Redis ports. `npm run dev:server` needs local instances (defaults
  in `server/.env.example`). To work on the UI against the Dockerized API instead:
  `VITE_API_PROXY=http://localhost:8080 npm run dev`.
- :8080 serves a built client image; client changes show up there only after `docker compose up -d --build client`.
- `GET /api/health` reports `db`/`cache` status and backs the Docker healthcheck.
- With `SEED_DEMO_DATA=true` (the Compose default) the API seeds demo data on startup: agencies
  `skybazaar@example.com` and `parvazino@example.com`, user `user@example.com`, all with password `Demo1234!`.
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` create an admin account on startup.
- Formatting: root `.prettierrc` (printWidth 120). `client/src/components/ui/` is vendored shadcn code in its own
  style — don't reformat it.

## Architecture

### Server request path

`server.ts` initializes TypeORM, runs pending migrations, optionally seeds, then connects Redis (optional: when it is
down, `services/redis.ts#cached` falls through to the loader). `app.ts` mounts middleware and `api/router.ts`. Routers
(`api/*Routes.ts`) stay thin: parse input with the Zod schemas in `api/schemas.ts`, call a service, serialize. Express 5
forwards thrown and rejected errors to `http/errors.ts#errorHandler`, the only place that shapes error responses.

### Flight search pipeline (`server/src/services`)

1. `flightService.loadRouteFlights(origin, dest, date?)` loads active, not-yet-departed listings for the route
   (optionally one Iran calendar day), attaches agency names, canonicalizes airline spellings
   (`domain/airlineRegistry.ts`), and groups them. The result is cached in Redis for 30 s under the `search:` prefix.
2. `flightsCore.groupOffersByFlight` merges listings into one `FlightCard` per real flight. Identity is
   `airline__flightNo__departureMinute`, and that string is also the flight `id` used in URLs and stored as `flightKey`
   for saved flights — changing the format breaks saved flights and shared links.
3. `applyFilters` → `rankFlights` (score from `domain/rankingWeights.ts`, plus Persian badges and "why" reasons computed
   relative to the filtered set) → `sortFlights`.
4. `searchFacets` is derived from the same cached route set. Every listing write must call
   `invalidate(SEARCH_CACHE_PREFIX)` (see `services/accountService.ts`).

The flight detail page re-runs the route search and picks the card by id; the client does not use
`/api/flights/:routeKey/:flightId`.

### Data layer

Entities are TypeORM `EntitySchema`s (no decorators) in `database/entities.ts`, mapped to the snake_case columns of the
SQL migrations via explicit `name:`; `synchronize` is off. A schema change needs a migration class in
`database/migrations/` **and** an entry in the `migrations` array of `database/dataSource.ts` (classes rather than
globs, so the same list works under tsx and in compiled `dist`). `bigint` price columns are converted to numbers by a
transformer. Use the repository helpers exported from `dataSource.ts` (`accounts()`, `flightListings()`, …).

### Auth

JWT (HS256) in the httpOnly cookie `parvazyab_session`. `requireUser` loads the account into `res.locals.user`,
`requireRole(...)` guards routes, and handlers read the user with `sessionUser(res)`. `sanitizeUser` adds
`accountRole` (`"agency" | "user"`): the client checks `role === "admin"` for admin features and
`accountRole === "agency"` for agency features. Only credential endpoints use the strict rate limiter — `/auth/me` is
called on every page load and must not be behind it.

### Client

- `lib/api.ts` is the only code that calls `fetch`; failures throw `ApiError(status, code, details)`. Response types in
  `lib/types.ts` mirror the server by hand (there is no shared package) — update them with any API change. All
  timestamps in API responses are epoch milliseconds.
- `lib/use-api-query.ts` is the data hook (no React Query). A string key identifies the request (`null` skips it); a
  new key aborts the in-flight request so stale responses can't win; previous data stays visible while refetching;
  `invalidate(tag)` refetches subscribers; `setData` applies a mutation's result locally.
- Session state comes from `AuthProvider` (`hooks/use-auth.tsx`, one `/auth/me` per load) and saved-flight state from
  `hooks/use-saved-flights.ts`. Presentational components such as `FlightCard` receive data and callbacks as props
  instead of fetching.
- Search state lives in the URL. `lib/search-state.ts` parses and serializes it (`from, to, date, sort, stops,
  airlines, maxPrice, time`) and maps it to API params. `pages/Search.tsx` remounts the results per route so a new
  route shows skeletons instead of the previous route's flights.

## Cross-cutting conventions

- **Iran time everywhere.** Iran is fixed at UTC+03:30 (no DST since 2022). Server `domain/time.ts` and client
  `lib/persian.ts` apply the offset explicitly. Never use local-time `Date` APIs (`getHours`, `new Date(y, m, d)`,
  `toLocaleString`) for flight times or date filters — the server runs in UTC and users may be abroad. Dates travel as
  Gregorian `yyyy-mm-dd` keys and are displayed in the Jalali calendar through `lib/persian.ts`, which converts
  arithmetically.
- **Errors are codes.** Throw `new HttpError(status, "CODE")` on the server. Zod refinement messages are codes too (e.g.
  `UNKNOWN_AIRPORT`) and reach the client in `details` as `"field: CODE"`. Every user-facing code needs a Persian
  message in `client/src/lib/errors.ts`. Unexpected errors become a generic 500; never send internal messages.
- **Booking links are http(s) only**: `httpUrl` in `api/schemas.ts` on write, `safeExternalUrl` on the client before
  rendering any link from the API.
- **Airport data is duplicated**: `server/src/domain/airports.ts` is what the API validates against;
  `client/src/domain/airports.ts` adds English names for search. Change both together.

## UI conventions (Persian / RTL)

- The document is `dir="rtl"` and Radix is wrapped in `DirectionProvider dir="rtl"`. Use logical Tailwind utilities
  (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, `text-start`), not `left`/`right`/`ml`/`mr`/`pl`/`pr`. Pick directional
  icons for RTL (previous = `ChevronRight`, next = `ChevronLeft`).
- Wrap Latin runs inside Persian text (IATA codes, flight numbers, emails) in `<bdi>` or `dir="ltr"`, otherwise the bidi
  algorithm reorders neighbouring arrows and punctuation.
- Render numbers, prices, times and durations through the `lib/persian.ts` formatters (`toFaDigits`, `formatToman` /
  `formatPrice`, `formatTime`, `formatDuration`, `formatStops`). UI copy is formal written Persian.
- Design tokens live in `client/src/index.css`: `--success` marks price advantages so they don't compete with the red
  primary call to action; `container-page` is the page-width utility. Build pages from `PageShell`, empty/error states
  from `StateMessage`, and controls from `components/ui` (shadcn primitives already adjusted for RTL).
- Mobile is a first-class target: layouts must hold at 320–414 px without horizontal scroll.

## Constraints enforced by tooling

- Client `tsconfig.app.json` sets `erasableSyntaxOnly` (no enums, no constructor parameter properties) and
  `noUnusedLocals`/`noUnusedParameters`.
- `eslint-plugin-react-hooks` v7 treats synchronous `setState` in an effect body and impure calls like `Date.now()`
  during render as errors. Established patterns: set state only in async callbacks, `useState(() => Date.now())`, and
  `useEffectEvent` for callbacks used inside effects.
- The server compiles to CommonJS (`module: NodeNext` without `"type": "module"`), so relative imports carry no file
  extension. `*.test.ts` files sit next to the code and are excluded from the build by `tsconfig.build.json`.

## Tests

- Server: `node:test` + `node:assert/strict`, run by tsx, with no Postgres or Redis needed — `app.test.ts` starts
  `createApp()` on an ephemeral port and only sends requests that are rejected before touching storage. There are no
  database integration tests; check DB-touching changes against the Docker stack.
- Client: Vitest in the `node` environment, `src/**/*.test.ts` only. Tests cover pure logic (Jalali calendar,
  formatting, URL state, error mapping); there is no DOM/component test setup.
