/**
 * Work that must not hold up the response: sending mail, or anything whose
 * duration would reveal something (the forgot-password endpoint answers the same
 * way, equally fast, whether or not the email has an account). Failures are
 * logged, never surfaced to the client.
 */
const pending = new Set<Promise<void>>();

export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const promise: Promise<void> = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (err: unknown) => console.error(`Background task "${label}" failed`, err),
    )
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

/** Resolves once every queued task, including ones queued meanwhile, has settled (shutdown, tests). */
export async function drainBackgroundTasks(): Promise<void> {
  while (pending.size) await Promise.all(pending);
}
