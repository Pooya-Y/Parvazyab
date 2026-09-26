# Parvazyab (پروازیاب)

A Persian (RTL) flight-price comparison site: one card per real flight, with the prices every agency sells it for.

## Stack

- **Client:** React 19, Vite, TypeScript, Tailwind CSS 4, Radix/shadcn primitives, self-hosted Vazirmatn font
- **Server:** Express 5, TypeScript, PostgreSQL (TypeORM), Redis (ioredis) cache, Zod validation
- **Auth:** JWT (HS256) in an httpOnly, SameSite=Lax cookie; bcrypt password hashes
- **Deploy:** Docker Compose — nginx serves the SPA and proxies `/api`

## Run with Docker

```bash
cp .env.example .env   # then set JWT_SECRET (the command to generate one is in the file)
docker compose up -d --build
```

Open http://localhost:8080. On startup the API applies migrations and, with `SEED_DEMO_DATA=true` (the default in
Compose), creates demo data. Demo flights are regenerated relative to today whenever the demo agencies have no
upcoming flights left.

Demo accounts (password `Demo1234!`):

- Agency: `skybazaar@example.com`, `parvazino@example.com`
- User: `user@example.com`

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` (12+ characters) in `.env` to create an admin account on startup.
Behind HTTPS, set `COOKIE_SECURE=true`.

## Local development

Start PostgreSQL and Redis (e.g. `docker compose up -d postgres redis` after exposing their ports, or local
installs), then:

```bash
npm install
cp server/.env.example server/.env
npm run dev:server        # API on :4000 (tsx watch)
npm run dev               # Vite on :5173, proxies /api to :4000
```

`VITE_API_PROXY` changes the dev proxy target (e.g. `http://localhost:8080` to use the Dockerized API).
`VITE_API_URL` sets the API base URL for a separately hosted API (default `/api`).

## Scripts (repository root)

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run build`     | Production build of client and server           |
| `npm run typecheck` | TypeScript checks for both workspaces           |
| `npm test`          | Server tests (`node:test`) and client (Vitest)  |
| `npm run lint`      | ESLint for the client                           |

The server tests cover ranking/grouping/filters, Tehran-time handling, request validation and the HTTP
boundary (auth, error shapes); they need no database.

## Architecture

```text
client/src/
  pages/              Route components (lazy-loaded)
  components/flights/ Search widget, airport & Jalali date pickers, flight card, filters
  components/layout/  Header, footer, page shell
  hooks/              Auth context, saved flights, document title
  lib/                Typed API client, fetch hook, Persian/Jalali formatting, URL search state, error messages
  domain/             Static airport reference data

server/src/
  api/                Routers and Zod request schemas (HTTP boundary)
  auth/               Sessions, password hashing, role guards
  services/           Flight search/ranking, accounts/listings/admin, Redis cache
  database/           TypeORM entities, data source, migrations, seed
  domain/             Airports, airline aliases, ranking weights, Tehran time
  http/               Error type and error handler
```

### Conventions

- **Times are Iran time.** Iran uses a fixed UTC+03:30 offset, so the server's date/hour filters and the client's
  display use it explicitly — never the server's or browser's time zone. Dates travel as Gregorian `yyyy-mm-dd`
  keys and are shown in the Jalali calendar.
- **Search state lives in the URL** (`from`, `to`, `date`, `sort`, `stops`, `airlines`, `maxPrice`, `time`), so
  results survive reloads and can be shared.
- **Errors are codes.** The API returns stable codes (`INVALID_AUTHENTICATION`, `SAME_ORIGIN_DESTINATION`, …); the
  client maps them to Persian messages in `client/src/lib/errors.ts`. Internal error text is never sent.
- Search results are cached in Redis for 30 s per route/day; listing writes invalidate them. The API keeps working
  without Redis.
