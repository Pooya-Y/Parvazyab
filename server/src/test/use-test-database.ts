/**
 * Must be the first import of every `*.int.ts` file: it points the app's config at
 * TEST_DATABASE_URL before any module reads `process.env`.
 */
const url = process.env.TEST_DATABASE_URL;

/** Pass as `{ skip }` to `describe` so integration suites skip cleanly without a database. */
export const skip: string | false = url ? false : "TEST_DATABASE_URL is not set";

if (url) {
  const database = new URL(url).pathname.replace(/^\//, "");
  // Every suite truncates all tables, so never let a real database be targeted by mistake.
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to run integration tests against "${database}": the name must end with _test`);
  }
  process.env.DATABASE_URL = url;
}
process.env.NODE_ENV = "test";
// Captured in memory so tests can read the links that would have been emailed.
process.env.MAIL_TRANSPORT = "memory";
process.env.SMS_TRANSPORT = "memory";
// Redis is never connected in tests; the cache layer then falls through to the database.
process.env.REDIS_URL = "redis://127.0.0.1:1";
