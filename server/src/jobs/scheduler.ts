import { AppDataSource } from "../database/dataSource";

export interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
  /** Run shortly after start instead of waiting a full interval. */
  runAtStart?: boolean;
}

const log = (message: string) => console.log(`[worker] ${new Date().toISOString()} ${message}`);

/**
 * Minimal in-process scheduler for the worker.
 * - The next run is scheduled only after the previous one finishes, so a slow
 *   run never overlaps itself.
 * - Each run holds a Postgres advisory lock on its own connection, so several
 *   worker replicas never run the same job at once.
 */
export class Scheduler {
  private timers = new Set<NodeJS.Timeout>();
  private inFlight = new Set<Promise<void>>();
  private stopped = false;

  add(job: Job): this {
    // A little jitter keeps replicas from hammering the lock at the same instant.
    const first = job.runAtStart ? 1_000 + Math.random() * 4_000 : job.everyMs;
    this.schedule(job, first);
    return this;
  }

  private schedule(job: Job, delay: number) {
    if (this.stopped) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const run = this.execute(job).finally(() => {
        this.inFlight.delete(run);
        this.schedule(job, job.everyMs);
      });
      this.inFlight.add(run);
    }, delay);
    this.timers.add(timer);
  }

  private async execute(job: Job): Promise<void> {
    const runner = AppDataSource.createQueryRunner();
    const lockKey = `job:${job.name}`;
    try {
      await runner.connect();
      const [{ locked }] = (await runner.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [lockKey])) as {
        locked: boolean;
      }[];
      if (!locked) {
        log(`${job.name} skipped (running elsewhere)`);
        return;
      }
      const started = Date.now();
      try {
        const result = await job.run();
        log(`${job.name} ok in ${Date.now() - started}ms${result === undefined ? "" : ` (${String(result)})`}`);
      } catch (err) {
        console.error(`[worker] ${job.name} failed`, err);
      } finally {
        await runner.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      }
    } catch (err) {
      console.error(`[worker] ${job.name} could not run`, err);
    } finally {
      await runner.release();
    }
  }

  /** Stop scheduling and wait for runs in progress. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.inFlight]);
  }
}
